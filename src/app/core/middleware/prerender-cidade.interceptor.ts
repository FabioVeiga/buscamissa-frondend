import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, from, of, switchMap } from 'rxjs';
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

async function carregarMapa(): Promise<Map<string, CidadePayload>> {
  const url = `${baseUrl()}/v2/seo/cidades`;
  const inicio = Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const lista = (await res.json()) as CidadePayload[];

  const mapa = new Map<string, CidadePayload>();
  for (const c of Array.isArray(lista) ? lista : []) {
    if (!c?.uf || !c?.cidadeSlug) continue;
    mapa.set(`${c.uf}/${c.cidadeSlug}`.toLowerCase(), c);
  }
  console.log(
    `[prerender] ${mapa.size} cidades carregadas do bulk /v2/seo/cidades em ${Date.now() - inicio}ms.`,
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
