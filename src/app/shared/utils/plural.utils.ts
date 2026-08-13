/**
 * Concordância singular/plural real para os contadores dos hubs de navegação
 * (`/cidades`, `/estados`, `/missas/:uf`). Substitui o padrão "3 paróquia(s)",
 * que é microcopy de engenharia, não texto de produto.
 */

/** "1 paróquia" / "3 paróquias" — troca só o sufixo, para palavras regulares em -a/-o. */
export function pluralizar(quantidade: number, singular: string, plural: string): string {
  const palavra = quantidade === 1 ? singular : plural;
  return `${quantidade} ${palavra}`;
}

/** "1 paróquia" (singular real quando quantidade === 1). */
export function paroquias(quantidade: number): string {
  return pluralizar(quantidade, 'paróquia', 'paróquias');
}

/** "1 cidade" (singular real quando quantidade === 1). */
export function cidades(quantidade: number): string {
  return pluralizar(quantidade, 'cidade', 'cidades');
}

/** "1 estado" (singular real quando quantidade === 1). */
export function estados(quantidade: number): string {
  return pluralizar(quantidade, 'estado', 'estados');
}

/**
 * Meta padrão dos cards de hub: "577 paróquias · 159 cidades" — sem "(s)" e
 * com singular/plural corretos nos dois extremos.
 */
export function metaParoquiasCidades(totalParoquias: number, totalCidades: number): string {
  return `${paroquias(totalParoquias)} · ${cidades(totalCidades)}`;
}
