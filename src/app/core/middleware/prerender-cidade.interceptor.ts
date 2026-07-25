import { Injectable } from '@angular/core';
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

/**
 * Interceptor SÓ-SERVER (registrado apenas em app.config.server.ts) — resolve o
 * bloqueador da Fase 2 (Auditoria2): o prerender de ~880 cidades fazia ~880 GET
 * /v2/Igreja/cidade/... contra a API prod e estourava o rate limit (429),
 * assando páginas de erro no HTML estático.
 *
 * Aqui, a PRIMEIRA chamada de cidade dispara UM fetch ao bulk `/v2/seo/cidades`
 * (todas as cidades de uma vez, cacheado numa Promise). As 880 chamadas passam a
 * ser servidas da memória, com o MESMO envelope que /v2/Igreja/cidade/{uf}/{slug}
 * devolve (`{ data: { cidade, uf, igrejas, seo } }`) — o componente não muda.
 *
 * No browser este interceptor NÃO existe (não é registrado no config do browser),
 * então em runtime as chamadas seguem normalmente para a API.
 *
 * Degrada com segurança: se o bulk falhar, cai para a chamada individual (next).
 */

interface CidadePayload {
  uf: string;
  cidadeSlug: string;
  cidade: string;
  seo: unknown;
  igrejas: unknown[];
}

/** Base absoluta da API sem o sufixo /api — /v2/seo/cidades é rota absoluta. */
function baseUrl(): string {
  return String(environment.config.apiURL ?? '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
}

/** Cache da Promise do mapa (1 fetch por build, mesmo com 880 cidades). */
let cacheMapa: Promise<Map<string, CidadePayload>> | null = null;

/**
 * Lê o bulk do disco (gravado por scripts/baixar-bulk-prerender.mjs no prebuild).
 * Preferimos disco a `fetch` porque a rede DURANTE o render, contra uma API lenta,
 * estoura o timeout de rota do Angular e derruba o build inteiro. Retorna null se
 * o arquivo não existe (ex.: build:dev) → cai no fetch ao vivo.
 */
function lerDoDisco(): CidadePayload[] | null {
  const arquivo = join(process.cwd(), '.prerender-cache', 'cidades.json');
  if (!existsSync(arquivo)) return null;
  return JSON.parse(readFileSync(arquivo, 'utf-8')) as CidadePayload[];
}

async function carregarMapa(): Promise<Map<string, CidadePayload>> {
  const inicio = Date.now();
  let lista = lerDoDisco();
  const origem = lista ? 'disco (.prerender-cache)' : 'bulk /v2/seo/cidades';
  if (!lista) {
    const res = await fetch(`${baseUrl()}/v2/seo/cidades`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    lista = (await res.json()) as CidadePayload[];
  }

  const mapa = new Map<string, CidadePayload>();
  for (const c of Array.isArray(lista) ? lista : []) {
    if (!c?.uf || !c?.cidadeSlug) continue;
    mapa.set(`${c.uf}/${c.cidadeSlug}`.toLowerCase(), c);
  }
  console.log(
    `[prerender] ${mapa.size} cidades carregadas de ${origem} em ${Date.now() - inicio}ms.`,
  );
  return mapa;
}

function obterMapa(): Promise<Map<string, CidadePayload>> {
  if (!cacheMapa) {
    cacheMapa = carregarMapa().catch((err) => {
      cacheMapa = null; // permite nova tentativa
      console.warn(
        `[prerender] bulk /v2/seo/cidades falhou (${err?.message ?? err}) — caindo para chamadas individuais (risco de 429).`,
      );
      return new Map<string, CidadePayload>();
    });
  }
  return cacheMapa;
}

@Injectable()
export class PrerenderCidadeInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Casa tanto a URL relativa (antes do ApiBaseUrlInterceptor) quanto a absoluta.
    const m = req.url.match(/v2\/Igreja\/cidade\/([^/]+)\/([^/?]+)/i);
    if (req.method !== 'GET' || !m) return next.handle(req);

    const chave = `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}`.toLowerCase();
    return from(obterMapa()).pipe(
      switchMap((mapa) => {
        const c = mapa.get(chave);
        if (!c) return next.handle(req); // bulk fora ou cidade ausente → chamada normal
        const body = {
          data: { cidade: c.cidade, uf: c.uf.toUpperCase(), igrejas: c.igrejas, seo: c.seo },
        };
        return of(new HttpResponse({ status: 200, url: req.url, body }));
      }),
    );
  }
}
