import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Mass } from '../../../../church/models/church.model';
import { CountdownChipComponent } from '../../../../../../shared/components/countdown-chip/countdown-chip.component';
import { getNextOccurrenceMinutes, formatMassTime } from '../../../../../../shared/utils/mass-time.utils';

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

  /** Minutos até a próxima missa */
  private get minutosProximaMissa(): number | null {
    const pm = this.proximaMissa;
    return pm ? getNextOccurrenceMinutes(pm.diaSemana!, pm.horario) : null;
  }

  /** Só mostra o contador regressivo quando cria urgência real (até 3h) — evita redundância com o dia */
  get mostrarContador(): boolean {
    const min = this.minutosProximaMissa;
    return min !== null && min <= 180;
  }

  /** Rótulo curto do dia da próxima missa: "Hoje" / "Amanhã" / "Sábado" */
  get proximaMissaDiaLabel(): string {
    const pm = this.proximaMissa;
    if (!pm) return '';
    const min = getNextOccurrenceMinutes(pm.diaSemana!, pm.horario);
    const alvo = new Date(Date.now() + min * 60_000);

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dAlvo = new Date(alvo); dAlvo.setHours(0, 0, 0, 0);
    const diff = Math.round((dAlvo.getTime() - hoje.getTime()) / 86_400_000);

    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][pm.diaSemana!] ?? '';
  }

  /** Data completa da próxima ocorrência: "quinta-feira, 15 de maio" */
  get proximaMissaData(): string {
    const pm = this.proximaMissa;
    if (!pm) return '';
    const min = getNextOccurrenceMinutes(pm.diaSemana!, pm.horario);
    const data = new Date(Date.now() + min * 60_000);
    return data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }
}
