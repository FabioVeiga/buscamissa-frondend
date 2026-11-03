/**
 * Igrejas da página de CIDADE sem o que ela não lê — só no prerender (A2, 03/11/2026).
 *
 * O `ng-state` de `/missas/sp/sao-paulo` tinha 1,72 MB de 3,32 MB, acima do limite de
 * 2 MB que o Googlebot lê por URL. O mesmo objeto alimenta o render do servidor e o
 * TransferState (ver PrerenderCidadeInterceptor), então o HTML e a hidratação continuam
 * iguais: só sai o que nenhum componente da cidade lê. A API não muda, e a navegação no
 * browser (fora do prerender) segue recebendo a resposta completa.
 *
 * Lista de REMOÇÃO, não de permissão: um campo novo que a cidade passe a usar nunca é
 * cortado por engano. Os removidos são lidos só no detalhe da paróquia, na home ou no
 * /missa-agora — e o detalhe busca o próprio endpoint, sem reaproveitar este objeto.
 */

/** Campos da igreja que a página de cidade não lê. */
export const CAMPOS_IGREJA_FORA_DA_CIDADE = [
  'redesSociais',
  'contato',
  'paroco',
  'circunscricao',
  'reportarProblema',
  'sessoes',
  'alteracao',
] as const;

/**
 * Campos da missa que a página de cidade não lê. O selo usa `statusConfianca`,
 * `ultimaValidacao` e `fontePrincipal`, que FICAM; estes quatro são textos e notas
 * derivados que só o detalhe, a home e o /missa-agora mostram.
 */
export const CAMPOS_MISSA_FORA_DA_CIDADE = [
  'descricaoConfianca',
  'fonteLabel',
  'nivelConfianca',
  'scoreConfianca',
] as const;

type Objeto = Record<string, unknown>;

const ehObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Cópia rasa sem os campos removidos e, se `semNulos`, sem as chaves de valor `null`.
 * Arrays (inclusive vazias) e objetos aninhados ficam: o código da cidade usa
 * `.length` e acesso encadeado neles.
 */
function enxugarObjeto(o: Objeto, remover: readonly string[], semNulos: boolean): Objeto {
  const saida: Objeto = {};
  for (const [chave, valor] of Object.entries(o)) {
    if (remover.includes(chave)) continue;
    if (semNulos && valor === null) continue;
    saida[chave] = valor;
  }
  return saida;
}

/**
 * Igrejas para o prerender da página de cidade. Não altera a entrada (o bulk em
 * memória é compartilhado entre as rotas do build).
 *
 * `semNulos` tira as chaves `null` da igreja, de `endereco` e de cada missa. A página
 * trata `null` e ausente do mesmo jeito (`!= null`, `??`, truthiness; o único `!==
 * undefined`, em mass-time.utils, cai em `false` nos dois casos) — o spec de paridade
 * (`prerender-cidade-enxuta.spec.ts`) compara o DOM renderizado nos três formatos.
 */
export function enxugarIgrejasCidade(igrejas: unknown, { semNulos = true }: { semNulos?: boolean } = {}): unknown {
  if (!Array.isArray(igrejas)) return igrejas;
  return igrejas.map((igreja) => {
    if (!ehObjeto(igreja)) return igreja;
    const saida = enxugarObjeto(igreja, CAMPOS_IGREJA_FORA_DA_CIDADE, semNulos);
    if (ehObjeto(saida['endereco'])) saida['endereco'] = enxugarObjeto(saida['endereco'], [], semNulos);
    if (Array.isArray(saida['missas'])) {
      saida['missas'] = saida['missas'].map((m) => (ehObjeto(m) ? enxugarObjeto(m, CAMPOS_MISSA_FORA_DA_CIDADE, semNulos) : m));
    }
    return saida;
  });
}
