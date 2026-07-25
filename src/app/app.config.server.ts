import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerRouting } from '@angular/ssr';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { PrerenderCidadeInterceptor } from './core/middleware/prerender-cidade.interceptor';
import { PrerenderParoquiaInterceptor } from './core/middleware/prerender-paroquia.interceptor';

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
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
