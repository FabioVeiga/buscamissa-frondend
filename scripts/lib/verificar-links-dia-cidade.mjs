// Decisão do guard de links para a folha `/missa-{dia}/{uf}/{cidade}`.
// Sem disco: recebe o HTML e devolve o que achou (o script em scripts/ faz o I/O).
//
// Por que existe: a folha dia×cidade é RenderMode.Client. No HTML inicial ela é a
// casca da home (200, `index, follow`, sem canonical), e cada link para ela a partir
// de uma página prerenderizada virava uma URL "Duplicate, Google chose different
// canonical" no Search Console — 995 das 1.000 da amostra de 14/10/2026. Os links
// passaram a apontar para `/missas/{uf}/{cidade}?dia=`; este guard impede a volta.
//
// Conta como link tudo que o crawler usa para descobrir URL: `href` (absoluto ou
// relativo) e URL dentro de JSON-LD (`"item"`, `"url"`, `"@id"`). A rota em si
// continua no ar — o guard só proíbe LINKÁ-LA de HTML prerenderizado.

export const DIAS_INTENCAO = [
  'domingo',
  'segunda-feira',
  'terca-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sabado',
];

const DIA = DIAS_INTENCAO.join('|');
// /missa-{dia}/{uf}/{cidade} — exatamente 3 segmentos. `/missa-{dia}` e
// `/missa-{dia}/{uf}` (prerenderizados, válidos) não casam.
const CAMINHO = `/missa-(?:${DIA})/[a-z]{2}/[a-z0-9-]+(?![a-z0-9-]*/)`;
const ORIGEM = '(?:https?://(?:www\\.)?buscamissa\\.com\\.br)?';

const RE_HREF = new RegExp(`href\\s*=\\s*["']${ORIGEM}(${CAMINHO})`, 'gi');
const RE_JSONLD = new RegExp(`"(?:item|url|@id)"\\s*:\\s*"${ORIGEM}(${CAMINHO})`, 'gi');

/** Caminhos `/missa-{dia}/{uf}/{cidade}` linkados no HTML (sem duplicatas, em ordem). */
export function linksFolhaDiaCidade(html) {
  const achados = new Set();
  for (const re of [RE_HREF, RE_JSONLD]) {
    re.lastIndex = 0;
    for (const m of html.matchAll(re)) achados.add(m[1].toLowerCase());
  }
  return [...achados];
}

/**
 * Agrega o resultado de várias páginas. `paginas` = [{ arquivo, html }].
 * ok=false se QUALQUER página linkar a folha, ou se nenhuma página foi lida
 * (dist vazio não pode passar como "zero links").
 */
export function verificarLinksDiaCidade(paginas) {
  const ofensores = [];
  for (const { arquivo, html } of paginas) {
    const links = linksFolhaDiaCidade(html);
    if (links.length) ofensores.push({ arquivo, links });
  }
  return { ok: paginas.length > 0 && ofensores.length === 0, lidas: paginas.length, ofensores };
}
