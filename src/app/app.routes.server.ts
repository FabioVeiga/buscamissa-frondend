import { RenderMode, ServerRoute } from '@angular/ssr';
import { environment } from '../environments/environment';
// Fonte única das rotas de SEO, compartilhada com scripts/gerar-sitemap.mjs.
// É um módulo .mjs plano (roda também como script Node standalone), por isso o
// type-checker não tem declaração — o esbuild do build server o empacota normalmente.
// @ts-expect-error — módulo JS sem tipos; contrato garantido pelo próprio helper.
import { buscarRotasSeo, normalizarBaseUrl } from '../../scripts/lib/seo-routes.mjs';

/**
 * Migração SSR/SSG (Auditoria2), em fases sobre `outputMode: static`:
 *
 * - Fase 1 (em produção): prerender das 8 páginas de conteúdo estático — texto
 *   fixo, sem :param e sem dados da API.
 * - Fase 2 (aqui): prerender das páginas de CIDADE (`/missas/:uf/:cidade`) via
 *   `getPrerenderParams`, alimentado por `/v2/seo/routes` (mesmo endpoint do
 *   sitemap). Paróquias permanecem em CSR até a Fase 2.5 (volume alto — medir o
 *   custo de build das cidades antes de escalar).
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

  // Fase 2 — cidades. As chaves (uf/cidade) casam com os :param de app.routes.ts.
  // Se `/v2/seo/routes` falhar no build, o helper retorna lista vazia: nenhuma
  // cidade é prerenderizada (segue CSR) em vez de derrubar o deploy.
  {
    path: 'missas/:uf/:cidade',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => {
      const base = normalizarBaseUrl(environment.config.apiURL);
      const { cities } = await buscarRotasSeo(base);
      return cities.map((c: { uf: string; citySlug: string }) => ({
        uf: c.uf,
        cidade: c.citySlug,
      }));
    },
  },

  // Tudo o mais (home, busca, paróquia, área logada, rotas legadas) segue CSR.
  { path: '**', renderMode: RenderMode.Client },
];
