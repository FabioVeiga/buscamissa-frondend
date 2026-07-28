import { Injectable, TransferState, inject } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, from, of, switchMap } from 'rxjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { environment } from '../../../environments/environment';
import { chaveEstado, stateKeyEstado } from './prerender-state-keys';

/**
 * Interceptor SÓ-SERVER (registrado apenas em app.config.server.ts) — serve o
 * endpoint por-item de Estado (`GET /v2/seo/estado/{uf}`) durante o prerender das
 * páginas `/missas/{uf}` (Fase 3 SEO), a partir do bulk `/v2/seo/estados` baixado
 * pro disco no prebuild. Evita ~26 fetches ao vivo durante o render.
 *
 * Diferente de cidade/paróquia: os endpoints `/v2/seo/*` devolvem o DTO CRU (sem o
 * wrapper `{ data }` do ApiResponse), então servimos o objeto direto — o MESMO
 * shape que o browser recebe do endpoint real em runtime (sem mismatch de hydration).
 *
 * No browser este interceptor NÃO existe; a chamada segue pro endpoint real.
 * Degrada com segurança: se o bulk faltar/UF ausente, cai na chamada individual (next).
 */

interface EstadoPayload {
  uf: string;
  estado: string;
  totalCidades: number;
  totalParoquias: number;
  seo: unknown;
  cidades: unknown[];
}

/** Cache da Promise do mapa (1 leitura por build). */
let cacheMapa: Promise<Map<string, EstadoPayload>> | null = null;

/** Base absoluta da API sem o sufixo /api — /v2/seo/estados é rota absoluta. */
function baseUrl(): string {
  return String(environment.config.apiURL ?? '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
}

function lerDoDisco(): EstadoPayload[] | null {
  const arquivo = join(process.cwd(), '.prerender-cache', 'estados.json');
  if (!existsSync(arquivo)) return null;
  return JSON.parse(readFileSync(arquivo, 'utf-8')) as EstadoPayload[];
}

async function carregarMapa(): Promise<Map<string, EstadoPayload>> {
  const inicio = Date.now();
  let lista = lerDoDisco();
  const origem = lista ? 'disco (.prerender-cache)' : 'bulk /v2/seo/estados';
  if (!lista) {
    const res = await fetch(`${baseUrl()}/v2/seo/estados`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    lista = (await res.json()) as EstadoPayload[];
  }

  const mapa = new Map<string, EstadoPayload>();
  for (const e of Array.isArray(lista) ? lista : []) {
    if (!e?.uf) continue;
    mapa.set(e.uf.toLowerCase(), e);
  }
  console.log(`[prerender] ${mapa.size} estados carregados de ${origem} em ${Date.now() - inicio}ms.`);
  return mapa;
}

function obterMapa(): Promise<Map<string, EstadoPayload>> {
  if (!cacheMapa) {
    cacheMapa = carregarMapa().catch((err) => {
      cacheMapa = null;
      console.warn(`[prerender] bulk /v2/seo/estados falhou (${err?.message ?? err}) — caindo para chamadas individuais.`);
      return new Map<string, EstadoPayload>();
    });
  }
  return cacheMapa;
}

@Injectable()
export class PrerenderEstadoInterceptor implements HttpInterceptor {
  private _transferState = inject(TransferState);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (req.method !== 'GET') return next.handle(req);
    const chave = chaveEstado(req.url);
    if (!chave) return next.handle(req);

    return from(obterMapa()).pipe(
      switchMap((mapa) => {
        const e = mapa.get(chave);
        if (!e) return next.handle(req); // bulk fora ou UF ausente → chamada normal
        this._transferState.set(stateKeyEstado(chave), e);
        return of(new HttpResponse({ status: 200, url: req.url, body: e }));
      }),
    );
  }
}
