/**
 * Gera public/sitemap.xml ESTÁTICO no prebuild — contorno temporário enquanto o
 * proxy Node em frente ao domínio canônico (buscamissa.com.br, fora destes repos)
 * não repassa corretamente /sitemap.xml para a API (bug de infra separado, fora do
 * nosso alcance nesta sessão: o domínio resolve direto pra uma VM cujo código não
 * está versionado em nenhum repo acessível).
 *
 * Histórico: até 2026-07-25 o site gerava esse arquivo no build (ver commit
 * 2d89b5d "remove geração do sitemap estático — agora é dinâmico"); a ideia era o
 * proxy buscar a versão fresca direto da API a cada request. Como isso não está
 * funcionando (GSC reportando 404 em buscamissa.com.br/sitemap.xml, mesmo com a
 * API respondendo 200), este script busca o XML JÁ PRONTO do endpoint /sitemap.xml
 * da API (fonte única — sem duplicar a lógica de montagem/anti-thin/prioridades
 * que já vive no SitemapController) e grava como arquivo estático no dist.
 *
 * Trade-off: frescor = do último deploy, não em tempo real (paróquia nova só
 * aparece no próximo build/deploy). Aceitável como contorno; reverter quando o
 * proxy for corrigido (ver memória `topologia-proxy-node-buscamissa`).
 *
 * Best-effort: se a API estiver fora, NÃO grava o arquivo e segue o build
 * (exit 0) — melhor não ter sitemap novo do que travar o deploy por causa disso.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { normalizarBaseUrl } from './lib/seo-routes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TIMEOUT_MS = 30_000;

// Argumento: "staging" ou "prod" (default: prod) — mesmo contrato dos outros scripts.
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

async function main() {
  const base = lerApiUrl();
  const url = `${base}/sitemap.xml`;
  const inicio = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const xml = await res.text();
    if (!xml.includes('<urlset')) throw new Error('resposta não parece um sitemap XML válido');

    mkdirSync(join(ROOT, 'public'), { recursive: true });
    writeFileSync(join(ROOT, 'public', 'sitemap.xml'), xml, 'utf-8');

    const total = (xml.match(/<loc>/g) ?? []).length;
    console.log(`[sitemap-estatico] ${total} URLs de ${url} → public/sitemap.xml (${Date.now() - inicio}ms).`);
  } catch (err) {
    console.warn(`[sitemap-estatico] falha ao buscar ${url} (${err?.message ?? err}) — build segue sem regenerar o sitemap.`);
  } finally {
    clearTimeout(timer);
  }
}

main();
