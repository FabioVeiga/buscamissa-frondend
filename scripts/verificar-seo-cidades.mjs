// Guard pós-build: linha de base de SEO do hub `/cidades`
// (ver scripts/lib/verificar-seo-cidades.mjs).
//
// Uso:
//   node scripts/verificar-seo-cidades.mjs
//       Lê dist/<app>/browser/cidades/index.html e compara os links com o bulk em
//       .prerender-cache/estados.json (a mesma fonte que o componente renderiza).
//
//   node scripts/verificar-seo-cidades.mjs --html <arquivo> [--json <saida.json>]
//       Lê um HTML qualquer (ex.: o de produção baixado com curl), sem bulk: a
//       conferência é interna (links × ItemList). `--json` grava o resumo, para
//       comparar antes × depois de uma mudança.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  analisarHtmlCidades, resumir, rotasEsperadas, verificarSeoCidades,
} from './lib/verificar-seo-cidades.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function falhar(msg) {
  console.error(`\n❌ [seo-cidades] ${msg}`);
  process.exit(1);
}

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : null;
}

function acharHtmlDoDist() {
  const dist = join(ROOT, 'dist');
  if (!existsSync(dist)) return null;
  for (const app of readdirSync(dist)) {
    const p = join(dist, app, 'browser', 'cidades', 'index.html');
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

const htmlAvulso = argumento('--html');
const arquivo = htmlAvulso ?? acharHtmlDoDist();
if (!arquivo || !existsSync(arquivo)) {
  falhar(
    htmlAvulso
      ? `arquivo não encontrado: ${htmlAvulso}`
      : 'dist/<app>/browser/cidades/index.html não encontrado — /cidades deixou de ser prerenderizada ou o ng build não rodou.',
  );
}

let esperadas = null;
if (!htmlAvulso) {
  const cache = join(ROOT, '.prerender-cache', 'estados.json');
  if (!existsSync(cache)) falhar('.prerender-cache/estados.json não encontrado — rode o prebuild.');
  esperadas = rotasEsperadas(JSON.parse(readFileSync(cache, 'utf8')));
  if (esperadas.size === 0) falhar('.prerender-cache/estados.json não tem nenhuma cidade.');
}

const analise = analisarHtmlCidades(readFileSync(arquivo, 'utf8'));
const resumo = resumir(analise);
const { ok, problemas } = verificarSeoCidades(analise, esperadas);

console.log(
  `[seo-cidades] ${resumo.linksCidade} links de cidade em ${resumo.ufsComLink} UFs` +
    (esperadas ? ` | bulk: ${esperadas.size}` : ' | sem bulk (conferência interna)') +
    ` | ItemList: ${resumo.itemListNumberOfItems} | JSON-LD: ${resumo.jsonLd.join(', ')}` +
    ` | h1: ${JSON.stringify(resumo.h1)} | ${resumo.bytes.toLocaleString('pt-BR')} B`,
);

const saida = argumento('--json');
if (saida) writeFileSync(saida, JSON.stringify(resumo, null, 2) + '\n');

if (!ok) {
  console.error(`\n❌ [seo-cidades] ${problemas.length} problema(s) no HTML prerenderizado de /cidades:`);
  for (const p of problemas) console.error(`   ${p}`);
  console.error('   /cidades é o hub com mais links internos do site: os links de cidade precisam estar');
  console.error('   no HTML inicial (sem JavaScript), com canonical, robots e JSON-LD intactos.\n');
  process.exit(1);
}
console.log('✓ [seo-cidades] links, canonical, robots, title, description, h1 e JSON-LD preservados.');
