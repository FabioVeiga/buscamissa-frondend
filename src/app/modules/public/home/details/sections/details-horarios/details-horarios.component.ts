import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { Mass } from '../../../../church/models/church.model';
import { formatMassTime } from '../../../../../../shared/utils/mass-time.utils';

/** Agenda semanal de horários da paróquia (extraído do DetailsComponent — auditoria 2.x). */
@Component({
  selector: 'app-details-horarios',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './details-horarios.component.html',
  styleUrls: ['./details-horarios.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsHorariosComponent {
  @Input({ required: true }) missas: Mass[] = [];

  @Output() adicionarHorarios = new EventEmitter<void>();

  /** Semana completa (7 dias) — dias sem missa entram vazios para mostrar "—" */
  get agendaSemana(): { dia: number; label: string; missas: Mass[] }[] {
    const labels = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
    const grupos: Record<number, Mass[]> = {};
    (this.missas ?? []).forEach((m) => {
      if (m.diaSemana !== undefined && m.diaSemana !== null) {
        (grupos[m.diaSemana] = grupos[m.diaSemana] ?? []).push(m);
      }
    });
    return labels.map((label, dia) => ({
      dia,
      label,
      missas: (grupos[dia] ?? []).sort((a, b) => a.horario.localeCompare(b.horario)),
    }));
  }

  /** Falso no prerender: separa informação temporal estável da relativa. */
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Pílula "HOJE" na grade semanal. Nunca no prerender: qual dia é "hoje" depende do
   * relógio de quem lê, e o arquivo estático fica no ar por dias. A grade em si —
   * dia da semana e horários — é estável e continua toda no HTML indexável; só o
   * destaque relativo nasce na hidratação.
   */
  isHoje(diaSemana: number): boolean {
    return this._isBrowser && new Date().getDay() === diaSemana;
  }

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }
}
