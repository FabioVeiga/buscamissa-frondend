import { readdirSync, statSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Guard-rail da ESTEIRA de build (Auditoria2 / Fase 3). Roda no postbuild, depois
 * do dedupe de CSS (que é quem de fato reduz o tamanho).
 *
 * Lição da Fase 2.5: o risco real do prerender não é o código da feature — é a
 * esteira. O dist quase estourou o limite de 250 MB do Azure Static Web Apps (Free),
 * porque o PrimeNG inlina o tema em CADA página e o tamanho cresce linearmente com o
 * nº de páginas prerenderizadas. Aqui travamos o build ANTES do deploy se:
 *
 *   1. o dist/<app>/browser passar de LIMITE_MB (margem folgada abaixo dos 250 MB), ou
 *   2. o nº de arquivos passar de MAX_FILES (alguém reintroduziu prerender em massa).
 *
 * Sempre loga o tamanho/contagem atuais para acompanhar a TENDÊNCIA a cada build —
 * é o alarme antecipado para decidir SWA Standard com dado, não com susto.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Azure SWA Free rejeita conteúdo > 250 MB (descomprimido). Margem folgada, NÃO 249.
const LIMITE_MB = 200;
const LIMITE_BYTES = LIMITE_MB * 1024 * 1024;
// Teto de arquivos: se alguém reintroduzir prerender de milhares de páginas por engano,
// a esteira quebra na hora — não depois do deploy. Base atual (~8 estáticas + ~380
// cidades + ~3.4k paróquias com missa) fica muito abaixo; 15000 dá folga sem mascarar.
const MAX_FILES = 15000;

/** Acha dist/<app>/browser varrendo os apps sob dist/. */
function acharBrowserDir(base) {
  if (!existsSync(base)) return null;
  for (const app of readdirSync(base)) {
    const p = join(base, app, 'browser');
    if (existsSync(p) && statSync(p).isDirectory()) return p;
  }
  return null;
}

/** Soma recursiva de bytes e contagem de arquivos. */
function medir(dir) {
  let bytes = 0;
  let arquivos = 0;
  for (const nome of readdirSync(dir)) {
    const full = join(dir, nome);
    const st = statSync(full);
    if (st.isDirectory()) {
      const sub = medir(full);
      bytes += sub.bytes;
      arquivos += sub.arquivos;
    } else {
      bytes += st.size;
      arquivos++;
    }
  }
  return { bytes, arquivos };
}

const distBase = join(ROOT, 'dist');
const browserDir = acharBrowserDir(distBase);

if (!browserDir) {
  console.log('[dist-size] nenhum dist/<app>/browser encontrado — nada a verificar.');
  process.exit(0);
}

const { bytes, arquivos } = medir(browserDir);
const mb = (bytes / (1024 * 1024)).toFixed(1);

console.log(`[dist-size] dist browser: ${mb} MB | ${arquivos} arquivos | limites: ${LIMITE_MB} MB / ${MAX_FILES} arquivos`);

let falhou = false;

if (bytes > LIMITE_BYTES) {
  falhou = true;
  console.error(`\n❌ [dist-size] ${mb} MB excede o limite de ${LIMITE_MB} MB.`);
  console.error('   O Azure SWA (Free) rejeita > 250 MB. Reduza páginas prerenderizadas, revise');
  console.error('   o dedupe de CSS (dedupe-prerender-css.mjs) ou considere o plano Standard.');
}

if (arquivos > MAX_FILES) {
  falhou = true;
  console.error(`\n❌ [dist-size] ${arquivos} arquivos excede o limite de ${MAX_FILES}.`);
  console.error('   Provável prerender em massa não intencional — confira os getPrerenderParams');
  console.error('   em app.routes.server.ts.');
}

if (falhou) {
  console.error('\n   Build abortado para não estourar a esteira de deploy.\n');
  process.exit(1);
}

console.log('✓ [dist-size] esteira dentro dos limites.');
