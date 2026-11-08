import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { Mass } from '../../../../church/models/church.model';
import { descrever, TIPO_RECORRENCIA } from '../../../../../../shared/utils/recorrencia-missa';
import { conteudoIcs, eventoMissa, EventoMissa, linkGoogleAgenda, rruleDaMissa } from '../../../../../../shared/utils/agenda-missa.utils';

export type DestinoAgenda = 'google' | 'ics';

/**
 * "Adicionar à agenda": a pessoa escolhe a missa (começa na próxima) e salva como
 * evento recorrente no Google Agenda ou no calendário do aparelho (.ics).
 */
@Component({
  selector: 'app-details-agenda-modal',
  standalone: true,
  imports: [CommonModule, DialogModule],
  templateUrl: './details-agenda-modal.component.html',
  styleUrls: ['../details-compartilhar-modal/details-compartilhar-modal.component.scss', './details-agenda-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsAgendaModalComponent implements OnChanges {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();

  @Input() missas: Mass[] = [];
  @Input() proximaMissa: Mass | null = null;
  @Input() igrejaId: number | null = null;
  @Input() igrejaNome = '';
  @Input() endereco = '';
  @Input() url = '';

  @Output() adicionado = new EventEmitter<DestinoAgenda>();

  selecionada: Mass | null = null;
  /** Marcado = evento recorrente; desmarcado = só a próxima ocorrência. */
  repetir = true;

  ngOnChanges(c: SimpleChanges): void {
    // Ao abrir, começa pela próxima missa, repetindo.
    if (c['visible'] && this.visible) {
      this.selecionada = this.proximaMissa ?? this.opcoes[0] ?? null;
      this.repetir = true;
    }
  }

  /** Missas em ordem: semanais por dia/hora, depois as mensais. */
  get opcoes(): Mass[] {
    const ordem = (m: Mass) =>
      ((m.tipoRecorrencia ?? TIPO_RECORRENCIA.Semanal) === TIPO_RECORRENCIA.Semanal ? 0 : 10) + (m.diaSemana ?? 0);
    return [...(this.missas ?? [])].sort((a, b) => ordem(a) - ordem(b) || a.horario.localeCompare(b.horario));
  }

  rotulo(m: Mass): string {
    return descrever(m);
  }

  /** Evento da missa escolhida, sem a repetição quando a pessoa desmarca "Repetir". */
  get evento(): EventoMissa | null {
    const ev = this.selecionada ? eventoMissa(this.selecionada, this.igrejaNome, this.endereco, this.url) : null;
    return ev && !this.repetir ? { ...ev, rrule: '' } : ev;
  }

  /** Regra de repetição da missa escolhida (independe do checkbox). Vazia = não há o que repetir. */
  get regraRepeticao(): string {
    return this.selecionada ? rruleDaMissa(this.selecionada) : '';
  }

  /** Rótulo do checkbox: "Repetir toda semana" / "Repetir todo mês". */
  get repeticao(): string {
    return this.regraRepeticao.startsWith('FREQ=WEEKLY') ? 'Repetir toda semana' : 'Repetir todo mês';
  }

  /** "domingo, 8 de novembro" — a data do evento único. */
  get dataProxima(): string {
    const ev = this.evento;
    return ev ? ev.inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  }

  get linkGoogle(): string {
    const ev = this.evento;
    return ev ? linkGoogleAgenda(ev) : '#';
  }

  baixarIcs(): void {
    const ev = this.evento;
    if (!ev) return;
    const uid = `missa-${this.igrejaId ?? 0}-${ev.rrule ? ev.rrule.replace(/[^A-Z0-9]/gi, '') : ev.inicio.getTime()}-${this.selecionada?.horario.replace(/\D/g, '')}@buscamissa.com.br`;
    const blob = new Blob([conteudoIcs(ev, uid)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'missa-buscamissa.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.adicionado.emit('ics');
    this.visibleChange.emit(false);
  }

  abriuGoogle(): void {
    this.adicionado.emit('google');
    this.visibleChange.emit(false);
  }
}
