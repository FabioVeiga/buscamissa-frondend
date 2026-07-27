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
import {
  chaveIntencao,
  chaveIntencaoArvore,
  stateKeyIntencao,
  stateKeyIntencaoArvore,
} from './prerender-state-keys';

/**
 * Interceptor SÓ-SERVER (registrado apenas em app.config.server.ts) — serve o
 * endpoint por-item da árvore de intenção (`GET /v2/seo/missa-dia/{dia}/{uf}/{cidade}`)
 * durante o prerender das páginas `/missa-{dia}/{uf}/{cidade}` (Fase 3 SEO), a
 * partir das árvores por dia (`missa-{dia}.json`) baixadas pro disco no prebuild.
 *
 * Cada arquivo de dia é a ÁRVORE inteira (estados → cidades → paróquias). Aqui
 * indexamos por `uf/cidade` e devolvemos só o nó da cidade (`IntencaoCidadeDto`),
 * o MESMO shape (cru) que o endpoint real por-item devolve em runtime.
 *
 * Cache por dia (1 leitura por dia por build). Degrada para `next.handle()` se o
 * arquivo do dia faltar ou a cidade não estiver na árvore.
 */

interface IntencaoCidadePayload {
  cidadeSlug: string;
  cidade: string;
  seo: unknown;
  paroquias: unknown[];
}

interface ArvoreDia {
  estados?: Array<{ uf: string; cidades?: IntencaoCidadePayload[] }>;
}

/** Cache por dia da Promise do mapa `uf/cidade` → cidade (folha). */
const cachePorDia = new Map<string, Promise<Map<string, IntencaoCidadePayload>>>();
/** Cache por dia da Promise da árvore completa (hubs nacional/UF). */
const cacheArvorePorDia = new Map<string, Promise<ArvoreDia>>();

function baseUrl(): string {
  return String(environment.config.apiURL ?? '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
}

function lerDoDisco(dia: string): ArvoreDia | null {
  const arquivo = join(process.cwd(), '.prerender-cache', `missa-${dia}.json`);
  if (!existsSync(arquivo)) return null;
  return JSON.parse(readFileSync(arquivo, 'utf-8')) as ArvoreDia;
}

/** Árvore do dia — disco (cache do prebuild), senão bulk ao vivo. */
async function carregarArvore(dia: string): Promise<ArvoreDia> {
  const disco = lerDoDisco(dia);
  if (disco) return disco;
  const res = await fetch(`${baseUrl()}/v2/seo/missa-dia/${dia}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as ArvoreDia;
}

function obterArvore(dia: string): Promise<ArvoreDia> {
  let p = cacheArvorePorDia.get(dia);
  if (!p) {
    p = carregarArvore(dia).catch((err) => {
      cacheArvorePorDia.delete(dia);
      console.warn(`[prerender] árvore de intenção (${dia}) falhou (${err?.message ?? err}) — caindo para chamada individual.`);
      return {} as ArvoreDia;
    });
    cacheArvorePorDia.set(dia, p);
  }
  return p;
}

async function carregarMapa(dia: string): Promise<Map<string, IntencaoCidadePayload>> {
  const inicio = Date.now();
  const arvore = await obterArvore(dia);

  const mapa = new Map<string, IntencaoCidadePayload>();
  for (const estado of arvore?.estados ?? []) {
    const uf = estado?.uf?.toLowerCase();
    if (!uf) continue;
    for (const cidade of estado.cidades ?? []) {
      if (!cidade?.cidadeSlug) continue;
      mapa.set(`${dia}/${uf}/${cidade.cidadeSlug.toLowerCase()}`, cidade);
    }
  }
  console.log(`[prerender] ${mapa.size} cidades de intenção (${dia}) em ${Date.now() - inicio}ms.`);
  return mapa;
}

function obterMapa(dia: string): Promise<Map<string, IntencaoCidadePayload>> {
  let p = cachePorDia.get(dia);
  if (!p) {
    p = carregarMapa(dia).catch((err) => {
      cachePorDia.delete(dia);
      console.warn(`[prerender] árvore de intenção (${dia}) falhou (${err?.message ?? err}) — caindo para chamadas individuais.`);
      return new Map<string, IntencaoCidadePayload>();
    });
    cachePorDia.set(dia, p);
  }
  return p;
}

@Injectable()
export class PrerenderIntencaoInterceptor implements HttpInterceptor {
  private _transferState = inject(TransferState);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (req.method !== 'GET') return next.handle(req);

    // Folha: /v2/seo/missa-dia/{dia}/{uf}/{cidade} → devolve o nó da cidade.
    const chaveFolha = chaveIntencao(req.url);
    if (chaveFolha) {
      const dia = chaveFolha.split('/')[0];
      return from(obterMapa(dia)).pipe(
        switchMap((mapa) => {
          const cidade = mapa.get(chaveFolha);
          if (!cidade) return next.handle(req); // cidade sem missa no dia → chamada normal
          this._transferState.set(stateKeyIntencao(chaveFolha), cidade);
          return of(new HttpResponse({ status: 200, url: req.url, body: cidade }));
        }),
      );
    }

    // Hub: /v2/seo/missa-dia/{dia} → devolve a árvore inteira do dia.
    const chaveArvore = chaveIntencaoArvore(req.url);
    if (chaveArvore) {
      return from(obterArvore(chaveArvore)).pipe(
        switchMap((arvore) => {
          if (!arvore?.estados?.length) return next.handle(req); // árvore fora → chamada normal
          this._transferState.set(stateKeyIntencaoArvore(chaveArvore), arvore);
          return of(new HttpResponse({ status: 200, url: req.url, body: arvore }));
        }),
      );
    }

    return next.handle(req);
  }
}
