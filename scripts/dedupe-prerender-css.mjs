/**
 * Postbuild (Auditoria2 / Fase 2.5): deduplica o CSS inline das páginas
 * prerenderizadas.
 *
 * Problema: o PrimeNG v19 injeta o tema inteiro (~74 KB de <style>) em runtime, e
 * o prerender captura isso IDÊNTICO em cada página. Com milhares de páginas, esses
 * <style> repetidos estouram o limite de 250 MB do Azure SWA (Free) — e cresce
 * linearmente com o nº de paróquias.
 *
 * Solução: junta todos os blocos <style> ÚNICOS (PrimeNG + estilos de componente,
 * que são scoped por _ngcontent, então inofensivos quando compartilhados) num único
 * arquivo `prerender-shared-<hash>.css`, linkado no <head> de cada página, e remove
 * os <style> inline. A página cai de ~119 KB para ~45 KB.
 *
 * Seguro para hydration: o Angular hidrata o DOM do <body>, não os <style> do
 * <head> (que só evitam FOUC pré-hidratação); o PrimeNG re-injeta seus estilos no
 * cliente de qualquer forma. A ordem dos estilos é a de primeira-ocorrência, igual
 * em todas as páginas (cascata consistente).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BROWSER_DIR = join(__dirname, '..', 'dist', 'busca-missa', 'browser');
const STYLE_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
const INNER_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/i;

function listarHtml(dir) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listarHtml(p));
    else if (nome.endsWith('.html')) out.push(p);
  }
  return out;
}

function main() {
  const arquivos = listarHtml(BROWSER_DIR);
  // 1ª passada: coletar blocos <style> únicos (por conteúdo interno), em ordem.
  const unicos = new Map(); // innerCSS -> índice
  const ordem = [];
  for (const f of arquivos) {
    const html = readFileSync(f, 'utf-8');
    for (const bloco of html.match(STYLE_RE) ?? []) {
      const inner = bloco.match(INNER_RE)?.[1] ?? '';
      if (!inner.trim()) continue;
      if (!unicos.has(inner)) { unicos.set(inner, ordem.length); ordem.push(inner); }
    }
  }
  if (ordem.length === 0) { console.log('[dedupe-css] nenhum <style> inline — nada a fazer.'); return; }

  const cssCombinado = ordem.join('\n');
  const hash = createHash('sha256').update(cssCombinado).digest('hex').slice(0, 16);
  const nomeArquivo = `prerender-shared-${hash}.css`;
  writeFileSync(join(BROWSER_DIR, nomeArquivo), cssCombinado);
  const linkTag = `<link rel="stylesheet" href="/${nomeArquivo}">`;

  // 2ª passada: remover <style> inline e linkar o arquivo compartilhado.
  let paginas = 0, bytesAntes = 0, bytesDepois = 0;
  for (const f of arquivos) {
    const orig = readFileSync(f, 'utf-8');
    if (!STYLE_RE.test(orig)) continue;
    bytesAntes += Buffer.byteLength(orig);
    // Remove todos os <style> e injeta 1 <link> antes de </head>.
    let novo = orig.replace(STYLE_RE, '');
    novo = novo.includes('</head>')
      ? novo.replace('</head>', `${linkTag}</head>`)
      : linkTag + novo;
    writeFileSync(f, novo);
    bytesDepois += Buffer.byteLength(novo);
    paginas++;
  }
  const mb = (n) => (n / 1_048_576).toFixed(1);
  console.log(
    `[dedupe-css] ${paginas} páginas | ${ordem.length} blocos únicos → ${nomeArquivo} (${(cssCombinado.length / 1024).toFixed(1)} KB). ` +
    `HTML: ${mb(bytesAntes)} MB → ${mb(bytesDepois)} MB (economia ${mb(bytesAntes - bytesDepois)} MB).`,
  );
}

main();
