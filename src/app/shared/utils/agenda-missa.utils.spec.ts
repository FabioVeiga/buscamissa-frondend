import { conteudoIcs, eventoMissa, linkGoogleAgenda, rruleDaMissa } from './agenda-missa.utils';
import { TIPO_RECORRENCIA, ULTIMA_SEMANA } from './recorrencia-missa';

describe('agenda-missa.utils', () => {
  // Sábado, 7 de novembro de 2026, 10h (horário local)
  const agora = new Date(2026, 10, 7, 10, 0);

  it('semanal: próxima ocorrência + repetição semanal no dia certo', () => {
    const ev = eventoMissa({ diaSemana: 0, horario: '07:00:00' }, 'Paróquia X', 'Rua A, 1 - São Paulo/SP', 'https://x', agora)!;
    expect(ev.inicio).toEqual(new Date(2026, 10, 8, 7, 0));
    expect(ev.fim).toEqual(new Date(2026, 10, 8, 8, 0));
    expect(ev.rrule).toBe('FREQ=WEEKLY;BYDAY=SU');
  });

  it('dia fixo e ocorrência no mês viram repetição mensal', () => {
    expect(rruleDaMissa({ horario: '19:00', tipoRecorrencia: TIPO_RECORRENCIA.DiaDoMes, diaDoMes: 13 }))
      .toBe('FREQ=MONTHLY;BYMONTHDAY=13');
    expect(rruleDaMissa({ horario: '19:00', diaSemana: 5, tipoRecorrencia: TIPO_RECORRENCIA.OcorrenciaNoMes, semanasDoMes: 1 | 4 | ULTIMA_SEMANA }))
      .toBe('FREQ=MONTHLY;BYDAY=1FR,3FR,-1FR');
  });

  it('Google Agenda: datas flutuantes (sem fuso) e recur', () => {
    const ev = eventoMissa({ diaSemana: 0, horario: '07:00' }, 'Paróquia X', 'Rua A', 'https://x', agora)!;
    const u = new URL(linkGoogleAgenda(ev));
    expect(u.searchParams.get('dates')).toBe('20261108T070000/20261108T080000');
    expect(u.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;BYDAY=SU');
    expect(u.searchParams.get('text')).toBe('Missa — Paróquia X');
  });

  it('.ics: CRLF, RRULE e texto escapado', () => {
    const ev = eventoMissa({ diaSemana: 0, horario: '07:00' }, 'Paróquia São José\, Centro', 'Rua A\; 1', 'https://x', agora)!;
    const ics = conteudoIcs(ev, 'uid-1', agora);
    expect(ics).toContain('\r\nDTSTART:20261108T070000\r\n');
    expect(ics).toContain('\r\nRRULE:FREQ=WEEKLY;BYDAY=SU\r\n');
    expect(ics).toContain('SUMMARY:Missa — Paróquia São José\\, Centro');
    expect(ics).toContain('LOCATION:Rua A\\; 1');
  });
});
