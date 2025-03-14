import { ApplicationConfig, provideZoneChangeDetection } from "@angular/core";
import { provideRouter } from "@angular/router";
import { routes } from "./app.routes";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
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
    provideHttpClient(withInterceptorsFromDi()),
    provideEnvironmentNgxMask(),
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
