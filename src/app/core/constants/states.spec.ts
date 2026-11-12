import { STATES, nomeComContracaoDe, nomeDoEstadoComArtigo } from './states';

describe('states — contração de "de" com o artigo do estado', () => {
  it('"do", "da" e "de" conforme o estado', () => {
    expect(nomeComContracaoDe('PR')).toBe('do Paraná');
    expect(nomeComContracaoDe('rj')).toBe('do Rio de Janeiro');
    expect(nomeComContracaoDe('BA')).toBe('da Bahia');
    expect(nomeComContracaoDe('PB')).toBe('da Paraíba');
    expect(nomeComContracaoDe('SP')).toBe('de São Paulo');
    expect(nomeComContracaoDe('MG')).toBe('de Minas Gerais');
  });

  it('aceita o nome e degrada para "de" quando não reconhece', () => {
    expect(nomeComContracaoDe('Pará')).toBe('do Pará');
    expect(nomeComContracaoDe('Atlântida')).toBe('de Atlântida');
  });

  it('cobre os 27 estados', () => {
    for (const e of STATES) {
      expect(nomeComContracaoDe(e.sigla)).toMatch(/^(do|da|de) /);
    }
  });

  it('nomeDoEstadoComArtigo continua igual', () => {
    expect(nomeDoEstadoComArtigo('PR')).toBe('estado do Paraná');
    expect(nomeDoEstadoComArtigo('X')).toBe('estado de X');
  });
});
