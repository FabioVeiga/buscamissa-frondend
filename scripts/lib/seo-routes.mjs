/**
 * Fonte única de verdade para as rotas de SEO derivadas de `/v2/seo/routes`.
 *
 * Consumido por dois runtimes distintos:
 *   1. `scripts/gerar-sitemap.mjs` — script Node standalone (prebuild).
 *   2. `src/app/app.routes.server.ts` — `getPrerenderParams` no bundle server do
 *      Angular, durante o prerender (Fase 2 do SSR: cidades; Fase 2.5: paróquias).
 *
 * Por isso NÃO depende de `fs` nem de nada específico de um dos ambientes: recebe
 * a base da API pronta e usa só `fetch`/`AbortController` (globais no Node 18+ e
 * no bundle server). Cada chamador resolve a base do seu jeito (fs vs environment)
 * e chama `buscarRotasSeo(base)`.
 *
 * Requisitos não-funcionais (Auditoria2 / Fase 2):
 *  - cache da Promise: 1 fetch por build, mesmo com vários getPrerenderParams;
 *  - timeout, para não travar o build num CI com API lenta;
 *  - fallback vazio (degrada sem derrubar o deploy) — e o cache é limpo no erro,
 *    para permitir nova tentativa numa chamada posterior;
 *  - validação de shape (descarta item sem uf/slug — protege contra rename no back);
 *  - deduplicação + ordenação determinística (builds comparáveis).
 */

const TIMEOUT_MS = 8000;

/** Remove o sufixo `/api` e barra final — `/v2/seo/routes` é rota absoluta. */
export function normalizarBaseUrl(raw) {
  return String(raw ?? '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
}

/** Cache da Promise (não do resultado) — dedupe de chamadas concorrentes no build. */
let cachePromise = null;

/**
 * Busca e normaliza as rotas de SEO. Sempre resolve (nunca rejeita): em erro/timeout
 * retorna `{ cities: [], parishes: [] }` e o prerender simplesmente não gera nada.
 *
 * @param {string} apiBase base já normalizada (ex: https://.../ sem /api)
 * @returns {Promise<{ cities: Array<{uf:string,citySlug:string,lastModified?:string}>, parishes: Array<{uf:string,citySlug:string,slug:string,lastModified?:string}> }>}
 */
export function buscarRotasSeo(apiBase) {
  if (cachePromise) return cachePromise;
  cachePromise = _buscar(apiBase).catch((err) => {
    // Limpa o cache no erro para não fossilizar `[]` no resto do build.
    cachePromise = null;
    console.warn(`[SEO] falha ao buscar rotas — prerender desabilitado (${err?.message ?? err}).`);
    return { cities: [], parishes: [] };
  });
  return cachePromise;
}

async function _buscar(apiBase) {
  const url = `${apiBase}/v2/seo/routes`;
  const inicio = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let bruto;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    bruto = await res.json();
  } finally {
    clearTimeout(timer);
  }

  const cities = normalizarCidades(bruto?.cities);
  const parishes = normalizarParoquias(bruto?.parishes);

  const ms = Date.now() - inicio;
  console.log(`[SEO] ${cities.length} cidades / ${parishes.length} paróquias carregadas de ${url} em ${ms}ms.`);

  return { cities, parishes };
}

function normalizarCidades(lista) {
  const vistos = new Set();
  const out = [];
  for (const c of Array.isArray(lista) ? lista : []) {
    const uf = c?.uf;
    const citySlug = c?.citySlug;
    if (!uf || !citySlug) continue; // shape inválido (ex: rename no backend) → descarta
    const chave = `${uf}/${citySlug}`.toLowerCase();
    if (vistos.has(chave)) continue; // dedupe
    vistos.add(chave);
    out.push({ uf, citySlug, lastModified: c.lastModified });
  }
  return out.sort((a, b) => `${a.uf}/${a.citySlug}`.localeCompare(`${b.uf}/${b.citySlug}`));
}

function normalizarParoquias(lista) {
  const vistos = new Set();
  const out = [];
  for (const p of Array.isArray(lista) ? lista : []) {
    const uf = p?.uf;
    const citySlug = p?.citySlug;
    const slug = p?.slug;
    if (!uf || !citySlug || !slug) continue;
    const chave = `${uf}/${citySlug}/${slug}`.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ uf, citySlug, slug, lastModified: p.lastModified });
  }
  return out.sort((a, b) =>
    `${a.uf}/${a.citySlug}/${a.slug}`.localeCompare(`${b.uf}/${b.citySlug}/${b.slug}`),
  );
}
