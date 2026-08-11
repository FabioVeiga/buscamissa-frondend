import { Injectable, TransferState, inject } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, from, of, switchMap } from 'rxjs';
import { chaveEstados, stateKeyEstados } from './prerender-state-keys';
import { obterListaEstados, EstadoPayload } from './prerender-estados-bulk';

/** O que o índice `/estados` realmente consome de cada item do bulk. */
interface EstadoResumo {
  uf: string;
  estado: string;
  totalCidades: number;
  totalParoquias: number;
}

/**
 * Interceptor SÓ-SERVER — serve o BULK `GET /v2/seo/estados` durante o prerender do
 * índice `/estados`, a partir do arquivo em `.prerender-cache/`.
 *
 * Antes desta ligação, `/estados` era a única página de SEO que ainda buscava seus
 * dados AO VIVO no prerender e, pior, sem TransferState: ao hidratar, o cliente
 * refazia a chamada do zero e um erro de rede derrubava a lista boa para a lista
 * estática de STATES (perdendo as metas de cada UF). Com a chave registrada, o
 * `PrerenderTransferStateInterceptor` passa a valer também aqui — emissão síncrona
 * na hidratação e, na revalidação, o `catchError(() => EMPTY)` que garante que uma
 * falha NUNCA rebaixa a página já renderizada.
 *
 * PAYLOAD ENXUTO, de propósito: o bulk tem ~90 KB porque cada estado traz `seo` e a
 * lista inteira de `cidades`, mas o índice só usa uf/estado/totalCidades/
 * totalParoquias — 2 KB. Transferir o bulk cru quase triplicaria o HTML desta
 * página para dado que ninguém lê. O recorte é seguro porque `getEstados()` tem um
 * único consumidor (`EstadosComponent`); se algum dia outro passar a precisar de
 * `cidades`, este recorte precisa acompanhar.
 *
 * Degrada com segurança: bulk ausente ou vazio → `next.handle(req)` (chamada real).
 */
@Injectable()
export class PrerenderEstadosInterceptor implements HttpInterceptor {
  private _transferState = inject(TransferState);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (req.method !== 'GET') return next.handle(req);
    const chave = chaveEstados(req.url);
    if (!chave) return next.handle(req);

    return from(obterListaEstados()).pipe(
      switchMap((lista) => {
        if (!lista.length) return next.handle(req);

        const resumo: EstadoResumo[] = lista.map((e: EstadoPayload) => ({
          uf: e.uf,
          estado: e.estado,
          totalCidades: e.totalCidades,
          totalParoquias: e.totalParoquias,
        }));

        this._transferState.set(stateKeyEstados(chave), resumo);
        return of(new HttpResponse({ status: 200, url: req.url, body: resumo }));
      }),
    );
  }
}
