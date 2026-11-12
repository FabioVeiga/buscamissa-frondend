import { acharCidade, nomeDoMunicipio, resolverUf } from './localizacao.utils';

describe('localizacao.utils', () => {
  describe('resolverUf', () => {
    it('prefere o ISO 3166-2', () => {
      expect(resolverUf({ 'ISO3166-2-lvl4': 'BR-PR', state: 'Pará' })).toBe('PR');
    });

    it('sem ISO, usa o nome exato antes da substring (Paraná ≠ Pará)', () => {
      expect(resolverUf({ state: 'Paraná' })).toBe('PR');
      expect(resolverUf({ state: 'Pará' })).toBe('PA');
    });

    it('sem estado reconhecível, devolve null', () => {
      expect(resolverUf({})).toBeNull();
      expect(resolverUf(null)).toBeNull();
      expect(resolverUf({ 'ISO3166-2-lvl4': 'AR-B' })).toBeNull();
    });
  });

  it('nomeDoMunicipio aceita city, town, village ou municipality', () => {
    expect(nomeDoMunicipio({ city: 'Curitiba' })).toBe('Curitiba');
    expect(nomeDoMunicipio({ town: 'Itapejara d\'Oeste' })).toBe('Itapejara d\'Oeste');
    expect(nomeDoMunicipio({ village: 'Vila' })).toBe('Vila');
    expect(nomeDoMunicipio({ municipality: 'M' })).toBe('M');
    expect(nomeDoMunicipio(null)).toBe('');
  });

  describe('acharCidade', () => {
    const cidades = [
      { nome: 'São Paulo', uf: 'sp', cidadeSlug: 'sao-paulo' },
      { nome: 'Guaranésia', uf: 'mg', cidadeSlug: 'santa-cruz-da-prata-distrito-de-guaranesia' },
      { nome: 'Bom Jesus', uf: 'pi', cidadeSlug: 'bom-jesus' },
    ];

    it('casa sem acento e sem caixa, e devolve o slug do backend', () => {
      expect(acharCidade('sao paulo', 'SP', cidades)?.cidadeSlug).toBe('sao-paulo');
      expect(acharCidade('GUARANESIA', 'mg', cidades)?.cidadeSlug)
        .toBe('santa-cruz-da-prata-distrito-de-guaranesia');
    });

    it('exige a mesma UF: cidade homônima em outro estado não casa', () => {
      expect(acharCidade('Bom Jesus', 'RS', cidades)).toBeNull();
    });

    it('cidade sem página não casa', () => {
      expect(acharCidade('Campinas', 'SP', cidades)).toBeNull();
      expect(acharCidade('', 'SP', cidades)).toBeNull();
    });
  });
});
