import { coordenadaValida, linkGoogleMaps, linkWaze, textoBuscaDestino } from './navegacao.utils';

describe('navegacao.utils', () => {
  const holambra = {
    nome: 'Paróquia Divino Espírito Santo',
    logradouro: 'Alameda Maurício de Nassau',
    numero: 688,
    localidade: 'Holambra',
    uf: 'sp',
  };

  describe('coordenadaValida', () => {
    it('aceita coordenada no Brasil, inclusive como string', () => {
      expect(coordenadaValida(-22.6275855, -47.0593979)).toEqual([-22.6275855, -47.0593979]);
      expect(coordenadaValida('-22.63', '-47.05')).toEqual([-22.63, -47.05]);
    });

    it('rejeita ausente, zero, não numérica e fora do Brasil', () => {
      expect(coordenadaValida(null, -47)).toBeNull();
      expect(coordenadaValida(undefined, undefined)).toBeNull();
      expect(coordenadaValida(0, 0)).toBeNull();
      expect(coordenadaValida('abc', '-47')).toBeNull();
      expect(coordenadaValida(40.7, -74.0)).toBeNull(); // Nova York
    });

    it('rejeita lat/lng invertidas', () => {
      // caso real: id 1899 gravado como (-50.50, -21.63)
      expect(coordenadaValida(-50.5005050, -21.6383020)).toBeNull();
    });
  });

  describe('textoBuscaDestino', () => {
    it('monta nome, rua com número, cidade e UF', () => {
      expect(textoBuscaDestino(holambra)).toBe(
        'Paróquia Divino Espírito Santo, Alameda Maurício de Nassau 688, Holambra - SP',
      );
    });

    it('omite número zero e partes vazias', () => {
      expect(textoBuscaDestino({ nome: 'Capela X', numero: 0, localidade: 'Ibiúna', uf: 'SP' })).toBe(
        'Capela X, Ibiúna - SP',
      );
    });
  });

  describe('linkGoogleMaps', () => {
    it('usa a coordenada quando válida', () => {
      expect(linkGoogleMaps({ ...holambra, latitude: -22.63, longitude: -47.05 })).toBe(
        'https://www.google.com/maps/search/?api=1&query=-22.63,-47.05',
      );
    });

    it('cai para busca textual com UF quando não há coordenada válida', () => {
      const url = linkGoogleMaps({ ...holambra, latitude: 0, longitude: 0 });
      expect(url).toContain('query=');
      expect(decodeURIComponent(url)).toContain('Holambra - SP');
    });

    it('retorna # sem destino', () => {
      expect(linkGoogleMaps(null)).toBe('#');
      expect(linkGoogleMaps({})).toBe('#');
    });
  });

  describe('linkWaze', () => {
    it('usa ll=lat,lng (ordem correta) com navigate=yes', () => {
      expect(linkWaze({ ...holambra, latitude: -22.63, longitude: -47.05 })).toBe(
        'https://waze.com/ul?ll=-22.63,-47.05&navigate=yes',
      );
    });

    it('na busca textual inclui UF e não inicia navegação automática', () => {
      const url = linkWaze(holambra);
      expect(url.startsWith('https://waze.com/ul?q=')).toBeTrue();
      expect(url).not.toContain('navigate=yes');
      expect(decodeURIComponent(url)).toContain('Holambra - SP');
    });

    it('retorna # sem destino', () => {
      expect(linkWaze(undefined)).toBe('#');
    });
  });
});
