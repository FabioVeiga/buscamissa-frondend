import { ChangeDetectionStrategy, Component, Input, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Mass } from '../../../../church/models/church.model';
import { CountdownChipComponent } from '../../../../../../shared/components/countdown-chip/countdown-chip.component';
import {
  getNextOccurrenceMinutes,
  formatMassTime,
  getDiaLabel,
  getProximaMissaData,
} from '../../../../../../shared/utils/mass-time.utils';
import { ehSemanal } from '../../../../../../shared/utils/recorrencia-missa';

/**
 * Placar "Próxima missa" da página da paróquia. Sem próxima missa não renderiza:
 * o aviso de "sem horários" fica só na grade (antes aparecia duas vezes).
 */
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
  /** Todas as missas da igreja — usadas para "Também neste dia". */
  @Input() missas: Mass[] = [];

  /** Falso no prerender: separa informação temporal estável da relativa. */
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Minutos até a próxima missa */
  private get minutosProximaMissa(): number | null {
    const pm = this.proximaMissa;
    return pm ? getNextOccurrenceMinutes(pm.diaSemana!, pm.horario, pm) : null;
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
    const label = getDiaLabel(pm.diaSemana!, pm.horario, this._isBrowser, pm);
    if (label === 'Hoje' || label === 'Amanhã' || !this._isBrowser) return label;
    // Outro dia da semana: a data por extenso já começa com o nome do dia.
    return '';
  }

  /**
   * Complemento do rótulo — só no browser (no prerender uma data por extenso
   * congelaria: em 2026-09-09 o Google exibia a data do build anterior).
   * "Hoje"/"Amanhã" → "8 de novembro"; outro dia → "domingo, 15 de novembro".
   */
  get proximaMissaData(): string {
    const pm = this.proximaMissa;
    if (!pm || !this._isBrowser) return '';
    const completa = getProximaMissaData(pm.diaSemana!, pm.horario, true, pm);
    if (!this.proximaMissaDiaLabel) return completa.charAt(0).toUpperCase() + completa.slice(1);
    // "domingo, 8 de novembro" → "8 de novembro"
    const i = completa.indexOf(', ');
    return i >= 0 ? completa.slice(i + 2) : completa;
  }

  /** Demais missas semanais no mesmo dia da próxima, depois dela ("09h00", "18h00"). */
  get outrasNoDia(): string[] {
    const pm = this.proximaMissa;
    if (!pm || !ehSemanal(pm)) return [];
    return (this.missas ?? [])
      .filter((m) => ehSemanal(m) && m.diaSemana === pm.diaSemana && m.horario > pm.horario)
      .map((m) => m.horario)
      .filter((h, i, arr) => arr.indexOf(h) === i)
      .sort()
      .map((h) => formatMassTime(h));
  }

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }
}
