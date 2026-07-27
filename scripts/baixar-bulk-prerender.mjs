/**
 * Prebuild (Auditoria2 / Fase 2.5): baixa os bulks de SEO para DISCO, antes do
 * `ng build`, para que os interceptors de prerender (cidade/paróquia) sirvam os
 * dados do arquivo local em vez de fazer `fetch` DURANTE o render.
 *
 * Motivo: com ~2.4k+ páginas prerenderizadas, cada worker do Angular esperava o
 * fetch do bulk no meio do render. Contra uma API lenta/rate-limited (staging),
 * um único fetch demorado estourava o timeout de rota do Angular — e o `ng build`
 * aborta o build inteiro no primeiro erro, derrubando todos os workers em cascata.
 * Lendo do disco, o render fica offline e instantâneo: sem timeout, sem 429.
 *
 * Best-effort: se um download falhar, NÃO grava o arquivo e segue (exit 0). O
 * interceptor então cai no `fetch` ao vivo (comportamento da Fase 2) e, no pior
 * caso, o guard-rail (postbuild) barra o deploy se páginas de erro forem assadas.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { normalizarBaseUrl } from './lib/seo-routes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(ROOT, '.prerender-cache');
const TIMEOUT_MS = 60_000; // bulk de paróquias é grande (~5 MB); folga contra API lenta.

// Argumento: "staging" ou "prod" (default: prod) — mesmo contrato de gerar-sitemap.mjs.
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

// Dias explícitos da árvore de intenção (Fase 3). "hoje" NÃO entra: o dia atual
// depende do fuso do usuário e é resolvido no cliente (Brasil tem 4 fusos).
const DIAS = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];

/**
 * Baixa `rota` para `arquivo`. `tipo`:
 *  - 'array'  → valida Array (bulks de cidades/paróquias/estados);
 *  - 'objeto' → valida objeto não-array (árvore de intenção /v2/seo/missa-dia/{dia}).
 */
async function baixar(base, rota, arquivo, tipo = 'array') {
  const url = `${base}${rota}`;
  const inicio = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const dados = await res.json();
    if (tipo === 'array' && !Array.isArray(dados)) throw new Error('resposta não é um array');
    if (tipo === 'objeto' && (dados === null || typeof dados !== 'object' || Array.isArray(dados)))
      throw new Error('resposta não é um objeto');
    mkdirSync(CACHE_DIR, { recursive: true });
    const json = JSON.stringify(dados);
    writeFileSync(join(CACHE_DIR, arquivo), json);
    const ms = Date.now() - inicio;
    const mb = (json.length / 1_048_576).toFixed(1);
    const qtd = Array.isArray(dados) ? `${dados.length} itens` : 'árvore';
    console.log(`[prerender-cache] ${qtd} de ${rota} → ${arquivo} (${mb} MB, ${ms}ms).`);
    return true;
  } catch (err) {
    console.warn(`[prerender-cache] falha ao baixar ${rota} (${err?.message ?? err}) — interceptor fará fetch ao vivo.`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const base = lerApiUrl();
  console.log(`[prerender-cache] ambiente=${ENV} base=${base}`);
  await Promise.all([
    baixar(base, '/v2/seo/cidades', 'cidades.json'),
    baixar(base, '/v2/seo/paroquias', 'paroquias.json'),
    // Fase 3 — Estado (array de UFs) + árvore de intenção por dia (objeto).
    baixar(base, '/v2/seo/estados', 'estados.json'),
    ...DIAS.map((d) => baixar(base, `/v2/seo/missa-dia/${d}`, `missa-${d}.json`, 'objeto')),
  ]);
}

main();
