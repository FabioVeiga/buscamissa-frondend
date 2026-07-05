import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DIAS, PERIODOS } from '../../city.constants';

export type QuickFilter = 'hoje' | 'amanha' | 'fds';
export type Ordenacao = 'az' | 'za' | 'proximidade' | 'proxima-missa';

/** Filtros rápidos + período/ordenação + dias da semana (extraído do CityComponent — auditoria 2.x). */
@Component({
  selector: 'app-city-filtros',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './city-filtros.component.html',
  styleUrls: ['./city-filtros.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CityFiltrosComponent {
  @Input() quickFilter: QuickFilter | null = null;
  @Input() periodoAtivo: string | null = null;
  @Input() diaAtivo: number | null = null;
  @Input() ordenacaoAtiva: Ordenacao = 'proxima-missa';
  @Input() temGeolocalizacao = false;
  @Input() temFiltroAtivo = false;
  @Input() mostrarOrdenacao = false;

  @Output() quickFilterClick = new EventEmitter<QuickFilter>();
  @Output() diaClick = new EventEmitter<number>();
  @Output() periodoClick = new EventEmitter<string>();
  @Output() ordenacaoChange = new EventEmitter<Ordenacao>();
  @Output() limparClick = new EventEmitter<void>();

  /** Estado de UI local — não afeta o pai */
  mostrarFiltrosAvancados = false;

  readonly dias = DIAS;
  readonly periodos = Object.entries(PERIODOS).map(([slug, v]) => ({ slug, label: v.label }));
}
