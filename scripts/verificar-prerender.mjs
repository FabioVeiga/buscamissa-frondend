import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Guard-rail do prerender (Auditoria2 / Fase 2). Roda no postbuild, depois do
 * prerender das cidades.
 *
 * Se a API estiver com problema durante o build, o componente de cidade assa o
 * SEU estado de erro ("Não foi possível / Tentar novamente") no HTML estático —
 * e o `ng build` sai 0 mesmo assim. Sem esta trava, o site publicaria páginas de
 * erro para o Google indexar. Aqui contamos quantas cidades ficaram em estado de
 * erro e ABORTAMOS o build (exit 1) se passar do limiar.
 *
 * Não falha quando ZERO cidades foram prerenderizadas: isso é o fallback seguro
 * (API fora → getPrerenderParams vazio → cidades seguem CSR), não um erro a barrar.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Marcador do estado de erro do city.component (botão "Tentar novamente").
const MARCADOR_ERRO = 'Tentar novamente';
// Limiar tolerado de páginas de erro (falhas transientes pontuais acontecem).
const LIMIAR = 0.02; // 2%

function acharPastaMissas(base) {
  // dist/<app>/browser/missas
  if (!existsSync(base)) return null;
  for (const app of readdirSync(base)) {
    const p = join(base, app, 'browser', 'missas');
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

const missasDir = acharPastaMissas(join(ROOT, 'dist'));
if (!missasDir) {
  console.log('[guard-rail] nenhuma página de cidade prerenderizada — nada a verificar (cidades seguem CSR).');
  process.exit(0);
}

const arquivos = listarIndexHtml(missasDir);
const total = arquivos.length;
let comErro = 0;
const exemplos = [];
for (const f of arquivos) {
  if (readFileSync(f, 'utf-8').includes(MARCADOR_ERRO)) {
    comErro++;
    if (exemplos.length < 10) exemplos.push(f.replace(missasDir, 'missas').replace('/index.html', ''));
  }
}

const ratio = total ? comErro / total : 0;
const pct = (ratio * 100).toFixed(1);
console.log(`[guard-rail] cidades prerenderizadas: ${total} | em estado de erro: ${comErro} (${pct}%) | limiar: ${(LIMIAR * 100).toFixed(0)}%`);

if (ratio > LIMIAR) {
  console.error(`\n❌ [guard-rail] ${comErro}/${total} páginas de cidade (${pct}%) foram assadas em ESTADO DE ERRO — acima do limiar de ${(LIMIAR * 100).toFixed(0)}%.`);
  console.error('   Causa provável: rate limit (429) da API durante o prerender. Verifique o endpoint bulk /v2/seo/cidades e o interceptor de prerender.');
  console.error('   Exemplos:');
  for (const e of exemplos) console.error(`     - ${e}`);
  console.error('   Build abortado para não publicar páginas de erro indexáveis.\n');
  process.exit(1);
}

console.log('✓ [guard-rail] prerender de cidades saudável.');
