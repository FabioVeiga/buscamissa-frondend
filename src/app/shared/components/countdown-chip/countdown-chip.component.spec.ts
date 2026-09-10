import { ChangeDetectionStrategy, ChangeDetectorRef, Component, PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CountdownChipComponent } from './countdown-chip.component';

/**
 * Trava o contador vivo do chip.
 *
 * O defeito: o `setInterval` recalculava o label e reentrava na zona com
 * `ngZone.run()`, mas isso só AGENDA o tick — não decide quem será verificado.
 * O chip é usado dentro de componentes OnPush (details-scoreboard,
 * mass-time-card), e um ancestral OnPush que não está sujo faz o
 * `ApplicationRef.tick()` pular a subárvore inteira. O `label` mudava e o DOM
 * ficava com o texto anterior.
 *
 * Medido no staging em 2026-09-10, na página da Catedral de Taubaté: um
 * `setInterval` de 60s registrado à mão no MESMO contexto disparou às 07:48:35 e
 * 07:49:35, enquanto o chip permaneceu em "Começa em 16 min" por 6 minutos. Ou
 * seja, não era estrangulamento de aba oculta — o timer rodava, a view é que não
 * era verificada.
 *
 * O defeito é anterior ao PR #203, que só moveu o cálculo INICIAL para o browser.
 */
describe('CountdownChipComponent — contador vivo', () => {
  // quinta-feira, 08/01/2026, 07h00.
  const AGORA = new Date(2026, 0, 8, 7, 0, 0);
  const QUI = 4;

  /** Host OnPush: reproduz details-scoreboard, que é onde o chip realmente vive. */
  @Component({
    standalone: true,
    imports: [CountdownChipComponent],
    template: `<app-countdown-chip [diaSemana]="dia" [horario]="hora" />`,
    changeDetection: ChangeDetectionStrategy.OnPush,
  })
  class HostOnPushComponent {
    dia = QUI;
    hora = '07:30';
  }

  async function montar(
    hora: string,
    plataforma: 'browser' | 'server' = 'browser'
  ): Promise<ComponentFixture<HostOnPushComponent>> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [HostOnPushComponent],
      providers: [{ provide: PLATFORM_ID, useValue: plataforma }],
    }).compileComponents();

    const fixture = TestBed.createComponent(HostOnPushComponent);
    fixture.componentInstance.hora = hora;
    fixture.detectChanges();
    return fixture;
  }

  const chipDe = (f: ComponentFixture<HostOnPushComponent>): CountdownChipComponent =>
    f.debugElement.children[0].componentInstance;
  /**
   * O ChangeDetectorRef do componente, e não `injector.get(ChangeDetectorRef)`:
   * o Angular devolve um ViewRef NOVO a cada `get`, então espiar aquele não
   * observa as chamadas que o componente faz na instância que ele guarda.
   */
  const cdrDe = (f: ComponentFixture<HostOnPushComponent>): ChangeDetectorRef =>
    (chipDe(f) as unknown as { _cdr: ChangeDetectorRef })._cdr;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(AGORA);
  });
  afterEach(() => jasmine.clock().uninstall());

  it('calcula o label no browser ao inicializar', async () => {
    const f = await montar('07:30'); // +30 min
    expect(chipDe(f).label).toBe('Começa em 30 min');
    expect(f.nativeElement.textContent).toContain('Começa em 30 min');
  });

  it('recalcula quando o intervalo de 60s dispara', async () => {
    const f = await montar('07:30');
    jasmine.clock().tick(60_000); // avança o relógio E dispara o timer
    expect(chipDe(f).label).toBe('Começa em 29 min');
  });

  it('marca para verificação, para atravessar ancestrais OnPush', async () => {
    const f = await montar('07:30');
    const spy = spyOn(cdrDe(f), 'markForCheck').and.callThrough();

    jasmine.clock().tick(60_000);

    // Sem markForCheck o valor muda no componente e nunca chega ao DOM sob um
    // pai OnPush — era exatamente o sintoma medido em produção.
    expect(spy).toHaveBeenCalled();
  });

  it('não marca quando o texto não mudou', async () => {
    // Missa às 12h: 300 min, fora da janela de 3h, então o rótulo é "Hoje às 12h"
    // e não muda de minuto em minuto.
    const f = await montar('12:00');
    expect(chipDe(f).label).toBe('Hoje às 12h');

    const spy = spyOn(cdrDe(f), 'markForCheck').and.callThrough();
    jasmine.clock().tick(60_000);

    expect(chipDe(f).label).toBe('Hoje às 12h');
    expect(spy).not.toHaveBeenCalled();
  });

  it('não agenda timer no prerender', async () => {
    const f = await montar('07:30', 'server');
    expect(chipDe(f).label).toBe('');

    jasmine.clock().tick(60_000);

    expect(chipDe(f).label).withContext('o timer não pode existir no server').toBe('');
  });
});
