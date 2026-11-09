import { Mass } from '../../core/interfaces/church.interface';
import {
  calcularProximaMissaCard,
  compararPorProximaMissa,
  diasSemanaisDeMissa,
  FiltroMissa,
  filtrarMissasCompativeis,
  formatarOutrosHorarios,
  rotuloContagem,
  rotuloDataMissa,
  rotuloDiaMissa,
} from './proxima-missa-card.utils';

const semanal = (diaSemana: number, horario: string): Mass => ({ diaSemana, horario, tipoRecorrencia: 0 });
const noMes = (diaSemana: number, horario: string, semanasDoMes: number): Mass => ({ diaSemana, horario, tipoRecorrencia: 1, semanasDoMes });
// O formulário grava diaSemana 0 no dia fixo: o valor não significa domingo.
const diaFixo = (diaDoMes: number, horario: string, diasSemanaExcecao?: number): Mass => ({ diaSemana: 0, horario, tipoRecorrencia: 2, diaDoMes, diasSemanaExcecao });
const filtro = (dia: number | null, horarioDe: string | null = null, horarioAte: string | null = null): FiltroMissa => ({ dia, horarioDe, horarioAte });
const horarios = (ms: Mass[]) => ms.map(m => m.horario);

// 09/11/2026 é uma segunda-feira.
const SEG_18H = new Date(2026, 10, 9, 18, 0);

/** Mesmos casos de BuscaPorFiltroV1Tests, no buscamissa-api-public. */
describe('filtrarMissasCompativeis — contrato com buscar-por-filtro', () => {
  it('sem filtro devolve todas', () => {
    const ms = [semanal(0, '07:00:00'), diaFixo(13, '19:00:00')];
    expect(filtrarMissasCompativeis(ms, null)).toEqual(ms);
    expect(filtrarMissasCompativeis(ms, filtro(null))).toEqual(ms);
  });

  [0, 1, 2, 3, 4, 5, 6].forEach(dia => {
    it(`dia ${dia} aceita só missa semanal nesse dia`, () => {
      const certa = semanal(dia, '07:00:00');
      expect(filtrarMissasCompativeis([certa, semanal((dia + 1) % 7, '07:00:00')], filtro(dia))).toEqual([certa]);
    });
  });

  it('dia e faixa valem para a mesma missa', () => {
    const ms = [semanal(0, '07:00:00'), semanal(4, '19:00:00')];
    expect(filtrarMissasCompativeis(ms, filtro(0, '18:00', '20:00'))).toEqual([]);
  });

  it('dia e horário exato valem para a mesma missa', () => {
    const ms = [semanal(0, '07:00:00'), semanal(4, '19:00:00'), semanal(0, '19:00:00')];
    expect(horarios(filtrarMissasCompativeis(ms, filtro(0, '19:00')))).toEqual(['19:00:00']);
    expect(filtrarMissasCompativeis(ms, filtro(0, '19:00')).length).toBe(1);
  });

  it('a faixa inclui as duas pontas', () => {
    const ms = ['17:59:59', '18:00:00', '20:00:00', '20:00:01'].map(h => semanal(0, h));
    expect(horarios(filtrarMissasCompativeis(ms, filtro(0, '18:00', '20:00')))).toEqual(['18:00:00', '20:00:00']);
  });

  it('com dia, mensal e dia fixo não entram', () => {
    expect(filtrarMissasCompativeis([noMes(0, '19:00:00', 1), diaFixo(13, '19:00:00')], filtro(0))).toEqual([]);
  });

  it('horário sem dia vale para todas as recorrências', () => {
    const ms = [noMes(0, '19:00:00', 1), diaFixo(13, '19:00:00'), semanal(4, '19:00:00'), semanal(0, '07:00:00')];
    expect(filtrarMissasCompativeis(ms, filtro(null, '18:00', '20:00')).length).toBe(3);
    expect(filtrarMissasCompativeis(ms, filtro(null, '19:00')).length).toBe(3);
  });

  it('HorarioFim sozinho é ignorado', () => {
    const ms = [semanal(0, '07:00:00'), semanal(0, '19:00:00')];
    expect(filtrarMissasCompativeis(ms, filtro(null, null, '08:00'))).toEqual(ms);
  });

  it('fim antes do início não aceita nenhuma', () => {
    expect(filtrarMissasCompativeis([semanal(0, '19:00:00')], filtro(0, '20:00', '18:00'))).toEqual([]);
  });

  it('missa sem tipoRecorrencia é semanal', () => {
    const antiga: Mass = { diaSemana: 0, horario: '19:00:00' };
    expect(filtrarMissasCompativeis([antiga], filtro(0))).toEqual([antiga]);
  });
});

describe('calcularProximaMissaCard', () => {
  it('sem horários cadastrados', () => {
    const r = calcularProximaMissaCard([], null, SEG_18H);
    expect(r.estado).toBe('sem-horarios');
    expect(r.missa).toBeNull();
    expect(r.inicio).toBeNull();
  });

  it('com horários, sem ocorrência futura, não usa nenhuma missa', () => {
    // Dia fixo com todos os dias da semana como exceção: nunca ocorre.
    const r = calcularProximaMissaCard([diaFixo(13, '19:00:00', 127)], null, SEG_18H);
    expect(r.estado).toBe('sem-futura');
    expect(r.missa).toBeNull();
  });

  it('não substitui por missa fora do filtro', () => {
    const r = calcularProximaMissaCard([semanal(1, '19:00:00')], filtro(0), SEG_18H);
    expect(r.estado).toBe('sem-futura');
    expect(r.missa).toBeNull();
  });

  it('escolhe a próxima dentro do filtro', () => {
    const domingo = semanal(0, '19:00:00');
    const r = calcularProximaMissaCard([semanal(1, '19:00:00'), domingo], filtro(0), SEG_18H);
    expect(r.missa).toBe(domingo);
    expect(r.inicio).toEqual(new Date(2026, 10, 15, 19, 0));
  });

  it('às 18h59 a missa das 19h é hoje', () => {
    const r = calcularProximaMissaCard([semanal(1, '19:00:00')], null, new Date(2026, 10, 9, 18, 59));
    expect(r.inicio).toEqual(new Date(2026, 10, 9, 19, 0));
  });

  it('às 19h00 em ponto a missa das 19h já passou', () => {
    const r = calcularProximaMissaCard([semanal(1, '19:00:00')], null, new Date(2026, 10, 9, 19, 0));
    expect(r.inicio).toEqual(new Date(2026, 10, 16, 19, 0));
  });

  it('atravessa a virada do mês', () => {
    const r = calcularProximaMissaCard([diaFixo(1, '08:00:00')], null, new Date(2026, 0, 31, 12, 0));
    expect(r.inicio).toEqual(new Date(2026, 1, 1, 8, 0));
  });

  it('atravessa a virada do ano', () => {
    const r = calcularProximaMissaCard([semanal(5, '08:00:00')], null, new Date(2026, 11, 31, 12, 0));
    expect(r.inicio).toEqual(new Date(2027, 0, 1, 8, 0));
  });

  it('respeita fevereiro comum e bissexto', () => {
    const comum = calcularProximaMissaCard([diaFixo(29, '08:00:00')], null, new Date(2027, 1, 1, 12, 0));
    expect(comum.inicio).toEqual(new Date(2027, 2, 29, 8, 0));
    const bissexto = calcularProximaMissaCard([diaFixo(29, '08:00:00')], null, new Date(2028, 1, 1, 12, 0));
    expect(bissexto.inicio).toEqual(new Date(2028, 1, 29, 8, 0));
  });

  it('dia 31 pula mês de 30 dias', () => {
    const r = calcularProximaMissaCard([diaFixo(31, '08:00:00')], null, new Date(2026, 10, 1, 12, 0));
    expect(r.inicio).toEqual(new Date(2026, 11, 31, 8, 0));
  });

  it('calcula 1º domingo e última sexta', () => {
    const primeiro = calcularProximaMissaCard([noMes(0, '08:00:00', 1)], null, SEG_18H);
    expect(primeiro.inicio).toEqual(new Date(2026, 11, 6, 8, 0));
    const ultima = calcularProximaMissaCard([noMes(5, '08:00:00', 1 << 5)], null, SEG_18H);
    expect(ultima.inicio).toEqual(new Date(2026, 10, 27, 8, 0));
  });

  it('dia fixo pula a exceção de fim de semana', () => {
    // 13/02/2027 é sábado; o próximo dia 13 que não cai em fim de semana é 13/04.
    const r = calcularProximaMissaCard([diaFixo(13, '08:00:00', (1 << 6) | 1)], null, new Date(2027, 1, 1, 12, 0));
    expect(r.inicio).toEqual(new Date(2027, 3, 13, 8, 0));
  });

  it('dia fixo com diaSemana 0 não vira domingo', () => {
    // 13/11/2026 é sexta.
    const r = calcularProximaMissaCard([diaFixo(13, '08:00:00')], null, SEG_18H);
    expect(r.inicio?.getDay()).toBe(5);
  });

  it('lista os outros horários da mesma data, futuros, em ordem e sem repetir', () => {
    const r = calcularProximaMissaCard(
      [semanal(1, '20:00:00'), semanal(1, '07:00:00'), semanal(1, '19:00:00'), semanal(1, '21:00:00'), noMes(1, '20:00:00', 2), semanal(2, '08:00:00')],
      null,
      SEG_18H,
    );
    expect(r.inicio).toEqual(new Date(2026, 10, 9, 19, 0));
    expect(r.outrosHorarios).toEqual(['20h00', '21h00']);
  });

  it('os outros horários respeitam o filtro', () => {
    const r = calcularProximaMissaCard([semanal(0, '07:00:00'), semanal(0, '19:00:00'), semanal(0, '20:00:00')], filtro(0, '18:00', '20:00'), SEG_18H);
    expect(r.outrosHorarios).toEqual(['20h00']);
  });

  it('horário inválido não gera próxima missa', () => {
    expect(calcularProximaMissaCard([semanal(1, 'abc')], null, SEG_18H).estado).toBe('sem-futura');
  });

  it('validoAte é o início da missa quando ela vem antes da meia-noite', () => {
    expect(calcularProximaMissaCard([semanal(1, '19:00:00')], null, SEG_18H).validoAte).toEqual(new Date(2026, 10, 9, 19, 0));
  });

  it('validoAte é a próxima meia-noite local, inclusive na virada do ano', () => {
    expect(calcularProximaMissaCard([], null, new Date(2026, 11, 31, 23, 59)).validoAte).toEqual(new Date(2027, 0, 1));
    expect(calcularProximaMissaCard([semanal(0, '19:00:00')], null, SEG_18H).validoAte).toEqual(new Date(2026, 10, 10));
  });
});

describe('rótulos da próxima missa', () => {
  it('hoje, amanhã e outro dia', () => {
    expect(rotuloDiaMissa(new Date(2026, 10, 9, 19), SEG_18H)).toBe('Hoje · Segunda');
    expect(rotuloDiaMissa(new Date(2026, 10, 10, 8), SEG_18H)).toBe('Amanhã · Terça');
    expect(rotuloDiaMissa(new Date(2026, 10, 14, 19), SEG_18H)).toBe('Sábado');
  });

  it('amanhã atravessa a virada do ano pelas datas, não por horas', () => {
    expect(rotuloDiaMissa(new Date(2027, 0, 1, 6), new Date(2026, 11, 31, 23, 59))).toBe('Amanhã · Sexta');
  });

  it('a data só mostra o ano quando ele é outro', () => {
    expect(rotuloDataMissa(new Date(2026, 10, 14, 19), SEG_18H)).toBe('14 de novembro');
    expect(rotuloDataMissa(new Date(2027, 0, 1, 8), SEG_18H)).toBe('1 de janeiro de 2027');
  });

  it('formata os outros horários', () => {
    expect(formatarOutrosHorarios(['18h00'])).toBe('18h00');
    expect(formatarOutrosHorarios(['18h00', '20h00'])).toBe('18h00 e 20h00');
    expect(formatarOutrosHorarios(['08h00', '10h00', '12h00'])).toBe('08h00, 10h00 e 12h00');
    expect(formatarOutrosHorarios(['08h00', '10h00', '12h00', '15h00', '18h00'])).toBe('08h00, 10h00, 12h00 e mais 2');
  });

  it('a contagem aparece só nas 3 horas anteriores', () => {
    const inicio = new Date(2026, 10, 9, 19, 0);
    expect(rotuloContagem(inicio, new Date(2026, 10, 9, 18, 30))).toBe('Começa em 30 min');
    expect(rotuloContagem(inicio, new Date(2026, 10, 9, 17, 0))).toBe('Começa em 2h');
    expect(rotuloContagem(inicio, new Date(2026, 10, 9, 16, 30))).toBe('Começa em 2h30');
    expect(rotuloContagem(inicio, new Date(2026, 10, 9, 15, 59))).toBe('');
  });
});

describe('diasSemanaisDeMissa', () => {
  it('considera só semanais, sem repetir e em ordem', () => {
    expect(diasSemanaisDeMissa([semanal(5, '08:00'), semanal(0, '08:00'), semanal(5, '19:00')])).toEqual([0, 5]);
  });

  it('ignora o diaSemana de dia fixo e de ocorrência no mês', () => {
    expect(diasSemanaisDeMissa([diaFixo(13, '08:00'), noMes(3, '08:00', 1)])).toEqual([]);
  });
});

describe('compararPorProximaMissa', () => {
  const item = (nome: string, id: number, inicio: Date | null) => ({ nome, id, inicio });
  const ordenar = (lista: ReturnType<typeof item>[]) => [...lista].sort(compararPorProximaMissa).map(x => x.id);
  const h19 = new Date(2026, 10, 9, 19);

  it('ordena pelo início', () => {
    expect(ordenar([item('A', 1, new Date(2026, 10, 10)), item('B', 2, h19)])).toEqual([2, 1]);
  });

  it('desempata pelo nome em pt-BR', () => {
    expect(ordenar([item('Zélia', 1, h19), item('Ávila', 2, h19), item('Bento', 3, h19)])).toEqual([2, 3, 1]);
  });

  it('desempata pelo id quando o nome também é igual', () => {
    expect(ordenar([item('A', 9, h19), item('A', 2, h19)])).toEqual([2, 9]);
  });

  it('o resultado não depende da ordem de entrada', () => {
    const a = item('A', 1, h19);
    const b = item('A', 2, h19);
    const c = item('B', 3, h19);
    expect(ordenar([c, b, a])).toEqual(ordenar([a, c, b]));
  });

  it('sem próxima missa fica no fim, com o mesmo desempate', () => {
    expect(ordenar([item('C', 1, null), item('Z', 2, h19), item('A', 3, null)])).toEqual([2, 3, 1]);
  });
});
