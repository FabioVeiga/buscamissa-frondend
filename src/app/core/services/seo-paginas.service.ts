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

  /** Árvore de um dia (hubs nacional/UF da intenção). */
  getArvoreDia(dia: string): Observable<unknown> {
    return this.http.get(`${this.base}/v2/seo/missa-dia/${dia}`);
  }

  /** Folha da intenção: uma cidade num dia (`/missa-{dia}/{uf}/{cidade}`). */
  getIntencaoCidade(dia: string, uf: string, cidade: string): Observable<unknown> {
    return this.http.get(`${this.base}/v2/seo/missa-dia/${dia}/${uf}/${cidade}`);
  }
}
