import { TestBed } from '@angular/core/testing';
import { DetailsAtendimentoComponent } from './details-atendimento.component';

describe('DetailsAtendimentoComponent', () => {
  const sessao = (tipo: number, diaSemana: number, observacao?: string) =>
    ({ tipo, diaSemana, horarioInicio: '08:00', horarioFim: '11:30', observacao });

  function montar(sessoes: ReturnType<typeof sessao>[]): HTMLElement {
    const f = TestBed.createComponent(DetailsAtendimentoComponent);
    f.componentRef.setInput('sessoes', sessoes);
    f.detectChanges();
    return f.nativeElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DetailsAtendimentoComponent] }).compileComponents();
  });

  it('agrupa dias consecutivos e mostra confissão e secretaria', () => {
    const el = montar([sessao(2, 5), sessao(1, 2), sessao(1, 3), sessao(1, 4)]);
    const titulos = Array.from(el.querySelectorAll('h2')).map((h) => h.textContent!.trim());
    expect(titulos).toEqual(['Confissão', 'Secretaria']);
    expect(el.textContent).toContain('Ter a Qui');
    expect(el.textContent).toContain('08h00 às 11h30');
  });

  it('só mostra o bloco que tem dados', () => {
    const titulos = Array.from(montar([sessao(1, 1)]).querySelectorAll('h2')).map((h) => h.textContent!.trim());
    expect(titulos).toEqual(['Secretaria']);
  });

  it('mostra a observação da sessão', () => {
    expect(montar([sessao(2, 6, 'Com o Pe. João')]).textContent).toContain('Com o Pe. João');
  });
});
