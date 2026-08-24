/**
 * Normalização de texto para BUSCA — fonte única.
 *
 * Existiam três cópias quase idênticas disto (`cidades`, `estado`, `missa-agora`),
 * e duas delas traziam os combinantes U+0300–U+036F LITERAIS dentro da classe de
 * caracteres: caracteres invisíveis no editor, que qualquer normalização acidental
 * do arquivo (ou um copiar-e-colar por outro editor) transformaria em regex morta,
 * sem erro de compilação e sem teste quebrando — a busca só passaria a ignorar
 * acentos silenciosamente. Aqui o intervalo é escrito com escapes.
 *
 * Além de tirar acento e caixa, `'`, `-` e `.` viram ESPAÇO. É o que faz
 * "Itapejara d'Oeste", "Itapejara dOeste" e "itapejara d oeste" casarem com o mesmo
 * registro, e o que permite tratar a consulta como uma lista de palavras soltas
 * (ver `tokensDeBusca`). Como os dois lados da comparação passam por aqui, a
 * mudança é simétrica: nada que casava antes deixa de casar.
 */
export function normalizarTexto(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`\-.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Consulta → palavras soltas. É isto que faz "Curitiba Nossa Senhora" funcionar:
 * um item casa quando TODOS os tokens aparecem no seu texto de busca, em qualquer
 * ordem e sem precisar ser contíguos. Um `includes` da frase inteira exigiria que
 * a pessoa digitasse exatamente na ordem em que o dado foi cadastrado.
 */
export function tokensDeBusca(consulta: string | null | undefined): string[] {
  const q = normalizarTexto(consulta);
  return q ? q.split(' ') : [];
}

/** `alvo` precisa já vir normalizado — normalizar aqui custaria caro no laço. */
export function casaTokens(alvoNormalizado: string, tokens: string[]): boolean {
  return tokens.every((t) => alvoNormalizado.includes(t));
}
