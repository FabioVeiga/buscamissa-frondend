import { RenderMode, ServerRoute } from '@angular/ssr';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
 * - Fase 2: prerender das páginas de CIDADE (`/missas/:uf/:cidade`) via
 *   `getPrerenderParams`, alimentado por `/v2/seo/routes` (mesmo endpoint do
 *   sitemap).
 * - Fase 2.5 (aqui): prerender das páginas de PARÓQUIA (`/paroquia/:uf/:cidade/:slug`).
 *   O bulk `/v2/seo/paroquias` (interceptor só-server) evita as chamadas individuais.
 *   Prerenderiza SÓ paróquias COM missa (ver paroquiasComMissaDoDisco): corta as
 *   páginas thin (sem horário), dá folga no limite de 250 MB do SWA em prod (~4.5k
 *   paróquias) e melhora o SEO. As sem missa seguem CSR (e continuam no sitemap).
 */

/**
 * Lê o bulk baixado pelo prebuild (.prerender-cache/paroquias.json, que tem `missas`)
 * e retorna as rotas SÓ das paróquias com horário. Retorna null se o arquivo não
 * existe (ex.: build:dev sem prebuild) → o caller cai no fallback (todas via routes).
 */
function paroquiasComMissaDoDisco(): Array<{ uf: string; cidade: string; slug: string }> | null {
  const arquivo = join(process.cwd(), '.prerender-cache', 'paroquias.json');
  if (!existsSync(arquivo)) return null;
  const lista = JSON.parse(readFileSync(arquivo, 'utf-8')) as Array<{
    uf: string; cidadeSlug: string; slug: string; igreja?: { missas?: unknown[] };
  }>;
  return lista
    .filter((p) => (p?.igreja?.missas?.length ?? 0) > 0 && p.uf && p.cidadeSlug && p.slug)
    .map((p) => ({ uf: p.uf, cidade: p.cidadeSlug, slug: p.slug }));
}

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

  // Fase 2.5 — paróquias (só as COM missa). As chaves (uf/cidade/slug) casam com os
  // :param de app.routes.ts. Preferimos o cache do prebuild (tem `missas`) pra
  // filtrar; sem ele (build:dev) ou se `/v2/seo/routes` falhar, cai no fallback
  // (todas / lista vazia) — nunca derruba o deploy.
  {
    path: 'paroquia/:uf/:cidade/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => {
      const comMissa = paroquiasComMissaDoDisco();
      if (comMissa) return comMissa;
      const base = normalizarBaseUrl(environment.config.apiURL);
      const { parishes } = await buscarRotasSeo(base);
      return parishes.map((p: { uf: string; citySlug: string; slug: string }) => ({
        uf: p.uf,
        cidade: p.citySlug,
        slug: p.slug,
      }));
    },
  },

  // Tudo o mais (home, busca, área logada, rotas legadas) segue CSR.
  { path: '**', renderMode: RenderMode.Client },
];
