import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Guard-rail do prerender (Auditoria2 / Fases 2, 2.5 e 3). Roda no postbuild, depois
 * do prerender das cidades (/missas), das paróquias (/paroquia) e da HOME (raiz + /home).
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

// Seções prerenderizadas com estado de erro auditável (city, details e home).
// 'home' cobre dist/<app>/browser/home/index.html (rota `home`). A raiz `''`
// (browser/index.html) é verificada à parte, por não ficar numa subpasta.
// 'missas' cobre também os hubs de Estado (/missas/{uf}, Fase 3). Os `missa-{dia}`
// são as landings/hubs/folhas da árvore de intenção (Fase 3), uma pasta por dia.
const DIAS_INTENCAO = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];
const SECOES = ['missas', 'paroquia', 'home', ...DIAS_INTENCAO.map((d) => `missa-${d}`)];

/** Acha dist/<app>/browser, varrendo os apps sob dist/. */
function acharBrowserDir(base) {
  if (!existsSync(base)) return null;
  for (const app of readdirSync(base)) {
    const p = join(base, app, 'browser');
    if (existsSync(p) && statSync(p).isDirectory()) return p;
  }
  return null;
}

/** Acha dist/<app>/browser/<secao>, varrendo os apps sob dist/. */
function acharPastaSecao(base, secao) {
  const browser = acharBrowserDir(base);
  if (!browser) return null;
  const p = join(browser, secao);
  return existsSync(p) && statSync(p).isDirectory() ? p : null;
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

// Raiz `''` (browser/index.html): pode ser o shell CSR (pré-Fase 3) ou a home
// prerenderizada. Em qualquer caso, não pode conter o marcador de erro.
const browserDir = acharBrowserDir(distBase);
if (browserDir) {
  const raiz = join(browserDir, 'index.html');
  if (existsSync(raiz)) {
    algoVerificado = true;
    if (readFileSync(raiz, 'utf-8').includes(MARCADOR_ERRO)) {
      algumFalhou = true;
      console.error(`\n❌ [guard-rail] a raiz (index.html) foi assada em ESTADO DE ERRO.`);
    } else {
      console.log('[guard-rail] raiz (index.html): OK.');
    }
  }
}

// ── Guard-rail de COBERTURA ────────────────────────────────────────────────
//
// O guard-rail acima só pega páginas assadas EM ERRO. Ele deixa passar o modo de
// falha que de fato chegou à produção: uma seção com ZERO páginas. Em 2026-08-13
// as 988 páginas `/missas/{uf}/{cidade}` estavam TODAS ausentes do dist de prod —
// `getPrerenderParams` caiu no fallback vazio de `/v2/seo/routes` e o build saiu 0.
// Como o proxy responde 200 com o HTML da HOME para qualquer rota não prerenderizada,
// o Google recebeu 988 cópias da home com canonical=/home.
//
// Aqui comparamos o que foi ASSADO com o que o prebuild PROMETEU (.prerender-cache).
// É auto-calibrado: não há número mágico para desatualizar. Se o cache não existe
// (build:dev, ou API fora no prebuild), a checagem é pulada — mesma degradação de antes.
const COBERTURA_MINIMA = 0.9;

/** Espelha o filtro de app.routes.server.ts (paroquiasComMissaDoDisco). */
const esperadoPorSecao = {
  missas: () => {
    const cidades = lerCache('cidades.json');
    const estados = lerCache('estados.json');
    if (!cidades && !estados) return null;
    // A pasta "missas" acumula os dois níveis: /missas/{uf} e /missas/{uf}/{cidade}.
    return (cidades?.filter((c) => c?.uf && c?.cidadeSlug).length ?? 0)
      + (estados?.filter((e) => e?.uf).length ?? 0);
  },
  paroquia: () => {
    const lista = lerCache('paroquias.json');
    if (!lista) return null;
    return lista.filter(
      (p) =>
        (p?.igreja?.missas?.length ?? 0) > 0 &&
        (p?.igreja?.statusConfianca === 2 || p?.igreja?.statusConfianca === 3) &&
        p.uf && p.cidadeSlug && p.slug,
    ).length;
  },
};

function lerCache(arquivo) {
  const caminho = join(ROOT, '.prerender-cache', arquivo);
  if (!existsSync(caminho)) return null;
  try {
    return JSON.parse(readFileSync(caminho, 'utf-8'));
  } catch {
    return null;
  }
}

for (const [secao, contar] of Object.entries(esperadoPorSecao)) {
  const esperado = contar();
  if (esperado === null) {
    console.log(`[cobertura] "${secao}": sem cache do prebuild — checagem pulada.`);
    continue;
  }
  if (esperado === 0) {
    console.log(`[cobertura] "${secao}": prebuild não prometeu nenhuma página — nada a exigir.`);
    continue;
  }

  const dir = acharPastaSecao(distBase, secao);
  const gerado = dir ? listarIndexHtml(dir).length : 0;
  const ratio = gerado / esperado;
  console.log(
    `[cobertura] "${secao}": ${gerado}/${esperado} páginas (${(ratio * 100).toFixed(1)}%) | mínimo: ${(COBERTURA_MINIMA * 100).toFixed(0)}%`,
  );

  if (ratio < COBERTURA_MINIMA) {
    algumFalhou = true;
    console.error(
      `\n❌ [cobertura] "${secao}" prerenderizou ${gerado} de ${esperado} páginas esperadas.`,
    );
    console.error('   Cada página faltante vira 200 com o HTML da HOME no proxy (duplicata para o Google).');
    console.error('   Verifique o getPrerenderParams da seção em src/app/app.routes.server.ts');
    console.error('   e se o prebuild (baixar-bulk-prerender.mjs) baixou o bulk correspondente.');
  }
}

if (algumFalhou) {
  console.error('\n   Build abortado para não publicar páginas de erro indexáveis.\n');
  process.exit(1);
}

if (algoVerificado) console.log('✓ [guard-rail] prerender saudável.');
else console.log('[guard-rail] nada prerenderizado — nada a verificar.');
