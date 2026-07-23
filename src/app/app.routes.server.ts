import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Fase 1 da migração SSR (fatia fina): pré-renderiza apenas as páginas de
 * conteúdo estático — texto fixo, sem parâmetros de rota e sem dependência de
 * dados da API. Isso valida o pipeline de prerender end-to-end com risco mínimo.
 *
 * Todo o resto (home, busca, cidade, paróquia, área logada, rotas com :param)
 * permanece em CSR (RenderMode.Client) até as próximas fases, que vão migrar
 * as páginas dinâmicas de maior valor de SEO (cidade e paróquia) usando
 * getPrerenderParams alimentado por /v2/seo/routes.
 */
export const serverRoutes: ServerRoute[] = [
  { path: 'como-funciona', renderMode: RenderMode.Prerender },
  { path: 'guia-responsavel', renderMode: RenderMode.Prerender },
  { path: 'contribuir', renderMode: RenderMode.Prerender },
  { path: 'anuncios', renderMode: RenderMode.Prerender },
  { path: 'solicitar', renderMode: RenderMode.Prerender },
  { path: 'termos', renderMode: RenderMode.Prerender },
  { path: 'privacidade', renderMode: RenderMode.Prerender },
  { path: 'cookies', renderMode: RenderMode.Prerender },

  // Tudo o mais continua client-side por enquanto.
  { path: '**', renderMode: RenderMode.Client },
];
