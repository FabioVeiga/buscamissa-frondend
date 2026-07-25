import { Injectable, PLATFORM_ID, TransferState, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, of } from 'rxjs';
import {
  chaveParoquia,
  chaveCidade,
  stateKeyParoquia,
  stateKeyCidade,
} from './prerender-state-keys';

/**
 * Interceptor de LEITURA do TransferState (roda no browser). Complementa os
 * interceptors de prerender (server), que ESCREVEM o dado de paróquia/cidade no
 * TransferState durante o prerender.
 *
 * Na hidratação, serve o GET de paróquia/cidade a partir do TransferState de forma
 * SÍNCRONA (`of`), então o details resolve o getByCidadeESlug na hora → `isLoading`
 * fica true por ~0ms → NÃO mostra o skeleton por cima do conteúdo prerenderizado
 * (elimina o flash + o CLS) e evita o request duplicado à API.
 *
 * Consome a chave uma única vez (remove do state): navegações posteriores fazem a
 * chamada normal à API (dado fresco). Registrado só no config do browser.
 */
@Injectable()
export class PrerenderTransferStateInterceptor implements HttpInterceptor {
  private _transferState = inject(TransferState);
  private _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this._isBrowser || req.method !== 'GET') return next.handle(req);

    const cp = chaveParoquia(req.url);
    const key = cp ? stateKeyParoquia(cp) : (() => {
      const cc = chaveCidade(req.url);
      return cc ? stateKeyCidade(cc) : null;
    })();
    if (!key) return next.handle(req);

    if (!this._transferState.hasKey(key)) return next.handle(req);
    const body = this._transferState.get(key, null);
    this._transferState.remove(key); // usa uma vez; próximas navegações buscam fresco
    if (body == null) return next.handle(req);
    return of(new HttpResponse({ status: 200, url: req.url, body }));
  }
}
