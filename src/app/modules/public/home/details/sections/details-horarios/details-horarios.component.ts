import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { Mass } from '../../../../church/models/church.model';
import { formatMassTime } from '../../../../../../shared/utils/mass-time.utils';
import { descrever, ehSemanal, ocorreEm } from '../../../../../../shared/utils/recorrencia-missa';

/** Missa na grade semanal; `diaDoMes` marca a de dia fixo que cai nesta semana. */
interface MissaNaGrade extends Mass {
  diaFixoNaSemana?: number;
}

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
  get agendaSemana(): { dia: number; label: string; missas: MissaNaGrade[] }[] {
    const labels = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
    const grupos: Record<number, MissaNaGrade[]> = {};
    (this.missas ?? []).filter((m) => ehSemanal(m)).forEach((m) => {
      if (m.diaSemana !== undefined && m.diaSemana !== null) {
        (grupos[m.diaSemana] = grupos[m.diaSemana] ?? []).push(m);
      }
    });
    this._adicionarDiaFixoDaSemana(grupos);
    return labels.map((label, dia) => ({
      dia,
      label,
      missas: (grupos[dia] ?? []).sort((a, b) => a.horario.localeCompare(b.horario)),
    }));
  }

  /**
   * Dia fixo do mês que cai nos próximos 7 dias (a partir de hoje) entra na linha do
   * dia da semana correspondente, marcado com o dia ("14h00 · dia 1"). Só no browser:
   * o prerender fica no ar por dias e não sabe que dia é hoje — o HTML pré-gerado
   * mantém a grade só com as semanais (a regra completa segue na seção abaixo).
   * Dia de exceção (ex.: "exceto domingos") já fica de fora pelo `ocorreEm`.
   */
  private _adicionarDiaFixoDaSemana(grupos: Record<number, MissaNaGrade[]>): void {
    if (!this._isBrowser) return;
    const diasFixos = (this.missas ?? []).filter((m) => !ehSemanal(m));
    if (!diasFixos.length) return;

    for (const data of this._proximos7Dias()) {
      for (const m of diasFixos) {
        if (!ocorreEm(m, data)) continue;
        (grupos[data.getDay()] = grupos[data.getDay()] ?? []).push({ ...m, diaFixoNaSemana: data.getDate() });
      }
    }
  }

  /** Hoje + 6 dias, à meia-noite local. */
  private _proximos7Dias(): Date[] {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i));
  }

  /** Missa de dia fixo que já aparece na grade desta semana (só no browser). */
  private _estaNaGrade(m: Mass): boolean {
    return this._isBrowser && this._proximos7Dias().some((d) => ocorreEm(m, d));
  }

  /** Missas de dia fixo do mês ("Todo dia 13, 19h"): fora da grade semanal. */
  // Só as que NÃO estão na grade desta semana: a que já aparece como "14h00 · dia 1"
  // não se repete aqui. No prerender todas entram (a grade lá não tem dia fixo).
  get missasDiaFixo(): { descricao: string; observacao?: string }[] {
    return (this.missas ?? [])
      .filter((m) => !ehSemanal(m) && !this._estaNaGrade(m))
      .sort((a, b) => (a.diaDoMes ?? 0) - (b.diaDoMes ?? 0) || a.horario.localeCompare(b.horario))
      .map((m) => ({ descricao: m.descricaoRecorrencia || descrever(m), observacao: m.observacao }));
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
