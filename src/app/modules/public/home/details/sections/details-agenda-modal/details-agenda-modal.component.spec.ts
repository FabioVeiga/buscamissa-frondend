import { TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DetailsAgendaModalComponent } from './details-agenda-modal.component';
import { Mass } from '../../../../church/models/church.model';

describe('DetailsAgendaModalComponent — Repetir', () => {
  let c: DetailsAgendaModalComponent;
  const domingo7h = { diaSemana: 0, horario: '07:00:00' } as Mass;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailsAgendaModalComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();
    c = TestBed.createComponent(DetailsAgendaModalComponent).componentInstance;
    c.missas = [domingo7h];
    c.proximaMissa = domingo7h;
    c.igrejaNome = 'Paróquia X';
    c.visible = true;
    c.ngOnChanges({ visible: new SimpleChange(false, true, false) });
  });

  const recur = () => new URL(c.linkGoogle).searchParams.get('recur');

  it('abre marcado: o evento repete toda semana', () => {
    expect(c.repetir).toBeTrue();
    expect(c.repeticao).toBe('Repetir toda semana');
    expect(recur()).toBe('RRULE:FREQ=WEEKLY;BYDAY=SU');
  });

  it('desmarcado: vira evento único (sem RRULE), e volta ao remarcar', () => {
    c.repetir = false;
    expect(recur()).toBeNull();
    expect(c.evento!.rrule).toBe('');
    c.repetir = true;
    expect(recur()).toBe('RRULE:FREQ=WEEKLY;BYDAY=SU');
  });

  it('reabrir a janela volta para "repetir" marcado', () => {
    c.repetir = false;
    c.ngOnChanges({ visible: new SimpleChange(false, true, false) });
    expect(c.repetir).toBeTrue();
  });
});
