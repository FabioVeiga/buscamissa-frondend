import { Injectable, TransferState, inject } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, from, of, switchMap } from 'rxjs';
import { chaveEstado, stateKeyEstado } from './prerender-state-keys';
import { obterMapaEstados } from './prerender-estados-bulk';

/**
 * Interceptor SÓ-SERVER (registrado apenas em app.config.server.ts) — serve o
 * endpoint por-item de Estado (`GET /v2/seo/estado/{uf}`) durante o prerender das
 * páginas `/missas/{uf}` (Fase 3 SEO), a partir do bulk `/v2/seo/estados` baixado
 * pro disco no prebuild. Evita ~26 fetches ao vivo durante o render.
 *
 * A leitura do bulk mora em `prerender-estados-bulk.ts`, compartilhada com o
 * interceptor que serve o BULK para a página `/estados`.
 *
 * Diferente de cidade/paróquia: os endpoints `/v2/seo/*` devolvem o DTO CRU (sem o
 * wrapper `{ data }` do ApiResponse), então servimos o objeto direto — o MESMO
 * shape que o browser recebe do endpoint real em runtime (sem mismatch de hydration).
 *
 * No browser este interceptor NÃO existe; a chamada segue pro endpoint real.
 * Degrada com segurança: se o bulk faltar/UF ausente, cai na chamada individual (next).
 */
@Injectable()
export class PrerenderEstadoInterceptor implements HttpInterceptor {
  private _transferState = inject(TransferState);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (req.method !== 'GET') return next.handle(req);
    const chave = chaveEstado(req.url);
    if (!chave) return next.handle(req);

    return from(obterMapaEstados()).pipe(
      switchMap((mapa) => {
        const e = mapa.get(chave);
        if (!e) return next.handle(req); // bulk fora ou UF ausente → chamada normal
        this._transferState.set(stateKeyEstado(chave), e);
        return of(new HttpResponse({ status: 200, url: req.url, body: e }));
      }),
    );
  }
}
