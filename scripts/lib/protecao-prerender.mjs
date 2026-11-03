/**
 * Monta o conteúdo de `scripts/data/prerender-protecao.json` (critério V8 — ver
 * `selecionarParoquiasV8`). Função pura; o CLI é `scripts/gerar-protecao-prerender.mjs`.
 *
 *  - `atuais`: páginas de paróquia que o site publica hoje (as do sitemap publicado,
 *    que só lista o que tem HTML).
 *  - `protegidas`: as `atuais` com pelo menos `minCliques` cliques no Search Console.
 *  - `cidadesComDemanda`: cidades cuja página `/missas/{uf}/{cidade}` teve pelo menos
 *    `minCliques` cliques — são as que mantêm uma paróquia no piso.
 */

const RE_PAROQUIA = /^\/paroquia\/([^/]+)\/([^/]+)\/([^/?#]+)\/?$/;
const RE_CIDADE = /^\/missas\/([^/]+)\/([^/?#]+)\/?$/;

/** Caminho (ou URL absoluta) de paróquia → `uf/cidade/slug`, ou null. */
export function chaveDeParoquia(caminho) {
  const m = RE_PAROQUIA.exec(String(caminho ?? '').replace(/^https?:\/\/[^/]+/, ''));
  return m ? `${m[1].toLowerCase()}/${m[2]}/${m[3]}` : null;
}

/** Caminho (ou URL absoluta) de cidade → `uf/cidade`, ou null. */
export function chaveDeCidade(caminho) {
  const m = RE_CIDADE.exec(String(caminho ?? '').replace(/^https?:\/\/[^/]+/, ''));
  return m ? `${m[1].toLowerCase()}/${m[2]}` : null;
}

/** Soma cliques por chave (o GSC pode repetir o caminho por dispositivo). */
function somarCliques(linhas, extrairChave) {
  const total = new Map();
  for (const { caminho, cliques } of linhas) {
    const chave = extrairChave(caminho);
    if (chave) total.set(chave, (total.get(chave) ?? 0) + (Number(cliques) || 0));
  }
  return total;
}

export function montarProtecao({ atuais, gscParoquias, gscCidades, hoje, fontes, minCliques = 1 }) {
  const chavesAtuais = [...new Set(atuais.map(chaveDeParoquia).filter(Boolean))].sort();
  const cliquesParoquia = somarCliques(gscParoquias, chaveDeParoquia);
  const cliquesCidade = somarCliques(gscCidades, chaveDeCidade);

  const protegidas = chavesAtuais
    .filter((chave) => (cliquesParoquia.get(chave) ?? 0) >= minCliques)
    .map((chave) => ({ chave, cliques: cliquesParoquia.get(chave) }))
    .sort((a, b) => b.cliques - a.cliques || a.chave.localeCompare(b.chave));

  const cidadesComDemanda = [...cliquesCidade]
    .filter(([, cliques]) => cliques >= minCliques)
    .map(([chave]) => chave)
    .sort();

  return { versao: 1, geradoEm: hoje, fontes, criterios: { minCliques }, cidadesComDemanda, atuais: chavesAtuais, protegidas };
}
