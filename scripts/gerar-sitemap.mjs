import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buscarRotasSeo, normalizarBaseUrl } from './lib/seo-routes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Argumento: "staging" ou "prod" (default: prod)
const ENV = process.argv[2] ?? 'prod';

function lerApiUrl() {
  if (process.env.API_URL) return normalizarBaseUrl(process.env.API_URL);

  const envFile = ENV === 'staging'
    ? join(ROOT, 'src/environments/environment.staging.ts')
    : join(ROOT, 'src/environments/environment.production.ts');

  const conteudo = readFileSync(envFile, 'utf-8');
  const match = conteudo.match(/apiURL\s*:\s*["']([^"']+)["']/);
  if (!match) throw new Error(`apiURL não encontrado em ${envFile}`);

  // Remove /api/ do caminho — o endpoint /v2/seo/routes é rota absoluta
  return normalizarBaseUrl(match[1]);
}

const API_URL = lerApiUrl();
const BASE_URL = 'https://buscamissa.com.br';

const STATIC_PAGES = [
  { loc: '/home',          changefreq: 'daily',   priority: '1.0' },
  { loc: '/cidades',       changefreq: 'weekly',  priority: '0.7' },
  { loc: '/missa-agora',   changefreq: 'daily',   priority: '0.7' },
  { loc: '/como-funciona', changefreq: 'monthly', priority: '0.5' },
  { loc: '/nova',          changefreq: 'monthly', priority: '0.8' },
  { loc: '/contribuir',    changefreq: 'monthly', priority: '0.6' },
  { loc: '/solicitar',     changefreq: 'monthly', priority: '0.5' },
  { loc: '/anuncios',      changefreq: 'monthly', priority: '0.4' },
  { loc: '/termos',        changefreq: 'yearly',  priority: '0.3' },
  { loc: '/privacidade',   changefreq: 'yearly',  priority: '0.3' },
  { loc: '/cookies',       changefreq: 'yearly',  priority: '0.3' },
];

async function main() {
  // Fonte única (scripts/lib/seo-routes.mjs): já trata timeout, validação de
  // shape, dedupe, ordenação e degradação (retorna listas vazias se a API estiver
  // fora, gerando um sitemap só com as páginas estáticas em vez de derrubar o build).
  const { cities, parishes } = await buscarRotasSeo(API_URL);

  const urlEntries = [];

  for (const page of STATIC_PAGES) {
    urlEntries.push(`  <url>
    <loc>${BASE_URL}${page.loc}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`);
  }

  for (const city of cities) {
    const lastmod = city.lastModified ? `\n    <lastmod>${city.lastModified.substring(0, 10)}</lastmod>` : '';
    urlEntries.push(`  <url>
    <loc>${BASE_URL}/missas/${city.uf}/${city.citySlug}</loc>${lastmod}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  for (const parish of parishes) {
    const lastmod = parish.lastModified ? `\n    <lastmod>${parish.lastModified.substring(0, 10)}</lastmod>` : '';
    urlEntries.push(`  <url>
    <loc>${BASE_URL}/paroquia/${parish.uf}/${parish.citySlug}/${parish.slug}</loc>${lastmod}
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${urlEntries.join('\n\n')}

</urlset>
`;

  const dest = join(ROOT, 'public', 'sitemap.xml');
  writeFileSync(dest, xml, 'utf-8');
  console.log(`✓ sitemap.xml gerado: ${cities.length} cidades, ${parishes.length} paróquias`);
}

main();
