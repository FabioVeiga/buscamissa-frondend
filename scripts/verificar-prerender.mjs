import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Guard-rail do prerender (Auditoria2 / Fases 2 e 2.5). Roda no postbuild, depois
 * do prerender das cidades (/missas) e das paróquias (/paroquia).
 *
 * Se a API estiver com problema durante o build, o componente assa o SEU estado de
 * erro ("Não foi possível / Tentar novamente") no HTML estático — e o `ng build`
 * sai 0 mesmo assim. Sem esta trava, o site publicaria páginas de erro para o
 * Google indexar. Aqui contamos quantas páginas ficaram em estado de erro e
 * ABORTAMOS o build (exit 1) se QUALQUER seção passar do limiar.
 *
 * Não falha quando ZERO páginas foram prerenderizadas numa seção: isso é o fallback
 * seguro (API fora → getPrerenderParams vazio → segue CSR), não um erro a barrar.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Marcador do estado de erro dos componentes (botão "Tentar novamente").
const MARCADOR_ERRO = 'Tentar novamente';
// Limiar tolerado de páginas de erro (falhas transientes pontuais acontecem).
const LIMIAR = 0.02; // 2%

// Seções prerenderizadas com estado de erro auditável (city e details).
const SECOES = ['missas', 'paroquia'];

/** Acha dist/<app>/browser/<secao>, varrendo os apps sob dist/. */
function acharPastaSecao(base, secao) {
  if (!existsSync(base)) return null;
  for (const app of readdirSync(base)) {
    const p = join(base, app, 'browser', secao);
    if (existsSync(p) && statSync(p).isDirectory()) return p;
  }
  return null;
}

function listarIndexHtml(dir) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const full = join(dir, nome);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listarIndexHtml(full));
    else if (nome === 'index.html') out.push(full);
  }
  return out;
}

const distBase = join(ROOT, 'dist');
let algumFalhou = false;
let algoVerificado = false;

for (const secao of SECOES) {
  const dir = acharPastaSecao(distBase, secao);
  if (!dir) {
    console.log(`[guard-rail] nenhuma página de "${secao}" prerenderizada — nada a verificar (segue CSR).`);
    continue;
  }

  algoVerificado = true;
  const arquivos = listarIndexHtml(dir);
  const total = arquivos.length;
  let comErro = 0;
  const exemplos = [];
  for (const f of arquivos) {
    if (readFileSync(f, 'utf-8').includes(MARCADOR_ERRO)) {
      comErro++;
      if (exemplos.length < 10) exemplos.push(f.replace(dir, secao).replace('/index.html', ''));
    }
  }

  const ratio = total ? comErro / total : 0;
  const pct = (ratio * 100).toFixed(1);
  console.log(`[guard-rail] "${secao}" prerenderizadas: ${total} | em estado de erro: ${comErro} (${pct}%) | limiar: ${(LIMIAR * 100).toFixed(0)}%`);

  if (ratio > LIMIAR) {
    algumFalhou = true;
    console.error(`\n❌ [guard-rail] ${comErro}/${total} páginas de "${secao}" (${pct}%) foram assadas em ESTADO DE ERRO — acima do limiar de ${(LIMIAR * 100).toFixed(0)}%.`);
    console.error(`   Causa provável: rate limit (429) da API durante o prerender. Verifique o endpoint bulk (/v2/seo/cidades ou /v2/seo/paroquias) e o interceptor de prerender.`);
    console.error('   Exemplos:');
    for (const e of exemplos) console.error(`     - ${e}`);
  }
}

if (algumFalhou) {
  console.error('\n   Build abortado para não publicar páginas de erro indexáveis.\n');
  process.exit(1);
}

if (algoVerificado) console.log('✓ [guard-rail] prerender saudável.');
else console.log('[guard-rail] nada prerenderizado — nada a verificar.');
