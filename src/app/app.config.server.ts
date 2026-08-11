import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerRouting } from '@angular/ssr';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { PrerenderCidadeInterceptor } from './core/middleware/prerender-cidade.interceptor';
import { PrerenderParoquiaInterceptor } from './core/middleware/prerender-paroquia.interceptor';
import { PrerenderEstadoInterceptor } from './core/middleware/prerender-estado.interceptor';
import { PrerenderEstadosInterceptor } from './core/middleware/prerender-estados.interceptor';
import { PrerenderIntencaoInterceptor } from './core/middleware/prerender-intencao.interceptor';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    provideServerRouting(serverRoutes),
    // Só no server: serve os GET de cidade do bulk /v2/seo/cidades durante o
    // prerender (1 fetch em vez de ~880), evitando o rate limit (429). Ausente
    // no bundle do browser, então em runtime nada muda.
    { provide: HTTP_INTERCEPTORS, useClass: PrerenderCidadeInterceptor, multi: true },
    // Idem para as ~4.4k paróquias (Fase 2.5), via bulk /v2/seo/paroquias.
    { provide: HTTP_INTERCEPTORS, useClass: PrerenderParoquiaInterceptor, multi: true },
    // Fase 3 — Estado (/v2/seo/estado/{uf}) e Intenção-cidade
    // (/v2/seo/missa-dia/{dia}/{uf}/{cidade}), servidos dos bulks em disco.
    { provide: HTTP_INTERCEPTORS, useClass: PrerenderEstadoInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: PrerenderIntencaoInterceptor, multi: true },
    // Bulk /v2/seo/estados para o índice /estados — a última página de SEO que
    // ainda buscava ao vivo no prerender e ficava sem TransferState.
    { provide: HTTP_INTERCEPTORS, useClass: PrerenderEstadosInterceptor, multi: true },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
