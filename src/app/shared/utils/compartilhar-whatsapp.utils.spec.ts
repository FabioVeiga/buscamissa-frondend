import { linkWhatsappIgreja, resumoHorariosWhatsapp } from './compartilhar-whatsapp.utils';
import { TIPO_RECORRENCIA } from './recorrencia-missa';

describe('compartilhar-whatsapp.utils', () => {
  const semanal = (diaSemana: number, horario: string) => ({ diaSemana, horario });

  describe('resumoHorariosWhatsapp', () => {
    it('lista as missas de domingo em ordem, sem repetir', () => {
      const missas = [semanal(0, '19:00:00'), semanal(0, '07:30:00'), semanal(6, '18:00:00'), semanal(0, '19:00:00')];
      expect(resumoHorariosWhatsapp(missas, missas[2])).toBe('domingo às 7h30 e 19h');
    });

    it('uma missa de domingo', () => {
      expect(resumoHorariosWhatsapp([semanal(0, '10:00:00')], null)).toBe('domingo às 10h');
    });

    it('ignora domingo que não é semanal (ex.: 1º domingo do mês)', () => {
      const mensal = { diaSemana: 0, horario: '09:00:00', tipoRecorrencia: TIPO_RECORRENCIA.OcorrenciaNoMes, semanasDoMes: 1 };
      const sabado = semanal(6, '18:00:00');
      expect(resumoHorariosWhatsapp([mensal, sabado], sabado)).toBe('próxima missa: sábado, 18h');
    });

    it('sem missa de domingo: usa a próxima missa', () => {
      const sexta = semanal(5, '19:30:00');
      expect(resumoHorariosWhatsapp([sexta], sexta)).toBe('próxima missa: sexta-feira, 19h30');
    });

    it('sem horários: vazio', () => {
      expect(resumoHorariosWhatsapp([], null)).toBe('');
    });
  });

  describe('linkWhatsappIgreja', () => {
    const url = 'https://buscamissa.com.br/paroquia/sp/sao-paulo/paroquia-x';

    it('monta o wa.me com o texto codificado e o link com UTM', () => {
      const link = linkWhatsappIgreja('Paróquia X', [semanal(0, '08:00:00')], null, url);

      expect(link.startsWith('https://wa.me/?text=')).toBeTrue();
      const texto = decodeURIComponent(link.replace('https://wa.me/?text=', ''));
      expect(texto).toBe(
        'Missa na Paróquia X: domingo às 8h. Veja todos os horários: ' +
        `${url}?utm_source=whatsapp&utm_medium=share&utm_campaign=igreja`,
      );
    });

    it('o & do UTM vai codificado (não quebra o parâmetro text)', () => {
      const link = linkWhatsappIgreja('Paróquia X', [], null, url);
      expect(link).not.toContain('&utm_medium');
      expect(link).toContain('%26utm_medium');
    });

    it('sem horários: frase sem resumo', () => {
      const texto = decodeURIComponent(linkWhatsappIgreja('Paróquia X', [], null, url).split('text=')[1]);
      expect(texto).toBe(`Missa na Paróquia X. Veja todos os horários: ${url}?${'utm_source=whatsapp&utm_medium=share&utm_campaign=igreja'}`);
    });
  });
});
