import { haversineMetros, distanciaMetrosAte } from './distance.utils';

describe('distance.utils', () => {
  describe('haversineMetros', () => {
    it('retorna 0 para o mesmo ponto', () => {
      expect(haversineMetros(-23.55, -46.63, -23.55, -46.63)).toBe(0);
    });

    it('calcula a distância aproximada entre dois pontos conhecidos', () => {
      // São Paulo (Sé) → Campinas ≈ 83 km em linha reta
      const metros = haversineMetros(-23.5505, -46.6333, -22.9099, -47.0626);
      expect(metros).toBeGreaterThan(78_000);
      expect(metros).toBeLessThan(90_000);
    });

    it('é simétrica (A→B == B→A)', () => {
      const ab = haversineMetros(-23.55, -46.63, -22.9, -47.06);
      const ba = haversineMetros(-22.9, -47.06, -23.55, -46.63);
      expect(ab).toBeCloseTo(ba, 6);
    });
  });

  describe('distanciaMetrosAte', () => {
    it('retorna null quando a origem não tem coordenadas', () => {
      expect(distanciaMetrosAte(null, null, -23.5, -46.6)).toBeNull();
      expect(distanciaMetrosAte(-23.5, null, -23.5, -46.6)).toBeNull();
    });

    it('retorna null quando o destino não tem coordenadas', () => {
      expect(distanciaMetrosAte(-23.5, -46.6, undefined, undefined)).toBeNull();
      expect(distanciaMetrosAte(-23.5, -46.6, -23.5, 0)).toBeNull();
    });

    it('calcula a distância quando ambos têm coordenadas', () => {
      const metros = distanciaMetrosAte(-23.5505, -46.6333, -22.9099, -47.0626);
      expect(metros).not.toBeNull();
      expect(metros!).toBeGreaterThan(78_000);
    });
  });
});
