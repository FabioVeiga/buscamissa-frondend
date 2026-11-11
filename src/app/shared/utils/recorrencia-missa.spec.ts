import {
  TIPO_RECORRENCIA,
  RegraRecorrencia,
  datasSubstituidas,
  descrever,
  ocorreEm,
  ocorreNoDia,
  proximaOcorrencia,
} from './recorrencia-missa';

describe('recorrencia-missa — data específica', () => {
  const natal: RegraRecorrencia = {
    tipoRecorrencia: TIPO_RECORRENCIA.DataEspecifica,
    diaSemana: 5,
    horario: '18:00:00',
    data: '2026-12-25',
    nome: 'Missa de Natal',
  };
  const sextaRegular: RegraRecorrencia = { diaSemana: 5, horario: '19:00:00' };

  it('ocorre só na data, com ano', () => {
    expect(ocorreEm(natal, new Date(2026, 11, 25))).toBeTrue();
    expect(ocorreEm(natal, new Date(2027, 11, 25))).toBeFalse();
    expect(ocorreEm(natal, new Date(2026, 11, 26))).toBeFalse();
  });

  it('descreve com a data e a hora', () => {
    expect(descrever(natal)).toBe('25/12/2026, 18h');
  });

  it('a próxima ocorrência é a data e depois dela não há mais', () => {
    expect(proximaOcorrencia(natal, new Date(2026, 10, 10, 9, 0))).toEqual(new Date(2026, 11, 25, 18, 0));
    expect(proximaOcorrencia(natal, new Date(2026, 11, 25, 19, 0))).toBeNull();
  });

  it('só as missas com a flag substituem as regulares daquele dia', () => {
    const sem = datasSubstituidas([natal, sextaRegular]);
    const com = datasSubstituidas([{ ...natal, substituiMissasDoDia: true }, sextaRegular]);
    expect(sem.size).toBe(0);
    expect([...com]).toEqual(['2026-12-25']);

    const vespera = new Date(2026, 11, 24, 12, 0);
    expect(proximaOcorrencia(sextaRegular, vespera)).toEqual(new Date(2026, 11, 25, 19, 0));
    expect(proximaOcorrencia(sextaRegular, vespera, undefined, com)).toEqual(new Date(2027, 0, 1, 19, 0));
    expect(proximaOcorrencia({ ...natal, substituiMissasDoDia: true }, vespera, undefined, com)).toEqual(
      new Date(2026, 11, 25, 18, 0)
    );
  });

  it('"hoje" ignora a regular num dia substituído, mas mantém a especial', () => {
    const subst = datasSubstituidas([{ ...natal, substituiMissasDoDia: true }]);
    const dia25 = new Date(2026, 11, 25, 10, 0);
    expect(ocorreNoDia(sextaRegular, 0, dia25)).toBeTrue();
    expect(ocorreNoDia(sextaRegular, 0, dia25, subst)).toBeFalse();
    expect(ocorreNoDia(natal, 0, dia25, subst)).toBeTrue();
  });
});
