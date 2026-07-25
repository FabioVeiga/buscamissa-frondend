import { Component, Input, OnChanges, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
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

  ngOnInit(): void {
    this.updateLabel();
    // No prerender (server) NÃO agendamos o setInterval: um timer pendente impede
    // o Angular de estabilizar e o render da rota estoura o timeout (derrubando o
    // build). O label estático já foi calculado; a contagem regressiva viva só faz
    // sentido no browser e hidrata lá.
    if (this._isBrowser) {
      this.intervalId = setInterval(() => this.updateLabel(), 60_000);
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

  private updateLabel(): void {
    this.label = getCountdownLabel(this.diaSemana, this.horario);
  }
}
