import { ApplicationConfig, ErrorHandler, inject, provideAppInitializer, provideZoneChangeDetection } from "@angular/core";
import { AuthService } from "./core/services/auth.service";
import { GlobalErrorHandler } from "./core/error/global-error-handler";
import { provideRouter } from "@angular/router";
import { routes } from "./app.routes";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withFetch,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { provideClientHydration, withEventReplay } from "@angular/platform-browser";
import { AuthInterceptor } from "./core/middleware/auth.interceptor";
import { ApiBaseUrlInterceptor } from "./core/middleware/api-base.interceptor";
import { provideEnvironmentNgxMask } from "ngx-mask";
import { providePrimeNG } from "primeng/config";
import BuscaMissa from './themes/mytheme';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    // Hidratação das páginas pré-renderizadas (SSG) + replay de eventos disparados
    // antes do JS carregar. withFetch evita a dependência de xhr2 no servidor.
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    provideEnvironmentNgxMask(),
    // Restaura/renova a sessão do Responsável Verificado ao abrir o app
    provideAppInitializer(() => inject(AuthService).restaurarSessao()),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ApiBaseUrlInterceptor,
      multi: true,
    },
    providePrimeNG({
      theme: {
        preset: BuscaMissa,
        options: {
          darkModeSelector: false || "none",
        },
        
      },
      translation: {
        emptyMessage: "Nenhum resultado encontrado.",
        noFileChosenMessage: "Nenhum arquivo selecionado."
      },
      ripple: true,
    }),
  ],
};
