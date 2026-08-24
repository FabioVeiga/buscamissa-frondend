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
 * Piso ABSOLUTO de itens por bulk CRÍTICO.
 *
 * Crítico = seção que `staticwebapp.config.json` tira do `navigationFallback`
 * (`/paroquia/*` e `/missas/*`). Nessas, ausência de arquivo no dist significa 404 —
 * então um cache truncado não degrada a página, ele APAGA a página do site.
 *
 * A validação estrutural que já existia (`Array.isArray`) aceita `[]` como resposta
 * válida. Era o buraco: bastava a API devolver lista vazia ou parcial para o build
 * seguir verde e publicar milhares de 404 em URLs reais.
 *
 * Estes números NÃO são a contagem esperada — são piso de sanidade, calibrados abaixo
 * do MENOR ambiente (dev: 2.090 paróquias, 381 cidades, 12 UFs; prod: 4.727, 988, 26).
 * Servem para pegar truncamento catastrófico (vazio, ou uma fração do total) sem
 * quebrar com variação legítima da base. Um piso absoluto não pega truncamento
 * parcial suave (ex.: 3.000 de 4.727 em prod) — para isso o guard de cobertura do
 * postbuild é a segunda linha, e a terceira seria comparar com o build anterior.
 */
const PISO_ITENS = {
  'paroquias.json': 1000,
  'cidades.json': 200,
  'estados.json': 5,
};

/**
 * Baixa `rota` para `arquivo`. `tipo`:
 *  - 'array'  → valida Array (bulks de cidades/paróquias/estados);
 *  - 'objeto' → valida objeto não-array (árvore de intenção /v2/seo/missa-dia/{dia}).
 *
 * Bulks com piso em PISO_ITENS são CRÍTICOS: em qualquer falha a função lança, o
 * arquivo NÃO é gravado e o prebuild aborta (ver main). Os demais seguem best-effort —
 * as rotas deles continuam no `navigationFallback`, então no pior caso caem no shell
 * CSR em 200, nunca em 404.
 */
async function baixar(base, rota, arquivo, tipo = 'array') {
  const critico = arquivo in PISO_ITENS;
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

    // Piso ANTES de gravar: cache reprovado nunca chega ao disco, para não ser
    // confundido com cache bom por nenhum passo posterior.
    if (critico && dados.length < PISO_ITENS[arquivo]) {
      throw new Error(
        `apenas ${dados.length} itens, abaixo do piso de ${PISO_ITENS[arquivo]} — ` +
        `resposta truncada ou incompleta`,
      );
    }

    mkdirSync(CACHE_DIR, { recursive: true });
    const json = JSON.stringify(dados);
    writeFileSync(join(CACHE_DIR, arquivo), json);
    const ms = Date.now() - inicio;
    const mb = (json.length / 1_048_576).toFixed(1);
    const qtd = Array.isArray(dados) ? `${dados.length} itens` : 'árvore';
    const piso = critico ? ` [crítico, piso ${PISO_ITENS[arquivo]}]` : '';
    console.log(`[prerender-cache] ${qtd} de ${rota} → ${arquivo} (${mb} MB, ${ms}ms)${piso}.`);
    return true;
  } catch (err) {
    const msg = err?.message ?? err;
    if (critico) {
      console.error(`\n❌ [prerender-cache] bulk CRÍTICO ${rota} falhou: ${msg}`);
      throw err;
    }
    console.warn(`[prerender-cache] falha ao baixar ${rota} (${msg}) — interceptor fará fetch ao vivo.`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const base = lerApiUrl();
  console.log(`[prerender-cache] ambiente=${ENV} base=${base}`);

  // allSettled (não all) para que TODOS os bulks sejam tentados e o log mostre todas
  // as falhas de uma vez — com `all`, a primeira rejeição esconderia as demais e o
  // diagnóstico viraria uma falha por execução.
  const tarefas = [
    baixar(base, '/v2/seo/cidades', 'cidades.json'),
    baixar(base, '/v2/seo/paroquias', 'paroquias.json'),
    // Fase 3 — Estado (array de UFs) + árvore de intenção por dia (objeto).
    baixar(base, '/v2/seo/estados', 'estados.json'),
    ...DIAS.map((d) => baixar(base, `/v2/seo/missa-dia/${d}`, `missa-${d}.json`, 'objeto')),
  ];
  const resultados = await Promise.allSettled(tarefas);

  const criticasFalharam = resultados.filter((r) => r.status === 'rejected');
  if (criticasFalharam.length > 0) {
    console.error(
      `\n   ${criticasFalharam.length} bulk(s) crítico(s) sem cache válido. Build ABORTADO.\n` +
      `   Sem esse cache o prerender sai vazio: /missas/* está FORA do navigationFallback,\n` +
      `   então cada cidade faltante vira 404 numa URL REAL; e as páginas de paróquia\n` +
      `   caem todas no shell CSR, sem HTML para o Google.\n` +
      `   Causa mais comum: cold start da API (503 nos primeiros segundos). Confira\n` +
      `   ${base}/health e rode de novo — se responder 200, era só a instância acordando.\n`,
    );
    process.exit(1);
  }
}

main();
