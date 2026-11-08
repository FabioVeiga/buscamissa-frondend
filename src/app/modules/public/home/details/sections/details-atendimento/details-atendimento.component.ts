import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { formatMassTime } from '../../../../../../shared/utils/mass-time.utils';
import { agruparSessoesPorDiasConsecutivos, SessaoAgrupada, SessaoComHorario } from '../../../../../../shared/utils/sessao-horario.utils';

const TIPO_SECRETARIA = 1;
const TIPO_CONFISSAO = 2;

type SessaoPublica = SessaoComHorario & { tipo: number };

/** Horários de confissão e da secretaria; cada bloco só aparece se a paróquia preencheu. */
@Component({
  selector: 'app-details-atendimento',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './details-atendimento.component.html',
  styleUrls: ['./details-atendimento.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsAtendimentoComponent {
  @Input({ required: true }) sessoes: SessaoPublica[] = [];

  get confissao(): SessaoAgrupada[] {
    return this._doTipo(TIPO_CONFISSAO);
  }

  get secretaria(): SessaoAgrupada[] {
    return this._doTipo(TIPO_SECRETARIA);
  }

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }

  private _doTipo(tipo: number): SessaoAgrupada[] {
    return agruparSessoesPorDiasConsecutivos((this.sessoes ?? []).filter((s) => s.tipo === tipo));
  }
}
