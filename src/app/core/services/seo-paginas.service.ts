import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Consome os endpoints públicos de SEO por-item das páginas de Estado e Intenção
 * (Fase 3). Diferente do ChurchesService (que usa rotas relativas + prefixo /api
 * do ApiBaseUrlInterceptor), aqui as rotas são ABSOLUTAS no host raiz (`/v2/seo/...`,
 * sem `/api`) — por isso montamos a URL completa (que o ApiBaseUrlInterceptor ignora
 * por começar com http). No prerender os interceptors só-server servem estes GET do
 * bulk em disco; no browser eles respondem ao vivo (mesmo shape).
 */
@Injectable({ providedIn: 'root' })
export class SeoPaginasService {
  private http = inject(HttpClient);

  /** Base do host sem o sufixo /api (os /v2/seo/* ficam na raiz). */
  private get base(): string {
    return String(environment.config.apiURL ?? '')
      .replace(/\/api\/?$/, '')
      .replace(/\/$/, '');
  }

  /** Hub de Estado (`/missas/{uf}`). */
  getEstado(uf: string): Observable<unknown> {
    return this.http.get(`${this.base}/v2/seo/estado/${uf}`);
  }

  /**
   * Todas as UFs que têm paróquia — alimenta o índice `/estados`.
   *
   * É a MESMA fonte que o prerender usa para decidir quais hubs `/missas/{uf}`
   * gerar, então o índice nunca linka um estado sem página. Não passa pelo
   * interceptor de prerender (ele cobre só o por-item `/v2/seo/estado/{uf}`),
   * mas `/estados` é uma página só: é uma requisição no build inteiro.
   */
  getEstados(): Observable<unknown> {
    return this.http.get(`${this.base}/v2/seo/estados`);
  }

  /**
   * Árvore de um dia (hubs nacional/UF da intenção). O endpoint real sempre devolve
   * a árvore inteira (ignora `uf`) — o filtro por UF é feito no componente. O `uf`
   * aqui só marca a requisição para o interceptor SÓ-SERVER de prerender (ver
   * PrerenderIntencaoInterceptor), que fatia a árvore ANTES de gravar no
   * TransferState: sem isso, cada uma das ~26 páginas de UF por dia embutia a
   * árvore nacional inteira (~5 MB) no HTML — estourava o limite de tamanho do SWA.
   */
  getArvoreDia(dia: string, uf?: string): Observable<unknown> {
    const query = uf ? `?uf=${encodeURIComponent(uf)}` : '';
    return this.http.get(`${this.base}/v2/seo/missa-dia/${dia}${query}`);
  }

  /** Folha da intenção: uma cidade num dia (`/missa-{dia}/{uf}/{cidade}`). */
  getIntencaoCidade(dia: string, uf: string, cidade: string): Observable<unknown> {
    return this.http.get(`${this.base}/v2/seo/missa-dia/${dia}/${uf}/${cidade}`);
  }
}
