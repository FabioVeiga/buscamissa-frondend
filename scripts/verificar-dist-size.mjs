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
//
// 200 → 220 MB em 2026-08-13, junto com a expansão da cobertura de prerender.
// Motivo: o SWA decide 200 vs 404 só por existência de arquivo. Enquanto ~1.754
// paróquias reais ficavam sem arquivo (filtro de missa/confiança), era impossível
// separar paróquia real de URL inexistente, e o fallback devolvia 200 com o HTML da
// HOME nas duas. Prerenderizar todas é o que torna o 404 real possível.
//
// Projeção para prod a partir das médias MEDIDAS no build de staging de 2026-08-13
// (paróquia 34,6 KB · cidade 46,4 KB · estado 39,3 KB, já pós-dedupe de CSS), aplicadas
// ao universo de prod (4.727 paróquias / 988 cidades / 26 estados): **~211,5 MB**.
// Contra o teto físico de ~250 MB do plano Free, 220 MB é alarme antecipado.
//
// ATENÇÃO: a folga contra este guard é de só ~8,5 MB (4%). É estreita de propósito —
// se o build abortar aqui, a saída NÃO é subir o limite de novo. É cortar peso do HTML,
// nesta ordem (ambos medidos, ambos sem efeito em comportamento):
//   1. comentários descritivos herdados de src/index.html — ~2,7 KB idênticos por
//      página (os <!----> de hidratação do Angular NÃO podem sair);
//   2. os 4 blocos <script> inline de src/index.html — ~2,5 KB idênticos por página,
//      dedupáveis para arquivo externo (cuidado: mexe no timing do Consent Mode).
// Juntos economizam ~5,2 KB/página ≈ 30 MB em prod, levando a projeção a ~181 MB.
const LIMITE_MB = 220;
const LIMITE_BYTES = LIMITE_MB * 1024 * 1024;
// Teto da DISTRIBUIÇÃO — o guard que mais importa.
//
// 15.000 era a cota oficial do SWA. O limite REAL é operacional e muito menor: o Azure
// faz polling por 300 s na distribuição de conteúdo e desiste. O gatilho é a contagem
// de arquivos, mas o que de fato estoura é o TEMPO — então é o tempo que este guard
// mede, com a contagem servindo de proxy.
//
// Medições próprias, em master ("Finished Upload" → "Deployment Complete" nos logs do
// Actions):
//
//   3.276 arquivos →  95 s  · deploy OK                                (31/08)
//   3.276 arquivos →  93 s  · deploy OK                                (02/09)
//   6.050 arquivos → 298,8 s · "Failure during content distribution"   (14/08)
//
// Inclinação entre os pontos conhecidos: (298,8 − 94) / (6.050 − 3.276) ≈ 0,074 s por
// arquivo. O modelo reproduz o incidente — prevê o estouro dos 300 s em ~6.070 arquivos,
// e a falha real veio em 6.050 —, então serve para projetar.
//
// O teto anterior era 3.400 ARQUIVOS, escolhido "logo acima da faixa provada boa"
// quando só se sabia "3.311 deu certo, 6.050 falhou". Era precaução sem medida de tempo:
// 3.425 arquivos, que o barraram em 02/09, projetam ~105 s — um terço do orçamento.
//
// TETO_DISTRIBUICAO_S = 200 s deixa 100 s de margem contra o timeout de 300 s, o que
// absorve um Azure bem mais lento que o medido. Pelo modelo, 200 s equivalem a ~4.700
// arquivos; MAX_FILES = 4.200 fica abaixo disso de propósito, para o teto de arquivos
// barrar primeiro e a decisão de crescer voltar a passar por uma medição nova.
//
// ATENÇÃO ao subir estes números: só com medição nova, do tempo real de distribuição nos
// logs do Actions. Nunca "para caber" — reduzir o escopo de prerender de cidades ou
// cortar paróquias só para passar aqui é pior que o problema: sem arquivo, o SWA cai no
// fallback e o proxy devolve 200 com o HTML da HOME, e o Google indexa duplicata. Hoje
// já são ~2.900 das 4.837 paróquias nessa situação (MAX_PAROQUIAS_PRERENDER = 1900).
// Se a projeção passar do teto de tempo, a saída é avaliar o SWA Standard.
const SEGUNDOS_POR_ARQUIVO = 0.074;
const TETO_DISTRIBUICAO_S = 200;
// Rede de segurança contra geração em massa acidental (um getPrerenderParams sem filtro),
// independente da estimativa de tempo. 4.200 arquivos projetam ~162 s — 81% do teto.
const MAX_FILES = 4200;

/**
 * Tempo estimado de distribuição. Ancorado na medição de 31/08 e 02/09 (3.276 arquivos
 * → 94 s de média) e extrapolado pela inclinação observada, em vez de multiplicar a
 * contagem crua — o deploy tem um custo fixo que a multiplicação simples ignoraria.
 */
const ARQUIVOS_ANCORA = 3276;
const SEGUNDOS_ANCORA = 94;
function estimarDistribuicao(arquivos) {
  return SEGUNDOS_ANCORA + (arquivos - ARQUIVOS_ANCORA) * SEGUNDOS_POR_ARQUIVO;
}

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

const distribuicaoS = Math.round(estimarDistribuicao(arquivos));

console.log(`[dist-size] dist browser: ${mb} MB | ${arquivos} arquivos | distribuição estimada: ~${distribuicaoS}s`);
console.log(`[dist-size] limites: ${LIMITE_MB} MB / ${TETO_DISTRIBUICAO_S}s de distribuição / ${MAX_FILES} arquivos`);

let falhou = false;

if (bytes > LIMITE_BYTES) {
  falhou = true;
  console.error(`\n❌ [dist-size] ${mb} MB excede o limite de ${LIMITE_MB} MB.`);
  console.error('   O Azure SWA (Free) rejeita > 250 MB. Reduza páginas prerenderizadas, revise');
  console.error('   o dedupe de CSS (dedupe-prerender-css.mjs) ou considere o plano Standard.');
}

if (distribuicaoS > TETO_DISTRIBUICAO_S) {
  falhou = true;
  console.error(`\n❌ [dist-size] distribuição estimada em ~${distribuicaoS}s excede o teto de ${TETO_DISTRIBUICAO_S}s.`);
  console.error(`   ${arquivos} arquivos x ${SEGUNDOS_POR_ARQUIVO}s, ancorado em ${ARQUIVOS_ANCORA} arquivos = ${SEGUNDOS_ANCORA}s (medido em master).`);
  console.error('   O Azure desiste da distribuição em 300s e o deploy falha SEM erro de build.');
  console.error('   NÃO reduza o escopo de prerender só para passar aqui: sem arquivo, a rota cai');
  console.error('   no fallback e o proxy devolve 200 com o HTML da home. Avalie o SWA Standard.');
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
