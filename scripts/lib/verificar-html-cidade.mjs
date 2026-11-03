// Decisão do guard de tamanho do HTML das páginas de cidade (A2, 03/11/2026).
// Sem disco: recebe { rota, bytes } e devolve o veredito (o script em scripts/ faz o I/O).
//
// Por que existe: o Googlebot lê no máximo 2 MB de cada URL — o que passar disso não é
// indexado (developers.google.com/search/docs/crawling-indexing/googlebot). Em 03/11
// /missas/sp/sao-paulo tinha 3,32 MB e /missas/rj/rio-de-janeiro 2,71 MB, com o corte
// caindo no ng-state. O limite aqui é 1,8 MB para deixar folga de crescimento.
//
// Medida: bytes do HTML ORIGINAL, sem compressão — é o que o limite de 2 MB do Googlebot
// conta (a compressão de transporte não entra). 1 MB = 1.000.000 bytes, o mais estrito.

export const LIMITE_BYTES = 1_800_000;

/** `missas/{uf}/{cidade}/index.html` → `/missas/{uf}/{cidade}`; outros caminhos → null. */
export function rotaDaCidade(caminhoRelativo) {
  const partes = caminhoRelativo.split(/[\\/]/);
  if (partes.length !== 4 || partes[0] !== 'missas' || partes[3] !== 'index.html') return null;
  return `/missas/${partes[1]}/${partes[2]}`;
}

export const emMB = (bytes) => (bytes / 1_000_000).toFixed(2);

/**
 * Veredito sobre as páginas de cidade. `ofensoras` vem por tamanho decrescente;
 * `maiores` são as 5 maiores (para o log, passando ou não).
 */
export function verificarHtmlCidade(paginas, limite = LIMITE_BYTES) {
  const ordenadas = [...paginas].sort((a, b) => b.bytes - a.bytes);
  const ofensoras = ordenadas.filter((p) => p.bytes > limite);
  return { ok: ofensoras.length === 0, lidas: paginas.length, ofensoras, maiores: ordenadas.slice(0, 5) };
}
