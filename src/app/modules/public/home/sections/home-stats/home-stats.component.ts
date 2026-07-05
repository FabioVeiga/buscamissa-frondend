import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export interface HomeStats {
  igrejas: number;
  horarios: number;
  cidades: number;
  estados: number;
}

/** Seção "O Busca Missa em números" (extraída do HomeComponent — auditoria 2.1). */
@Component({
  selector: 'app-home-stats',
  standalone: true,
  templateUrl: './home-stats.component.html',
  styleUrls: ['./home-stats.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeStatsComponent {
  @Input({ required: true }) stats!: HomeStats;

  /** Formata número com separador de milhar pt-BR (ex.: 2000 → "2.000") */
  fmt(n: number): string {
    return (n ?? 0).toLocaleString('pt-BR');
  }
}
