/**
 * Gera public/sitemap.xml ESTÁTICO no prebuild — contorno temporário enquanto o
 * proxy Node em frente ao domínio canônico (buscamissa.com.br, fora destes repos)
 * não repassa corretamente /sitemap.xml para a API (bug de infra separado, fora do
 * nosso alcance nesta sessão: o domínio resolve direto pra uma VM cujo código não
 * está versionado em nenhum repo acessível).
 *
 * Histórico: até 2026-07-25 o site gerava esse arquivo no build (ver commit
 * 2d89b5d "remove geração do sitemap estático — agora é dinâmico"); a ideia era o
 * proxy buscar a versão fresca direto da API a cada request. Como isso não está
 * funcionando (GSC reportando 404 em buscamissa.com.br/sitemap.xml, mesmo com a
 * API respondendo 200), este script busca o XML JÁ PRONTO do endpoint /sitemap.xml
 * da API (fonte única — sem duplicar a lógica de montagem/anti-thin/prioridades
 * que já vive no SitemapController) e grava como arquivo estático no dist.
 *
 * Trade-off: frescor = do último deploy, não em tempo real (paróquia nova só
 * aparece no próximo build/deploy). Aceitável como contorno; reverter quando o
 * proxy for corrigido (ver memória `topologia-proxy-node-buscamissa`).
 *
 * Best-effort: se a API estiver fora, NÃO grava o arquivo e segue o build
 * (exit 0) — melhor não ter sitemap novo do que travar o deploy por causa disso.
 *
 * --- Filtro de cobertura real (2026-09-07) -----------------------------------
 *
 * O `SitemapController` inclui TODA paróquia com pelo menos 1 missa (anti-thin) —
 * mas só um SUBCONJUNTO delas é de fato prerenderizado no frontend, sob o teto
 * `MAX_PAROQUIAS_PRERENDER` (ver `scripts/lib/selecionar-paroquias-prerender.mjs`).
 * O backend não conhece esse teto nem o ranking de qualidade que decide quem entra.
 *
 * Medido em produção em 2026-09-07: 3.910 paróquias com missa no sitemap, das quais
 * só 1.899 tinham HTML prerenderizado — 2.011 URLs `/paroquia/...` submetidas ao
 * Google sem arquivo por trás, caindo no `navigationFallback` (shell CSR em 200,
 * sem canonical). Cidades e estados NÃO têm esse problema (sem teto equivalente).
 *
 * Corrigir no backend duplicaria o algoritmo de seleção em C# — duas implementações
 * do mesmo ranking, em linguagens diferentes, que teriam que ficar sincronizadas
 * para sempre. Em vez disso, `filtrarParoquiasSemHtml` remove do XML já buscado as
 * entradas `/paroquia/{uf}/{cidade}/{slug}` que NÃO estão no mesmo conjunto que
 * `app.routes.server.ts` vai prerenderizar — reaproveitando a MESMA função,
 * importada do módulo compartilhado. As demais categorias (home, hubs, estado,
 * cidade, intenção) passam intocadas.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { normalizarBaseUrl } from './lib/seo-routes.mjs';
import { paroquiasDoDisco } from './lib/selecionar-paroquias-prerender.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TIMEOUT_MS = 30_000;

// Argumento: "staging" ou "prod" (default: prod) — mesmo contrato dos outros scripts.
const ENV = process.argv[2] ?? 'prod';

function lerApiUrl() {
  if (process.env.API_URL) return normalizarBaseUrl(process.env.API_URL);
  const envFile = ENV === 'staging'
    ? join(ROOT, 'src/environments/environment.staging.ts')
    : join(ROOT, 'src/environments/environment.production.ts');
  const conteudo = readFileSync(envFile, 'utf-8');
  const match = conteudo.match(/apiURL\s*:\s*["']([^"']+)["']/);
  if (!match) throw new Error(`apiURL não encontrado em ${envFile}`);
  return normalizarBaseUrl(match[1]);
}

/** Extrai `{uf, cidade, slug}` de um `<loc>` que aponta para `/paroquia/...`, senão null. */
function paroquiaDaLoc(loc) {
  const m = loc.match(/\/paroquia\/([^/]+)\/([^/]+)\/([^/]+)\/?$/);
  if (!m) return null;
  return { uf: m[1].toLowerCase(), cidade: m[2].toLowerCase(), slug: m[3].toLowerCase() };
}

/**
 * Remove do XML as entradas `/paroquia/...` que não terão HTML prerenderizado.
 *
 * O sitemap não tem `<url>` aninhado (schema não permite), então cada bloco
 * `<url>...</url>` é delimitado com segurança por essa regex — sem precisar de um
 * parser XML completo para um filtro deste tamanho.
 *
 * Se o cache do prebuild não existir (`paroquiasDoDisco()` retorna null — não deveria
 * acontecer em staging/prod, onde `baixar-bulk-prerender.mjs` roda antes deste script
 * no `prebuild`), NÃO filtra: melhor publicar o sitemap sem o filtro extra do que
 * arriscar remover tudo por engano.
 */
function filtrarParoquiasSemHtml(xml) {
  const selecionadas = paroquiasDoDisco();
  if (selecionadas === null) {
    return { xml, removidas: 0, semCache: true };
  }
  const permitidas = new Set(selecionadas.map((p) => `${p.uf}/${p.cidade}/${p.slug}`));

  let removidas = 0;
  const xmlFiltrado = xml.replace(/ {2}<url>[\s\S]*?<\/url>\n/g, (bloco) => {
    const loc = bloco.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '';
    const p = paroquiaDaLoc(loc);
    if (!p) return bloco; // não é URL de paróquia — mantém.
    const chave = `${p.uf}/${p.cidade}/${p.slug}`;
    if (permitidas.has(chave)) return bloco;
    removidas++;
    return '';
  });

  return { xml: xmlFiltrado, removidas, semCache: false };
}

async function main() {
  const base = lerApiUrl();
  const url = `${base}/sitemap.xml`;
  const inicio = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const xmlBruto = await res.text();
    if (!xmlBruto.includes('<urlset')) throw new Error('resposta não parece um sitemap XML válido');

    const totalBruto = (xmlBruto.match(/<loc>/g) ?? []).length;
    const { xml, removidas, semCache } = filtrarParoquiasSemHtml(xmlBruto);

    mkdirSync(join(ROOT, 'public'), { recursive: true });
    writeFileSync(join(ROOT, 'public', 'sitemap.xml'), xml, 'utf-8');

    const total = (xml.match(/<loc>/g) ?? []).length;
    console.log(`[sitemap-estatico] ${totalBruto} URLs de ${url} → public/sitemap.xml (${Date.now() - inicio}ms).`);
    if (semCache) {
      console.warn('[sitemap-estatico] cache .prerender-cache/paroquias.json ausente — filtro de cobertura de paróquias NÃO aplicado.');
    } else {
      console.log(`[sitemap-estatico] filtro de cobertura: ${removidas} URL(s) de paróquia sem HTML removida(s), ${total} restantes.`);
    }
  } catch (err) {
    console.warn(`[sitemap-estatico] falha ao buscar ${url} (${err?.message ?? err}) — build segue sem regenerar o sitemap.`);
  } finally {
    clearTimeout(timer);
  }
}

main();
