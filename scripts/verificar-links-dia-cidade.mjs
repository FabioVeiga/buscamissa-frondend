// Guard pós-build: nenhuma página PRERENDERIZADA pode linkar a folha CSR
// `/missa-{dia}/{uf}/{cidade}` (ver scripts/lib/verificar-links-dia-cidade.mjs).
//
// Uso: node scripts/verificar-links-dia-cidade.mjs
//
// Varre TODO o HTML de dist/<app>/browser — não só as páginas de dia —, porque um
// link novo para a folha pode nascer em qualquer componente prerenderizado. Os
// shells CSR e o 404.html entram também: não têm esses links, e varrer tudo evita
// uma lista de exceções que envelhece.

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import { verificarLinksDiaCidade } from './lib/verificar-links-dia-cidade.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function falhar(msg) {
  console.error(`\n❌ [links-dia-cidade] ${msg}`);
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

function* htmls(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) yield* htmls(p);
    else if (nome.endsWith('.html')) yield p;
  }
}

const browser = acharBrowserDir();
if (!browser) falhar('dist/<app>/browser não encontrado — rode depois do ng build.');

const paginas = [];
for (const arquivo of htmls(browser)) {
  paginas.push({ arquivo: relative(browser, arquivo), html: readFileSync(arquivo, 'utf-8') });
}

const { ok, lidas, ofensores } = verificarLinksDiaCidade(paginas);

if (lidas === 0) falhar('nenhuma página prerenderizada encontrada para verificar.');

if (!ok) {
  const total = ofensores.reduce((n, o) => n + o.links.length, 0);
  console.error(`\n❌ [links-dia-cidade] ${ofensores.length} página(s) prerenderizada(s) linkam ${total} URL(s) /missa-{dia}/{uf}/{cidade}.`);
  console.error('   A folha é CSR: no HTML inicial vira a casca da home, e o GSC a agrupa como duplicata.');
  console.error('   Aponte para /missas/{uf}/{cidade}?dia=... (ver intencao.component.html).\n');
  for (const o of ofensores.slice(0, 10)) {
    console.error(`   ${o.arquivo}: ${o.links.slice(0, 3).join(', ')}${o.links.length > 3 ? ` (+${o.links.length - 3})` : ''}`);
  }
  if (ofensores.length > 10) console.error(`   … e mais ${ofensores.length - 10} página(s).`);
  process.exit(1);
}

console.log(`[links-dia-cidade] OK — ${lidas} páginas prerenderizadas, nenhum link para /missa-{dia}/{uf}/{cidade}.`);
