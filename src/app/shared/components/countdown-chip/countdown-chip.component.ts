import { Component, Input, NgZone, OnChanges, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { getCountdownLabel } from '../../utils/mass-time.utils';

@Component({
  selector: 'app-countdown-chip',
  standalone: true,
  imports: [],
  templateUrl: './countdown-chip.component.html',
  styleUrl: './countdown-chip.component.scss',
})
export class CountdownChipComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) diaSemana!: number;
  @Input({ required: true }) horario!: string;

  label = '';
  private intervalId?: ReturnType<typeof setInterval>;
  private _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private _ngZone = inject(NgZone);

  ngOnInit(): void {
    this.updateLabel();
    // No prerender (server) NÃO agendamos o setInterval: um timer pendente impede
    // o Angular de estabilizar e o render da rota estoura o timeout (derrubando o
    // build).
    //
    // No browser o timer roda FORA da zona pelo mesmo motivo, com outro sintoma:
    // dentro da zona, um setInterval recorrente mantém ApplicationRef.isStable()
    // em false para sempre, a hidratação nunca conclui (NG0506) e todo bloco
    // @defer da página fica congelado no @placeholder. Só reentramos na zona
    // quando o label realmente muda — 1x por minuto no máximo, e só nos chips
    // que mudaram.
    if (this._isBrowser) {
      this.intervalId = this._ngZone.runOutsideAngular(() =>
        setInterval(() => {
          const novo = getCountdownLabel(this.diaSemana, this.horario);
          if (novo !== this.label) this._ngZone.run(() => (this.label = novo));
        }, 60_000)
      );
    }
  }

  ngOnChanges(): void {
    this.updateLabel();
  }

  ngOnDestroy(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
    }
  }

  /**
   * O guard de browser aqui é o ponto do arquivo: antes, `updateLabel()` rodava
   * INCONDICIONALMENTE no `ngOnInit`, então o valor inicial era calculado no
   * prerender e gravado no HTML estático. O guard de `_isBrowser` protegia só o
   * `setInterval`, não o primeiro cálculo — e era daí que saíam os contadores
   * congelados que chegaram ao índice do Google ("19h30 Hoje Começa em 2h30" nos
   * snippets de /missas/df/sao-sebastiao e /missas/sp/votorantim, 2026-09-09).
   *
   * Com `label` vazio no server, o `@if (label)` do template não renderiza o chip.
   * Ele nasce na hidratação, já com o valor certo, e o timer o mantém vivo.
   */
  private updateLabel(): void {
    this.label = this._isBrowser
      ? getCountdownLabel(this.diaSemana, this.horario)
      : '';
  }
}
