import {
  formatMassTime,
  formatDistance,
  getNextOccurrenceMinutes,
  getMissaAgoraUrgency,
  getCountdownLabel,
  getDiaLabel,
  getProximaMissaData,
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

  // ── Fronteiras de dia/semana ────────────────────────────────────────────────
  //
  // `getNextOccurrenceMinutes` não recebe fuso: ela lê o relógio LOCAL do processo
  // (`getDay()`, `setHours()`). Portanto o fuso é uma propriedade do AMBIENTE, não
  // da função — quem garante o ambiente é scripts/verificar-timezone.mjs, e quem
  // garante a função é este bloco.
  //
  // Cada caso fixa o relógio local num instante e valida o RESULTADO CORRETO
  // esperado. Não comparamos "UTC x São Paulo": o que importa é a função acertar
  // dado um relógio local, e o guard assegurar que esse relógio é o de Brasília.
  describe('getNextOccurrenceMinutes — fronteiras', () => {
    /** Fixa o relógio local e roda o corpo. Datas via construtor local (sem UTC). */
    function comRelogio(data: Date, corpo: () => void): void {
      jasmine.clock().install();
      jasmine.clock().mockDate(data);
      try {
        corpo();
      } finally {
        jasmine.clock().uninstall();
      }
    }

    const QUA = 3;
    const QUI = 4;
    const DOM = 0;
    const SEG = 1;

    it('caso real de produção: build 18h44, missa 19h00 no mesmo dia → 16 min', () => {
      // Regressão do bug que motivou a correção. Em UTC o build lia 21h44 e devolvia
      // 9.916 min (6,9 dias), empurrando para a semana seguinte a missa que
      // começaria em 16 minutos.
      comRelogio(new Date(2026, 0, 7, 18, 44, 0), () => {
        expect(getNextOccurrenceMinutes(QUA, '19:00')).toBe(16);
      });
    });

    it('missa daqui a 1 minuto ainda é hoje, não semana que vem', () => {
      comRelogio(new Date(2026, 0, 7, 20, 59, 0), () => {
        expect(getNextOccurrenceMinutes(QUA, '21:00')).toBe(1);
      });
    });

    it('missa já passada no mesmo dia vai para a semana seguinte', () => {
      comRelogio(new Date(2026, 0, 7, 19, 1, 0), () => {
        // 19h00 passou há 1 min → próxima quarta, 7 dias menos 1 min.
        expect(getNextOccurrenceMinutes(QUA, '19:00')).toBe(7 * 24 * 60 - 1);
      });
    });

    it('virada de DIA: 23h59 de quarta → missa de quinta 00h10 em 11 min', () => {
      comRelogio(new Date(2026, 0, 7, 23, 59, 0), () => {
        expect(getNextOccurrenceMinutes(QUI, '00:10')).toBe(11);
      });
    });

    it('virada de SEMANA: domingo 23h50 → missa de segunda 00h10 em 20 min', () => {
      comRelogio(new Date(2026, 0, 11, 23, 50, 0), () => {
        expect(getNextOccurrenceMinutes(SEG, '00:10')).toBe(20);
      });
    });

    it('virada de SEMANA para trás: segunda 00h10 → missa de domingo em ~6 dias', () => {
      comRelogio(new Date(2026, 0, 12, 0, 10, 0), () => {
        // De segunda para domingo `daysUntil` é 6, e o alvo (00h00) é 10 min mais
        // cedo no dia do que o relógio (00h10) — logo 6 dias MENOS 10 minutos.
        expect(getNextOccurrenceMinutes(DOM, '00:00')).toBe(6 * 24 * 60 - 10);
      });
    });
  });

  // ── Fusos do Brasil: o que a correção resolve e o que NÃO resolve ───────────
  //
  // A base tem 94,1% das missas em UTC-3, 5,2% em UTC-4 (MS, MT, AM, RR) e 0,7% em
  // UTC-5 (AC). Como o cálculo roda no relógio de QUEM RENDERIZA, uma igreja fora de
  // Brasília é avaliada no fuso errado — no prerender e também no navegador de um
  // usuário de outro estado. Isto é anterior a esta correção e segue aberto.
  //
  // Estes testes fixam o COMPORTAMENTO CONHECIDO: simulam o relógio do renderizador
  // (Brasília) e afirmam o que a função devolve para uma missa cujo horário é local
  // da igreja. Se algum dia entrar fuso por igreja, eles falham de propósito e
  // obrigam a revisão consciente.
  describe('getNextOccurrenceMinutes — fusos do Brasil (limitação conhecida)', () => {
    function comRelogio(data: Date, corpo: () => void): void {
      jasmine.clock().install();
      jasmine.clock().mockDate(data);
      try {
        corpo();
      } finally {
        jasmine.clock().uninstall();
      }
    }
    const QUA = 3;

    it('UTC-3 (SP/MG/RJ…): fuso do renderizador = fuso da igreja → resultado correto', () => {
      // Relógio de Brasília 18h44; a igreja também está em Brasília. Sem defasagem.
      comRelogio(new Date(2026, 0, 7, 18, 44, 0), () => {
        expect(getNextOccurrenceMinutes(QUA, '19:00')).toBe(16);
      });
    });

    it('UTC-4 (MS/MT/AM/RR): 1h de defasagem pode jogar a missa para a semana seguinte', () => {
      // 19h30 em Brasília = 18h30 em Manaus. A missa local das 19h00 começaria em
      // 30 min, mas o renderizador lê "19h00 já passou" e devolve a semana seguinte.
      comRelogio(new Date(2026, 0, 7, 19, 30, 0), () => {
        expect(getNextOccurrenceMinutes(QUA, '19:00')).toBe(7 * 24 * 60 - 30);
      });
    });

    it('UTC-5 (AC): 2h de defasagem encurtam indevidamente a contagem', () => {
      // 18h44 em Brasília = 16h44 no Acre. Para a missa local das 19h00 faltam
      // 2h16 (136 min), mas o renderizador devolve 16 min.
      comRelogio(new Date(2026, 0, 7, 18, 44, 0), () => {
        const noFusoDoRenderizador = getNextOccurrenceMinutes(QUA, '19:00');
        expect(noFusoDoRenderizador).toBe(16);
        expect(noFusoDoRenderizador).not.toBe(136); // o correto no fuso do Acre
      });
    });
  });

  // ── Estável x relativo: o que pode ser assado no prerender ──────────────────
  //
  // `relativo` é o parâmetro que separa o que o server pode gravar no HTML do que
  // só faz sentido contra o relógio de quem lê. Com `false` (prerender) o resultado
  // tem de ser invariante à data: o mesmo arquivo fica no ar de 1 a 4 dias.
  describe('getDiaLabel / getProximaMissaData', () => {
    // quarta-feira, 07/01/2026, 10h00.
    const AGORA = new Date(2026, 0, 7, 10, 0, 0);
    const QUA = 3;
    const QUI = 4;
    const SAB = 6;

    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate(AGORA);
    });
    afterEach(() => jasmine.clock().uninstall());

    it('prerender: missa de hoje sai como nome do dia, nunca "Hoje"', () => {
      expect(getDiaLabel(QUA, '12:00', false)).toBe('Quarta');
    });

    it('prerender: missa de amanhã sai como nome do dia, nunca "Amanhã"', () => {
      expect(getDiaLabel(QUI, '07:00', false)).toBe('Quinta');
    });

    it('browser: missa de hoje vira "Hoje"', () => {
      expect(getDiaLabel(QUA, '12:00', true)).toBe('Hoje');
    });

    it('browser: missa de amanhã vira "Amanhã"', () => {
      expect(getDiaLabel(QUI, '07:00', true)).toBe('Amanhã');
    });

    it('browser: missa de outro dia mantém o nome do dia', () => {
      expect(getDiaLabel(SAB, '19:00', true)).toBe('Sábado');
    });

    it('o rótulo do prerender não muda quando o relógio anda', () => {
      const antes = getDiaLabel(QUI, '07:00', false);
      jasmine.clock().mockDate(new Date(2026, 0, 10, 23, 0, 0)); // 3 dias depois
      expect(getDiaLabel(QUI, '07:00', false)).toBe(antes);
    });

    it('prerender: data sai só com o dia por extenso, sem "N de mês" que vence', () => {
      const data = getProximaMissaData(QUI, '07:00', false);
      expect(data).toBe('quinta-feira');
      expect(data).not.toMatch(/\d/);
    });

    it('browser: data sai completa', () => {
      expect(getProximaMissaData(QUI, '07:00', true)).toBe('quinta-feira, 8 de janeiro');
    });

    it('a data do prerender não muda quando o relógio anda', () => {
      const antes = getProximaMissaData(QUI, '07:00', false);
      jasmine.clock().mockDate(new Date(2026, 0, 10, 23, 0, 0));
      expect(getProximaMissaData(QUI, '07:00', false)).toBe(antes);
    });
  });

  describe('getCountdownLabel', () => {
    const AGORA = new Date(2026, 0, 7, 10, 0, 0);
    const QUA = 3;

    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate(AGORA);
    });
    afterEach(() => jasmine.clock().uninstall());

    it('conta em minutos abaixo de 1h', () => {
      expect(getCountdownLabel(QUA, '10:25')).toBe('Começa em 25 min');
    });

    it('conta em horas dentro da janela de 3h', () => {
      expect(getCountdownLabel(QUA, '12:00')).toBe('Começa em 2h');
    });

    it('fora da janela vira rótulo de dia, não contador', () => {
      expect(getCountdownLabel(QUA, '14:00')).toBe('Hoje às 14h');
    });
  });
});
