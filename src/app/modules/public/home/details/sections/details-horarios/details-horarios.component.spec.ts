import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DetailsHorariosComponent } from './details-horarios.component';
import { Mass } from '../../../../church/models/church.model';

describe('DetailsHorariosComponent — observações e aviso', () => {
  const longa = 'na Comunidade Santa Dulce dos Pobres (Rotary), com bênção no final';

  function montar(missas: Partial<Mass>[]): HTMLElement {
    const f = TestBed.createComponent(DetailsHorariosComponent);
    f.componentRef.setInput('missas', missas as Mass[]);
    f.detectChanges();
    return f.nativeElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailsHorariosComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();
  });

  it('numera o chip e mostra a observação inteira no fim do quadro', () => {
    const el = montar([{ diaSemana: 0, horario: '09:00:00', observacao: longa }, { diaSemana: 0, horario: '18:00:00' }]);
    const nota = el.querySelector('.schedule-notas li')!.textContent!;
    expect(nota).toContain('Domingo, 09h00');
    expect(nota).toContain(longa);
    expect(el.querySelector('.mass-chip__num')!.textContent).toBe('1');
    expect(el.querySelectorAll('.mass-chip__num').length).toBe(1);
    expect(el.querySelector('.schedule-row')!.textContent).not.toContain(longa);
  });

  it('numera as observações em ordem entre os dias', () => {
    const el = montar([
      { diaSemana: 4, horario: '19:30:00', observacao: 'Na capela' },
      { diaSemana: 0, horario: '08:00:00', observacao: 'Com as crianças' },
    ]);
    const notas = Array.from(el.querySelectorAll('.schedule-notas li')).map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(notas).toEqual(['1 Domingo, 08h00: Com as crianças', '2 Quinta, 19h30: Na capela']);
  });

  it('não repete observação que só diz a regra da missa', () => {
    const c = TestBed.createComponent(DetailsHorariosComponent).componentInstance;
    expect(c.notaDaMissa({ horario: '19:00:00', descricaoRecorrencia: '1ª sexta do mês, 19h', observacao: '1ª sexta do mês' } as Mass)).toBe('');
  });

  it('avisa que os horários podem mudar só quando há missa', () => {
    expect(montar([{ diaSemana: 1, horario: '07:00:00' }]).querySelector('.horarios-rodape')!.textContent)
      .toContain('Horários sujeitos a alterações');
    expect(montar([]).querySelector('.horarios-rodape')).toBeNull();
  });

  describe('recriação do DOM quando os dados chegam de novo', () => {
    // Segunda, 9/nov: o dia 13 (dia fixo) cai na grade; o dia 28, em "datas do mês".
    const dados = (): Partial<Mass>[] => [
      { diaSemana: 0, horario: '09:00:00', observacao: longa },
      { diaSemana: 1, horario: '07:00:00' },
      { tipoRecorrencia: 2, diaDoMes: 13, horario: '19:00:00' },
      { tipoRecorrencia: 2, diaDoMes: 28, horario: '15:00:00' },
    ];

    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate(new Date(2026, 10, 9, 10));
    });
    afterEach(() => jasmine.clock().uninstall());

    it('mantém linhas, chips e notas com os mesmos nós do DOM', () => {
      const f = TestBed.createComponent(DetailsHorariosComponent);
      f.componentRef.setInput('missas', dados() as Mass[]);
      f.detectChanges();
      const el: HTMLElement = f.nativeElement;
      const nos = () => Array.from(el.querySelectorAll('.schedule-row, .mass-chip, .schedule-notas li'));
      const antes = nos();
      expect(antes.length).toBeGreaterThan(5);

      f.componentRef.setInput('missas', dados() as Mass[]);
      f.detectChanges();

      expect(nos().length).toBe(antes.length);
      expect(nos().filter((n, i) => n !== antes[i]).length).toBe(0);
    });
  });

  it('dias sem missa e aviso ficam na mesma linha final', () => {
    const texto = montar([{ diaSemana: 1, horario: '07:00:00' }]).querySelector('.horarios-rodape')!.textContent!;
    expect(texto).toContain('Sem missa:');
  });
});
