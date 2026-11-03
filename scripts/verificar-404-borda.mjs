// Guard pós-build das regras de 404 na borda (URLs de paróquia mortas).
//
// Uso:  node scripts/verificar-404-borda.mjs <staging|prod>
//
// O ambiente é OBRIGATÓRIO e explícito — vem do próprio script npm
// (postbuild:staging / postbuild:prod), nunca de branch ou variável de ambiente.
// Sem argumento, ou com qualquer valor que não seja "staging" ou "prod", o guard
// falha: um build de produção nunca cai no modo tolerante por omissão.
//
// Lê o que o build acabou de produzir:
//   - dist/<app>/browser/staticwebapp.config.json  (o config que será publicado)
//   - dist/<app>/browser/sitemap.xml               (gerado no prebuild)
//   - .prerender-cache/paroquias.json              (o bulk do ambiente)
//   - dist/<app>/browser/paroquia/.../index.html   (páginas prerenderizadas)
//
// A decisão é de scripts/lib/verificar-404-borda.mjs. Aqui só entra disco: em
// staging, as regras que colidem com o build saem do config do DIST (o arquivo
// versionado em src/ não muda); em prod, qualquer colisão é exit 1.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { AMBIENTES, regras404, verificar404Borda } from './lib/verificar-404-borda.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function falhar(msg) {
  console.error(`\n❌ [404-borda] ${msg}`);
  process.exit(1);
}

const ambiente = process.argv[2];
if (!AMBIENTES.includes(ambiente)) {
  falhar(`ambiente ausente ou inválido (${JSON.stringify(ambiente)}). Uso: verificar-404-borda.mjs <staging|prod>`);
}

/** dist/<app>/browser que contém o staticwebapp.config.json. */
function acharBrowserDir() {
  const dist = join(ROOT, 'dist');
  if (!existsSync(dist)) return null;
  for (const app of readdirSync(dist)) {
    const dir = join(dist, app, 'browser');
    if (existsSync(join(dir, 'staticwebapp.config.json'))) return dir;
  }
  return null;
}

const browserDir = acharBrowserDir();
if (!browserDir) falhar('staticwebapp.config.json não está no dist — rode o build antes.');

const caminhoConfig = join(browserDir, 'staticwebapp.config.json');
const bruto = readFileSync(caminhoConfig, 'utf-8');
const config = JSON.parse(bruto);

const caminhoBulk = join(ROOT, '.prerender-cache', 'paroquias.json');
if (!existsSync(caminhoBulk)) falhar(`bulk ausente (${caminhoBulk}) — sem ele não dá para provar que as URLs estão mortas.`);
const bulk = new Set(
  JSON.parse(readFileSync(caminhoBulk, 'utf-8'))
    .filter((p) => p?.uf && p?.cidadeSlug && p?.slug)
    .map((p) => `/paroquia/${p.uf}/${p.cidadeSlug}/${p.slug}`.toLowerCase()),
);

const caminhoSitemap = join(browserDir, 'sitemap.xml');
if (!existsSync(caminhoSitemap)) falhar(`sitemap ausente no dist (${caminhoSitemap}).`);
const sitemap = new Set(
  [...readFileSync(caminhoSitemap, 'utf-8').matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim().replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, ''))
    .filter((p) => p.startsWith('/paroquia/')),
);

const existeNoDist = (rota) =>
  existsSync(join(browserDir, rota, 'index.html')) || existsSync(join(browserDir, `${rota}.html`));

const serializar = (c) => `${JSON.stringify(c, null, 2)}\n`;
const bytesFinais = (c) => Buffer.byteLength(c === config ? bruto : serializar(c));

const total = regras404(config).length;
const r = verificar404Borda({ config, ambiente, bulk, sitemap, existeNoDist, bytesFinais });

console.log(`[404-borda] ambiente=${ambiente} | ${total} regra(s) 404 | ${r.semColisao.length} sem colisão | ${r.colisoes.length} com colisão`);
for (const c of r.colisoes) console.log(`   colisão: ${c.rota} → ${c.onde.join(', ')}`);

if (r.avisos.length) {
  console.warn(`\n⚠️  [404-borda] ${r.removidas.length} regra(s) removida(s) do artefato de ${ambiente} (a lista versionada não muda):`);
  for (const a of r.avisos) console.warn(`   ${a}`);
}

if (r.erros.length) {
  console.error(`\n❌ [404-borda] ${r.erros.length} problema(s):`);
  for (const e of r.erros) console.error(`   ${e}`);
  process.exit(1);
}

if (r.removidas.length) writeFileSync(caminhoConfig, serializar(r.config));
console.log(`✅ [404-borda] ${regras404(r.config).length} regra(s) 404 publicada(s) | config final ${bytesFinais(r.config)} B.`);
