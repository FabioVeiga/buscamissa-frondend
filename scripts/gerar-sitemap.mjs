import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_URL = (process.env.API_URL ?? 'https://busca-missa.azurewebsites.net').replace(/\/$/, '');
const BASE_URL = 'https://buscamissa.com.br';

const STATIC_PAGES = [
  { loc: '/home',        changefreq: 'daily',   priority: '1.0' },
  { loc: '/nova',        changefreq: 'monthly',  priority: '0.8' },
  { loc: '/contribuir',  changefreq: 'monthly',  priority: '0.6' },
  { loc: '/solicitar',   changefreq: 'monthly',  priority: '0.5' },
  { loc: '/anuncios',    changefreq: 'monthly',  priority: '0.4' },
  { loc: '/termos',      changefreq: 'yearly',   priority: '0.3' },
  { loc: '/privacidade', changefreq: 'yearly',   priority: '0.3' },
  { loc: '/cookies',     changefreq: 'yearly',   priority: '0.3' },
];

async function main() {
  console.log(`Buscando rotas SEO em ${API_URL}/v2/seo/routes ...`);

  let data;
  try {
    const res = await fetch(`${API_URL}/v2/seo/routes`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    console.error(`Erro ao buscar /v2/seo/routes: ${err.message}`);
    process.exit(1);
  }

  const { cities = [], parishes = [] } = data;

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

  const dest = join(__dirname, '..', 'public', 'sitemap.xml');
  writeFileSync(dest, xml, 'utf-8');
  console.log(`✓ sitemap.xml gerado: ${cities.length} cidades, ${parishes.length} paróquias`);
}

main();
