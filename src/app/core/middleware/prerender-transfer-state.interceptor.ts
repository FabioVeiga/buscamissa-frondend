import { Injectable, PLATFORM_ID, TransferState, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, of, concat, EMPTY } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { StateKey } from '@angular/core';
import {
  chaveParoquia,
  chaveCidade,
  chaveEstado,
  chaveIntencao,
  chaveIntencaoArvore,
  stateKeyParoquia,
  stateKeyCidade,
  stateKeyEstado,
  stateKeyIntencao,
  stateKeyIntencaoArvore,
} from './prerender-state-keys';

/** Resolve a StateKey da resposta prerenderizada a partir da URL, ou null. */
function resolverStateKey(url: string): StateKey<unknown> | null {
  const cp = chaveParoquia(url);
  if (cp) return stateKeyParoquia(cp);
  const cc = chaveCidade(url);
  if (cc) return stateKeyCidade(cc);
  const ci = chaveIntencao(url); // dia/uf/cidade (folha) — antes da árvore e do estado
  if (ci) return stateKeyIntencao(ci);
  const cia = chaveIntencaoArvore(url); // dia (hub) — antes do estado
  if (cia) return stateKeyIntencaoArvore(cia);
  const ce = chaveEstado(url);
  if (ce) return stateKeyEstado(ce);
  return null;
}

/**
 * Interceptor de LEITURA do TransferState (roda no browser). Complementa os
 * interceptors de prerender (server), que ESCREVEM o dado de paróquia/cidade no
 * TransferState durante o prerender.
 *
 * SWR (stale-while-revalidate): na hidratação, emite o corpo do TransferState de
 * forma SÍNCRONA (paint instantâneo do conteúdo prerenderizado — sem skeleton, sem
 * CLS) E em seguida revalida ao vivo na API, reconciliando o que mudou. Assim o
 * visitante vê o dado editado no admin SEM esperar um novo deploy (frescor ≤ ~30s do
 * ResponseCache dos endpoints), preservando o SEO/CWV do prerender.
 *
 * - `catchError(() => EMPTY)` na 2ª perna: uma revalidação que falha (offline/500)
 *   NUNCA vira erro da página já renderizada — o conteúdo do prerender permanece.
 *   NÃO remover: sem isto a tela cairia no "Tentar novamente" mesmo já mostrando dados.
 * - `remove(key)` no `finalize` da 2ª perna: consome a chave uma vez, mas só ao FIM
 *   da revalidação (se a subscription for cancelada antes — troca rápida de rota —
 *   o TransferState não é descartado prematuramente).
 * - Navegações client posteriores não têm chave → chamada normal à API (dado fresco).
 *
 * Registrado só no config do browser. Os componentes (details/city) reatribuem o
 * dado nas duas emissões e protegem só os efeitos únicos (analytics/métricas).
 */
@Injectable()
export class PrerenderTransferStateInterceptor implements HttpInterceptor {
  private _transferState = inject(TransferState);
  private _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this._isBrowser || req.method !== 'GET') return next.handle(req);

    const key = resolverStateKey(req.url);
    if (!key) return next.handle(req);

    if (!this._transferState.hasKey(key)) return next.handle(req);
    const body = this._transferState.get(key, null);
    if (body == null) {
      this._transferState.remove(key);
      return next.handle(req);
    }

    const cached = new HttpResponse({ status: 200, url: req.url, body });
    return concat(
      of(cached), // paint instantâneo (0ms, sem skeleton) — nunca falha
      next.handle(req).pipe(
        // 2ª perna: revalidação viva (a única que pode falhar). Falha NÃO derruba o
        // conteúdo já renderizado — ver comentário do cabeçalho.
        catchError(() => EMPTY),
        // Consome a chave só ao fim da revalidação (robusto a cancelamento).
        finalize(() => this._transferState.remove(key)),
      ),
    );
  }
}
