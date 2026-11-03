// Guard pós-build: nenhuma página de cidade prerenderizada pode passar de 1,8 MB de
// HTML (ver scripts/lib/verificar-html-cidade.mjs).
//
// Uso: node scripts/verificar-html-cidade.mjs
//
// Mede TODAS as páginas `missas/{uf}/{cidade}/index.html` do dist final (depois do
// dedupe de CSS), em bytes do arquivo, sem compressão.

import { existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { emMB, LIMITE_BYTES, rotaDaCidade, verificarHtmlCidade } from './lib/verificar-html-cidade.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function falhar(msg) {
  console.error(`\n❌ [html-cidade] ${msg}`);
  process.exit(1);
}

function acharBrowserDir() {
  const dist = join(ROOT, 'dist');
  if (!existsSync(dist)) return null;
  for (const app of readdirSync(dist)) {
    const p = join(dist, app, 'browser');
    if (existsSync(p) && statSync(p).isDirectory()) return p;
  }
  return null;
}

const browser = acharBrowserDir();
if (!browser) falhar('dist/<app>/browser não encontrado — rode depois do ng build.');

const paginas = [];
const missas = join(browser, 'missas');
if (existsSync(missas)) {
  for (const uf of readdirSync(missas)) {
    const dirUf = join(missas, uf);
    if (!statSync(dirUf).isDirectory()) continue;
    for (const cidade of readdirSync(dirUf)) {
      const arquivo = join(dirUf, cidade, 'index.html');
      if (!existsSync(arquivo)) continue;
      const rota = rotaDaCidade(`missas/${uf}/${cidade}/index.html`);
      if (rota) paginas.push({ rota, bytes: statSync(arquivo).size });
    }
  }
}

const { ok, lidas, ofensoras, maiores } = verificarHtmlCidade(paginas);
if (lidas === 0) falhar('nenhuma página de cidade encontrada em missas/{uf}/{cidade}/index.html.');

const linha = (p) => `${p.rota}: ${p.bytes.toLocaleString('pt-BR')} B (${emMB(p.bytes)} MB)`;
console.log(`[html-cidade] ${lidas} páginas de cidade | limite ${emMB(LIMITE_BYTES)} MB (HTML sem compressão) | maiores:`);
for (const p of maiores) console.log(`   ${linha(p)}`);

if (!ok) {
  console.error(`\n❌ [html-cidade] ${ofensoras.length} página(s) de cidade acima de ${emMB(LIMITE_BYTES)} MB:`);
  for (const p of ofensoras) console.error(`   ${linha(p)}`);
  console.error('   O Googlebot lê só os primeiros 2 MB de cada URL. Enxugue o ng-state ou o HTML');
  console.error('   da cidade (ver src/app/core/middleware/prerender-cidade-enxuta.ts).\n');
  process.exit(1);
}
console.log(`✓ [html-cidade] todas as páginas de cidade dentro de ${emMB(LIMITE_BYTES)} MB.`);
