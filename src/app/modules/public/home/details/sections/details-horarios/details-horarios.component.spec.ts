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

  it('mostra a observação inteira abaixo dos chips, com marca no chip', () => {
    const el = montar([{ diaSemana: 0, horario: '09:00:00', observacao: longa }, { diaSemana: 0, horario: '18:00:00' }]);
    expect(el.querySelector('.schedule-notas')!.textContent).toContain(`09h00: ${longa}`);
    expect(el.querySelectorAll('.mass-chip__marca').length).toBe(1);
    expect(el.querySelector('.mass-chip')!.textContent).not.toContain(longa);
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

  it('dias sem missa e aviso ficam na mesma linha final', () => {
    const texto = montar([{ diaSemana: 1, horario: '07:00:00' }]).querySelector('.horarios-rodape')!.textContent!;
    expect(texto).toContain('Sem missa:');
  });
});
