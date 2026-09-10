import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Mass } from '../../../../church/models/church.model';
import { CountdownChipComponent } from '../../../../../../shared/components/countdown-chip/countdown-chip.component';
import {
  getNextOccurrenceMinutes,
  formatMassTime,
  getDiaLabel,
  getProximaMissaData,
} from '../../../../../../shared/utils/mass-time.utils';

/** Scoreboard "Próxima missa" da página da paróquia (extraído do DetailsComponent — auditoria 2.x). */
@Component({
  selector: 'app-details-scoreboard',
  standalone: true,
  imports: [CommonModule, CountdownChipComponent],
  templateUrl: './details-scoreboard.component.html',
  styleUrls: ['./details-scoreboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsScoreboardComponent {
  @Input() proximaMissa: Mass | null = null;

  @Output() verTodas = new EventEmitter<void>();

  /** Falso no prerender: separa informação temporal estável da relativa. */
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Minutos até a próxima missa */
  private get minutosProximaMissa(): number | null {
    const pm = this.proximaMissa;
    return pm ? getNextOccurrenceMinutes(pm.diaSemana!, pm.horario) : null;
  }

  /**
   * Só mostra o contador quando cria urgência real (até 3h) — e nunca no prerender:
   * "Começa em 2h30" gravado em arquivo estático vence no minuto seguinte.
   */
  get mostrarContador(): boolean {
    if (!this._isBrowser) return false;
    const min = this.minutosProximaMissa;
    return min !== null && min <= 180;
  }

  /** Rótulo do dia: nome do dia no prerender, "Hoje"/"Amanhã" depois de hidratar. */
  get proximaMissaDiaLabel(): string {
    const pm = this.proximaMissa;
    if (!pm) return '';
    return getDiaLabel(pm.diaSemana!, pm.horario, this._isBrowser);
  }

  /**
   * "quinta-feira, 15 de maio" no browser; só "quinta-feira" no prerender.
   *
   * Era o pior caso do congelamento: uma data por extenso é afirmativa e
   * falsificável. Em 2026-09-09 o Google exibia "terça-feira, 8 de setembro" como
   * próxima missa de uma paróquia — a data do build anterior, de ontem.
   */
  get proximaMissaData(): string {
    const pm = this.proximaMissa;
    if (!pm) return '';
    return getProximaMissaData(pm.diaSemana!, pm.horario, this._isBrowser);
  }

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }
}
