import { Component, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
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

  ngOnInit(): void {
    this.updateLabel();
    this.intervalId = setInterval(() => this.updateLabel(), 60_000);
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
