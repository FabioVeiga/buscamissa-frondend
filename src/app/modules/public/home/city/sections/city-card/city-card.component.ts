import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ConfidenceBadgeComponent } from '../../../../../../shared/components/confidence-badge/confidence-badge.component';
import { ChurchPlaceholderComponent } from '../../../../../../shared/components/church-placeholder/church-placeholder.component';
import { getNextOccurrenceMinutes, formatMassTime, getCountdownLabel } from '../../../../../../shared/utils/mass-time.utils';
import { distanciaMetrosAte } from '../../../../../../shared/utils/distance.utils';

/** Card de igreja da lista da cidade (extraído do CityComponent — auditoria 2.x). */
@Component({
  selector: 'app-city-card',
  standalone: true,
  imports: [CommonModule, RouterLink, ConfidenceBadgeComponent, ChurchPlaceholderComponent],
  templateUrl: './city-card.component.html',
  styleUrls: ['./city-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CityCardComponent {
  @Input({ required: true }) igreja: any;
  /** Próxima missa considerando os filtros ativos — calculada pelo pai */
  @Input() proximaMissa: any | null = null;
  @Input() destaque = false;
  @Input() mostrarBadgeDestaque = false;
  @Input() favorita = false;
  @Input() cidadeNome = '';
  @Input() uf = '';
  @Input() cidadeSlug = '';
  @Input() userLat: number | null = null;
  @Input() userLng: number | null = null;

  @Output() churchClick = new EventEmitter<void>();
  @Output() favoritarClick = new EventEmitter<void>();
  @Output() comoChegarClick = new EventEmitter<void>();

  imagemQuebrada = false;

  get linkParoquia(): string[] {
    return ['/paroquia', this.uf, this.cidadeSlug, this.igreja.slug];
  }

  get distanciaMetros(): number | null {
    return distanciaMetrosAte(
      this.userLat,
      this.userLng,
      this.igreja.endereco?.latitude,
      this.igreja.endereco?.longitude
    );
  }

  get diaMissa(): string {
    const pm = this.proximaMissa;
    if (!pm) return '';
    return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][pm.diaSemana] ?? '';
  }

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }

  ehUrgente(m: any): boolean {
    return getNextOccurrenceMinutes(m.diaSemana, m.horario) <= 180;
  }

  countdownLabel(m: any): string {
    return getCountdownLabel(m.diaSemana, m.horario);
  }

  diaLabelRelativo(m: any): string {
    const min = getNextOccurrenceMinutes(m.diaSemana, m.horario);
    const alvo = new Date(Date.now() + min * 60_000);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dAlvo = new Date(alvo); dAlvo.setHours(0, 0, 0, 0);
    const diff = Math.round((dAlvo.getTime() - hoje.getTime()) / 86_400_000);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][m.diaSemana] ?? '';
  }

  onFavoritar(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.favoritarClick.emit();
  }
}
