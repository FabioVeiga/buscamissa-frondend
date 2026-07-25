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
 * bloqueador da Fase 2.5 (Auditoria2): o prerender de ~4.4k paróquias faria ~4.4k
 * GET /v2/Igreja/paroquia/... contra a API prod e estouraria o rate limit (429),
 * assando páginas de erro no HTML estático.
 *
 * Aqui, a PRIMEIRA chamada de paróquia dispara UM fetch ao bulk /v2/seo/paroquias
 * (todas as paróquias de uma vez, cacheado numa Promise). As ~4.4k chamadas passam
 * a ser servidas da memória, com o MESMO envelope que /v2/Igreja/paroquia/{uf}/{cidade}/{slug}
 * devolve (`{ data: { igreja, seo } }`) — o componente não muda e não há mismatch
 * de hydration.
 *
 * No browser este interceptor NÃO existe (não é registrado no config do browser),
 * então em runtime as chamadas seguem normalmente para a API.
 *
 * Degrada com segurança: se o bulk falhar, cai para a chamada individual (next).
 */

interface ParoquiaPayload {
  uf: string;
  cidadeSlug: string;
  slug: string;
  igreja: unknown;
  seo: unknown;
}

/** Base absoluta da API sem o sufixo /api — /v2/seo/paroquias é rota absoluta. */
function baseUrl(): string {
  return String(environment.config.apiURL ?? '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
}

/** Cache da Promise do mapa (1 fetch por build, mesmo com ~4.4k paróquias). */
let cacheMapa: Promise<Map<string, ParoquiaPayload>> | null = null;

/**
 * Lê o bulk do disco (gravado por scripts/baixar-bulk-prerender.mjs no prebuild).
 * Preferimos disco a `fetch` porque a rede DURANTE o render, contra uma API lenta,
 * estoura o timeout de rota do Angular e derruba o build inteiro. Retorna null se
 * o arquivo não existe (ex.: build:dev) → cai no fetch ao vivo.
 */
function lerDoDisco(): ParoquiaPayload[] | null {
  const arquivo = join(process.cwd(), '.prerender-cache', 'paroquias.json');
  if (!existsSync(arquivo)) return null;
  return JSON.parse(readFileSync(arquivo, 'utf-8')) as ParoquiaPayload[];
}

async function carregarMapa(): Promise<Map<string, ParoquiaPayload>> {
  const inicio = Date.now();
  let lista = lerDoDisco();
  const origem = lista ? 'disco (.prerender-cache)' : 'bulk /v2/seo/paroquias';
  if (!lista) {
    const res = await fetch(`${baseUrl()}/v2/seo/paroquias`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    lista = (await res.json()) as ParoquiaPayload[];
  }

  const mapa = new Map<string, ParoquiaPayload>();
  for (const p of Array.isArray(lista) ? lista : []) {
    if (!p?.uf || !p?.cidadeSlug || !p?.slug) continue;
    mapa.set(`${p.uf}/${p.cidadeSlug}/${p.slug}`.toLowerCase(), p);
  }
  console.log(
    `[prerender] ${mapa.size} paróquias carregadas de ${origem} em ${Date.now() - inicio}ms.`,
  );
  return mapa;
}

function obterMapa(): Promise<Map<string, ParoquiaPayload>> {
  if (!cacheMapa) {
    cacheMapa = carregarMapa().catch((err) => {
      cacheMapa = null; // permite nova tentativa
      console.warn(
        `[prerender] bulk /v2/seo/paroquias falhou (${err?.message ?? err}) — caindo para chamadas individuais (risco de 429).`,
      );
      return new Map<string, ParoquiaPayload>();
    });
  }
  return cacheMapa;
}

@Injectable()
export class PrerenderParoquiaInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Casa tanto a URL relativa (antes do ApiBaseUrlInterceptor) quanto a absoluta.
    const m = req.url.match(/v2\/Igreja\/paroquia\/([^/]+)\/([^/]+)\/([^/?]+)/i);
    if (req.method !== 'GET' || !m) return next.handle(req);

    const chave =
      `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}/${decodeURIComponent(m[3])}`.toLowerCase();
    return from(obterMapa()).pipe(
      switchMap((mapa) => {
        const p = mapa.get(chave);
        if (!p) return next.handle(req); // bulk fora ou paróquia ausente → chamada normal
        const body = { data: { igreja: p.igreja, seo: p.seo } };
        return of(new HttpResponse({ status: 200, url: req.url, body }));
      }),
    );
  }
}
