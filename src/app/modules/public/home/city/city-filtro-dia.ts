import { ehSemanal } from '../../../../shared/utils/recorrencia-missa';

/**
 * Filtro por dia da semana da página de cidade — regra ÚNICA (A7, 03/11/2026).
 *
 * Quem chega por `/missas/{uf}/{cidade}?dia=sabado` recebe o HTML prerenderizado sem
 * filtro (um HTML por caminho). Para a 1ª pintura já sair filtrada, um script inline no
 * `<head>` (src/index.html) marca `<html data-dia="N">` e o CSS esconde os cards cujo
 * `data-dias` não tem N. O `aplicarFiltros` do Angular e o `data-dias` do card usam esta
 * mesma regra: se divergissem, a lista mudaria na hidratação.
 */

/** A missa conta para o filtro de dia da semana? Só semanais: dia fixo do mês não tem dia da semana. */
export const missaNoDiaDaSemana = (m: any, dia: number): boolean => ehSemanal(m) && m.diaSemana === dia;

export const igrejaNoDiaDaSemana = (igreja: any, dia: number): boolean =>
  !!igreja?.missas?.some((m: any) => missaNoDiaDaSemana(m, dia));

/** Valor do `data-dias` do card: índices 0–6 separados por espaço (casa com `[data-dias~="N"]`). */
export function diasDaIgreja(igreja: any): string {
  const dias: number[] = [];
  for (let d = 0; d < 7; d++) if (igrejaNoDiaDaSemana(igreja, d)) dias.push(d);
  return dias.join(' ');
}

/** Item que o `*ngFor` da lista desenha. `pos` = posição entre os visíveis (-1 se oculto). */
export interface ItemLista {
  igreja: any;
  dias: string;
  oculta: boolean;
  pos: number;
}

export const itensVisiveis = (filtradas: any[]): ItemLista[] =>
  filtradas.map((igreja, pos) => ({ igreja, dias: diasDaIgreja(igreja), oculta: false, pos }));

/**
 * Lista da HIDRATAÇÃO com `?dia=`: o `*ngFor` hidrata por posição, então o cliente
 * precisa ter um item para cada card do servidor, com os visíveis exatamente nas
 * posições que o CSS já mostrava (`diasServidor[i]` contém `dia`). Nessas posições
 * entram as filtradas na ordem do cliente; nas demais, as que o filtro tira (ocultas).
 * Assim nenhum card visível muda de lugar e nenhuma view do servidor sobra na tela.
 *
 * Devolve `null` quando o DOM do servidor não corresponde ao dado (sem cards, contagem
 * diferente): aí vale a lista normal.
 */
export function intercalarComServidor(
  todas: any[],
  filtradas: any[],
  diasServidor: string[],
  dia: number,
): ItemLista[] | null {
  if (!diasServidor.length || diasServidor.length !== todas.length) return null;
  const chave = String(dia);
  const visiveisNoServidor = diasServidor.filter((d) => d.split(' ').includes(chave)).length;
  if (visiveisNoServidor !== filtradas.length) return null;

  const fora = todas.filter((ig) => !filtradas.includes(ig));
  let v = 0;
  let o = 0;
  return diasServidor.map((d) => {
    if (d.split(' ').includes(chave)) {
      const igreja = filtradas[v];
      return { igreja, dias: diasDaIgreja(igreja), oculta: false, pos: v++ };
    }
    const igreja = fora[o++];
    return { igreja, dias: diasDaIgreja(igreja), oculta: true, pos: -1 };
  });
}
