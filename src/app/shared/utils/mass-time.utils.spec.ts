import {
  formatMassTime,
  formatDistance,
  getNextOccurrenceMinutes,
  getMissaAgoraUrgency,
} from './mass-time.utils';

describe('mass-time.utils', () => {
  describe('formatMassTime', () => {
    it('formata HH:mm com padding', () => {
      expect(formatMassTime('9:5')).toBe('09h05');
      expect(formatMassTime('19:30')).toBe('19h30');
      expect(formatMassTime('07:00')).toBe('07h00');
    });
  });

  describe('formatDistance', () => {
    it('usa metros abaixo de 1km', () => {
      expect(formatDistance(450)).toBe('450 m');
    });
    it('usa km com uma casa decimal a partir de 1km', () => {
      expect(formatDistance(1500)).toBe('1,5 km');
    });
  });

  describe('getNextOccurrenceMinutes / getMissaAgoraUrgency', () => {
    // Fixa "agora" para testes determinísticos: quarta-feira, 10h00.
    const AGORA = new Date(2026, 0, 7, 10, 0, 0); // 2026-01-07

    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate(AGORA);
    });
    afterEach(() => jasmine.clock().uninstall());

    it('conta os minutos até uma missa hoje mais tarde', () => {
      const hoje = AGORA.getDay();
      const min = getNextOccurrenceMinutes(hoje, '12:00'); // +2h
      expect(min).toBe(120);
    });

    it('joga para a próxima semana quando o horário de hoje já passou', () => {
      const hoje = AGORA.getDay();
      const min = getNextOccurrenceMinutes(hoje, '08:00'); // já passou às 10h
      expect(min).toBe(7 * 24 * 60 - 120); // 1 semana menos 2h
    });

    it('classifica urgência: <=30min = urgent', () => {
      const hoje = AGORA.getDay();
      expect(getMissaAgoraUrgency(hoje, '10:20')).toBe('urgent'); // +20min
    });

    it('classifica urgência: >120min = null (fora da janela)', () => {
      const hoje = AGORA.getDay();
      expect(getMissaAgoraUrgency(hoje, '13:00')).toBeNull(); // +3h
    });
  });
});
