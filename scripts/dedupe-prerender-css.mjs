/**
 * Postbuild (Auditoria2 / Fase 2.5): deduplica o CSS inline das páginas
 * prerenderizadas.
 *
 * Problema: o PrimeNG v19 injeta o tema inteiro (~74 KB de <style>) em runtime, e
 * o prerender captura isso IDÊNTICO em cada página. Com milhares de páginas, esses
 * <style> repetidos estouram o limite de 250 MB do Azure SWA (Free) — e cresce
 * linearmente com o nº de paróquias.
 *
 * Solução: junta os blocos <style> ÚNICOS (PrimeNG + estilos de componente, que são
 * scoped por _ngcontent, então inofensivos quando compartilhados) em arquivo(s)
 * `prerender-shared-<hash>.css`, linkado(s) no <head> de cada página, e remove os
 * <style> inline. A página cai de ~119 KB para ~45 KB.
 *
 * ── Divisão por ASSINATURA (P3.2.1) ──────────────────────────────────────────
 * Até 2026-09-06 saía UM arquivo com a UNIÃO dos blocos de todas as páginas. Isso
 * resolvia o tamanho, mas trocava CSS inline (zero requisição) por um <link>
 * render-blocking que trazia, para toda página, o CSS de todas as outras: uma
 * página de cidade baixava o datepicker (12,2 KB), o toast (6,0 KB) e o dialog
 * (3,7 KB) que só existem em paróquia e nos formulários.
 *
 * Agora agrupamos as páginas pela ASSINATURA — o conjunto exato de blocos que o
 * prerender colocou nelas — e emitimos um arquivo por assinatura. Cada página passa
 * a receber EXATAMENTE os blocos que já tinha inline, nem mais nem menos.
 *
 * Por que é seguro por construção: não há heurística nem análise de uso. O conjunto
 * vem do próprio HTML assado, então nenhuma regra pode faltar. A ordem da cascata é
 * preservada: os blocos de cada grupo saem na MESMA ordem global de primeira
 * ocorrência usada antes, apenas filtrada para os blocos daquele grupo.
 *
 * Medido no build de prod de 2026-09-06 (3.315 páginas, 71 blocos únicos, união de
 * 215 KB): 21 assinaturas distintas. Cidade fica com 40 KB (-81%), estado 33 KB
 * (-85%), intenção 24 KB (-89%), paróquia 84 KB (-61%).
 *
 * Custo: ~21 arquivos CSS em vez de 1 (contra folga de 764 no teto de 4.200 do
 * guard de distribuição) e ~760 KB a mais de CSS no dist, num dist de 146 MB.
 * Cache entre TIPOS de página se perde, mas só no primeiro carregamento de cada
 * tipo — navegação interna é SPA e não rebusca CSS.
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

/**
 * HTML que NÃO é página prerenderizada e por isso fica fora do dedupe.
 *
 * `404.html` é asset estático de `public/`, servido pelo Azure SWA em
 * `responseOverrides` — precisa ser autocontido, porque é a resposta terminal de uma
 * URL que não existe. Sem esta exceção o dedupe extraía o `<style>` inline dele e
 * punha no lugar um `<link>` para o CSS compartilhado: a página de erro passava a
 * depender de um request extra de ~197 KB (e de um hash que muda a cada build) para
 * renderizar. O dedupe existe para CSS repetido em milhares de páginas; um arquivo
 * único não tem o que deduplicar.
 */
const FORA_DO_DEDUPE = new Set(['404.html']);

function listarHtml(dir) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listarHtml(p));
    else if (nome.endsWith('.html') && !FORA_DO_DEDUPE.has(nome)) out.push(p);
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

/**
 * Enxuga o `<head>`: remove comentários descritivos e a indentação.
 *
 * Esses bytes vêm de `src/index.html` — documentação escrita para quem lê o fonte,
 * que o Angular copia para CADA página prerenderizada. Medido no build de prod de
 * 2026-08-13: 2,63 KB de comentários + 0,94 KB de indentação por página × 5.942
 * páginas ≈ 21 MB, num dist que bateu 226 MB contra o teto de 220.
 *
 * SÓ MEXE NO `<head>`, e isso é a garantia de segurança, não uma limitação:
 *
 *  - Hidratação acontece sob `<body>`. O Angular casa a árvore serializada com o DOM
 *    do cliente; mexer em text node ou comentário do body arrisca NG0500 e congela
 *    todo `@defer` da página sem erro visível (ver [[ssr-timers-quebram-prerender]],
 *    onde esse sintoma já custou caro).
 *  - E não há o que ganhar lá: medido na mesma amostra, o body tem 0,00 KB de
 *    comentário descritivo e 0,01 KB de indentação — o Angular já o emite minificado.
 *    Restringir ao head captura 3,57 dos 3,58 KB disponíveis (99,7%).
 *
 * Os `<!---->` (âncoras de hidratação) vivem todos no body e portanto nem são
 * alcançados. Ainda assim a regex de comentário exige conteúdo não-vazio, para que a
 * função continue correta se um dia um `<!---->` aparecer no head.
 *
 * Conteúdo de `<script>` e `<style>` é preservado intacto: o texto é fatiado nesses
 * blocos e só os pedaços FORA deles são transformados. Sem isso, colapsar espaço
 * dentro do JSON-LD ou dos scripts de consentimento seria mexer em dado e em código.
 */
const BLOCO_INTOCAVEL_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;

function enxugarHead(html) {
  const fim = html.indexOf('</head>');
  if (fim === -1) return html;
  const head = html.slice(0, fim);
  const resto = html.slice(fim);

  let saida = '';
  let ultimo = 0;
  BLOCO_INTOCAVEL_RE.lastIndex = 0;
  for (let m; (m = BLOCO_INTOCAVEL_RE.exec(head)) !== null; ) {
    saida += limparTrecho(head.slice(ultimo, m.index)) + m[0];
    ultimo = m.index + m[0].length;
  }
  saida += limparTrecho(head.slice(ultimo));

  return saida + resto;
}

/** Remove comentários com conteúdo e a indentação de início de linha. */
function limparTrecho(t) {
  return t
    // `[\s\S]*?\S[\s\S]*?` exige ao menos um caractere não-branco: `<!---->` e
    // `<!-- -->` são preservados por construção.
    .replace(/<!--[\s\S]*?\S[\s\S]*?-->/g, '')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n');
}

/**
 * Teto de arquivos CSS distintos. Hoje o build de prod produz 21 assinaturas; o teto
 * é folgado de propósito, para absorver crescimento normal da base.
 *
 * É uma VÁLVULA DE SEGURANÇA, não uma meta: se um refactor fizer a assinatura variar
 * por página (em vez de por tipo), o agrupamento degeneraria em milhares de arquivos
 * e estouraria o guard de distribuição do SWA. Passando daqui, voltamos ao arquivo
 * único — comportamento anterior, sempre correto, só menos ótimo — e logamos alto.
 */
const MAX_GRUPOS_CSS = 60;

function main() {
  const arquivos = listarHtml(BROWSER_DIR);
  // 1ª passada: coletar blocos <style> únicos (por conteúdo interno), em ordem,
  // e todos os ids de encapsulação usados (HTML + CSS entram no mesmo mapa).
  // Guardamos também QUAIS blocos cada página tinha — é o que permite emitir um
  // arquivo por assinatura em vez da união.
  const unicos = new Map(); // innerCSS -> índice
  const ordem = [];
  const idsEncap = new Set();
  const blocosPorPagina = new Map(); // arquivo -> Set(índice)
  for (const f of arquivos) {
    const html = readFileSync(f, 'utf-8');
    for (const achado of html.match(ENCAP_RE) ?? []) idsEncap.add(achado);
    const meus = new Set();
    for (const bloco of html.match(STYLE_RE) ?? []) {
      const inner = bloco.match(INNER_RE)?.[1] ?? '';
      if (!inner.trim()) continue;
      if (!unicos.has(inner)) { unicos.set(inner, ordem.length); ordem.push(inner); }
      meus.add(unicos.get(inner));
    }
    blocosPorPagina.set(f, meus);
  }
  if (ordem.length === 0) { console.log('[dedupe-css] nenhum <style> inline — nada a fazer.'); return; }

  const mapaEncap = montarMapaEncap(idsEncap);

  // Agrupa as páginas pela assinatura (conjunto exato de blocos). Páginas sem
  // <style> ficam de fora: elas não recebiam CSS inline e continuam sem <link>.
  const grupos = new Map(); // assinatura -> { indices, paginas[] }
  for (const [f, indices] of blocosPorPagina) {
    if (indices.size === 0) continue;
    const assinatura = [...indices].sort((a, b) => a - b).join(',');
    if (!grupos.has(assinatura)) grupos.set(assinatura, { indices, paginas: [] });
    grupos.get(assinatura).paginas.push(f);
  }

  const demais = grupos.size > MAX_GRUPOS_CSS;
  if (demais) {
    console.warn(
      `⚠️  [dedupe-css] ${grupos.size} assinaturas excede o teto de ${MAX_GRUPOS_CSS} — ` +
      'voltando ao arquivo ÚNICO (união). Correto, porém sem o ganho de LCP da divisão. ' +
      'Investigue o que fez a assinatura variar por página.',
    );
  }

  // Grupos finais. No fallback, um só grupo com a união dos blocos.
  const gruposFinais = demais
    ? [{ indices: new Set(ordem.map((_, i) => i)), paginas: [...grupos.values()].flatMap((g) => g.paginas) }]
    : [...grupos.values()];

  // Emite um CSS por grupo. Os índices saem ORDENADOS, então a ordem relativa dos
  // blocos dentro de cada arquivo é a mesma ordem global de primeira ocorrência de
  // antes — a cascata não muda, só some o que a página não usava.
  const arquivoDaPagina = new Map(); // arquivo HTML -> nome do CSS
  const emitidos = [];
  for (const g of gruposFinais) {
    // O hash sai do CSS JÁ encurtado: o nome do arquivo tem de refletir o conteúdo
    // final, senão dois builds diferentes poderiam compartilhar o mesmo nome.
    const css = encurtar([...g.indices].sort((a, b) => a - b).map((i) => ordem[i]).join('\n'), mapaEncap);
    const hash = createHash('sha256').update(css).digest('hex').slice(0, 16);
    const nome = `prerender-shared-${hash}.css`;
    writeFileSync(join(BROWSER_DIR, nome), css);
    emitidos.push({ nome, bytes: css.length, blocos: g.indices.size, paginas: g.paginas.length });
    for (const f of g.paginas) arquivoDaPagina.set(f, nome);
  }

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
    const cssDaPagina = arquivoDaPagina.get(f);
    if (temStyle && cssDaPagina) {
      const linkTag = `<link rel="stylesheet" href="/${cssDaPagina}">`;
      // Preload cedo no <head>: o CSS compartilhado é render-blocking, então
      // sinalizamos prioridade máxima e antecipamos a descoberta (mitiga o custo de
      // LCP de tê-lo externo em vez de inline). Ver [[swa-limite-tamanho-dedupe-css]].
      const preloadTag = `<link rel="preload" as="style" href="/${cssDaPagina}">`;
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
    // Por último: o enxugamento do head roda depois da injeção do preload/stylesheet
    // e do encurtamento de ids, para operar sobre o head já em sua forma final.
    novo = enxugarHead(novo);
    if (novo !== orig) writeFileSync(f, novo);
    bytesDepois += Buffer.byteLength(novo);
  }
  const mb = (n) => (n / 1_048_576).toFixed(1);
  const totalCss = emitidos.reduce((a, e) => a + e.bytes, 0);
  console.log(
    `[dedupe-css] ${paginas} páginas | ${ordem.length} blocos únicos → ` +
    `${emitidos.length} arquivo(s) CSS (${(totalCss / 1024).toFixed(1)} KB no total).`,
  );
  // Uma linha por grupo: é o que permite ver, num diff de log entre builds, se algum
  // tipo de página passou a carregar CSS que não é dele.
  for (const e of [...emitidos].sort((a, b) => b.paginas - a.paginas)) {
    console.log(
      `[dedupe-css]   ${String(e.paginas).padStart(5)} páginas | ` +
      `${String(e.blocos).padStart(3)} blocos | ${(e.bytes / 1024).toFixed(1).padStart(6)} KB | ${e.nome}`,
    );
  }
  console.log(
    `[dedupe-css] ${mapaEncap.size} ids de encapsulação encurtados em ${arquivos.length} páginas.`,
  );
  console.log(
    `[dedupe-css] HTML: ${mb(bytesAntes)} MB → ${mb(bytesDepois)} MB (economia ${mb(bytesAntes - bytesDepois)} MB).`,
  );
}

main();
