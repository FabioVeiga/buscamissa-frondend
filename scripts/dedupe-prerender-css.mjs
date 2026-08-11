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
 *
 * ── 2º passo: encurtar os ids de encapsulação ────────────────────────────────
 * `_ngcontent-ng-c3521424731=""` aparece em CADA elemento do HTML assado — medido
 * em 13,4% do peso de uma página de paróquia (~16 MB no dist inteiro). Trocamos o
 * sufixo gerado pelo Angular por um índice curto (`_ngcontent-ng-c3521424731` →
 * `_ngc-7`), com o MESMO mapa aplicado ao HTML e ao CSS compartilhado.
 *
 * Por que é seguro: esses ids não aparecem em nenhum bundle .js (verificado: 0
 * ocorrências) — o Angular os gera em runtime e injeta o <style> correspondente
 * junto, para componentes criados no cliente. Ou seja, o par que precisa casar é
 * só HTML-prerenderizado ↔ CSS-compartilhado, e os dois são reescritos aqui no
 * mesmo passo, a partir do mesmo mapa.
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
/** Ids de encapsulação do Angular: _ngcontent-ng-c123 / _nghost-ng-c123. */
const ENCAP_RE = /_(ngcontent|nghost)-ng-c(\d+)/g;

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

/**
 * Mapa determinístico id-original → id-curto. Determinístico (ordenado pelo id
 * original) para que dois builds do mesmo conteúdo gerem o mesmo hash de CSS.
 */
function montarMapaEncap(ids) {
  const mapa = new Map();
  [...ids].sort().forEach((id, i) => {
    const tipo = id.startsWith('_ngcontent') ? 'ngc' : 'ngh';
    mapa.set(id, `_${tipo}-${i.toString(36)}`);
  });
  return mapa;
}

function encurtar(texto, mapa) {
  return texto.replace(ENCAP_RE, (achado) => mapa.get(achado) ?? achado);
}

function main() {
  const arquivos = listarHtml(BROWSER_DIR);
  // 1ª passada: coletar blocos <style> únicos (por conteúdo interno), em ordem,
  // e todos os ids de encapsulação usados (HTML + CSS entram no mesmo mapa).
  const unicos = new Map(); // innerCSS -> índice
  const ordem = [];
  const idsEncap = new Set();
  for (const f of arquivos) {
    const html = readFileSync(f, 'utf-8');
    for (const achado of html.match(ENCAP_RE) ?? []) idsEncap.add(achado);
    for (const bloco of html.match(STYLE_RE) ?? []) {
      const inner = bloco.match(INNER_RE)?.[1] ?? '';
      if (!inner.trim()) continue;
      if (!unicos.has(inner)) { unicos.set(inner, ordem.length); ordem.push(inner); }
    }
  }
  if (ordem.length === 0) { console.log('[dedupe-css] nenhum <style> inline — nada a fazer.'); return; }

  const mapaEncap = montarMapaEncap(idsEncap);
  // O hash sai do CSS JÁ encurtado: o nome do arquivo tem de refletir o conteúdo
  // final, senão dois builds diferentes poderiam compartilhar o mesmo nome.
  const cssCombinado = encurtar(ordem.join('\n'), mapaEncap);
  const hash = createHash('sha256').update(cssCombinado).digest('hex').slice(0, 16);
  const nomeArquivo = `prerender-shared-${hash}.css`;
  writeFileSync(join(BROWSER_DIR, nomeArquivo), cssCombinado);
  const linkTag = `<link rel="stylesheet" href="/${nomeArquivo}">`;
  // Preload cedo no <head>: o CSS compartilhado é render-blocking, então sinalizamos
  // prioridade máxima e antecipamos a descoberta (mitiga o custo de LCP de tê-lo
  // externo em vez de inline). Ver [[swa-limite-tamanho-dedupe-css]].
  const preloadTag = `<link rel="preload" as="style" href="/${nomeArquivo}">`;

  // 2ª passada: remover <style> inline, linkar o arquivo compartilhado e encurtar
  // os ids. TODA página passa pelo encurtamento — inclusive as sem <style>: uma
  // página que ficasse com os ids longos não casaria mais com o CSS compartilhado
  // (que só tem os curtos) e perderia a estilização.
  let paginas = 0, bytesAntes = 0, bytesDepois = 0;
  for (const f of arquivos) {
    const orig = readFileSync(f, 'utf-8');
    bytesAntes += Buffer.byteLength(orig);

    STYLE_RE.lastIndex = 0;
    const temStyle = STYLE_RE.test(orig);
    STYLE_RE.lastIndex = 0;

    let novo = orig;
    if (temStyle) {
      // Remove todos os <style>; injeta o preload cedo (logo após <head>) e o
      // stylesheet antes de </head>.
      novo = novo.replace(STYLE_RE, '');
      novo = /<head[^>]*>/.test(novo)
        ? novo.replace(/<head[^>]*>/, (h) => `${h}${preloadTag}`)
        : preloadTag + novo;
      novo = novo.includes('</head>')
        ? novo.replace('</head>', `${linkTag}</head>`)
        : linkTag + novo;
      paginas++;
    }

    novo = encurtar(novo, mapaEncap);
    if (novo !== orig) writeFileSync(f, novo);
    bytesDepois += Buffer.byteLength(novo);
  }
  const mb = (n) => (n / 1_048_576).toFixed(1);
  console.log(
    `[dedupe-css] ${paginas} páginas | ${ordem.length} blocos únicos → ${nomeArquivo} (${(cssCombinado.length / 1024).toFixed(1)} KB).`,
  );
  console.log(
    `[dedupe-css] ${mapaEncap.size} ids de encapsulação encurtados em ${arquivos.length} páginas.`,
  );
  console.log(
    `[dedupe-css] HTML: ${mb(bytesAntes)} MB → ${mb(bytesDepois)} MB (economia ${mb(bytesAntes - bytesDepois)} MB).`,
  );
}

main();
