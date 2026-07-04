import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IgrejaFavorita } from '../../../../../core/services/favorites.service';
import { getCountdownLabel, getNextOccurrenceMinutes } from '../../../../../shared/utils/mass-time.utils';

/** Seção "Seus favoritos" da home (extraída do HomeComponent — auditoria 2.1). */
@Component({
  selector: 'app-home-favoritos',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home-favoritos.component.html',
  styleUrls: ['./home-favoritos.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeFavoritosComponent {
  @Input({ required: true }) favoritas: IgrejaFavorita[] = [];
  @Output() remover = new EventEmitter<number>();

  onRemover(id: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.remover.emit(id);
  }

  /** Urgência da próxima missa de um favorito. */
  getUrgencia(fav: IgrejaFavorita): 'hot' | 'soon' | null {
    if (!fav || fav.diaSemana == null || !fav.horario) return null;
    const mins = getNextOccurrenceMinutes(fav.diaSemana, fav.horario);
    if (mins <= 180) return 'hot';
    if (new Date().getDay() === fav.diaSemana) return 'soon';
    return null;
  }

  /** Label da próxima missa para um favorito. */
  getProximaLabel(fav: IgrejaFavorita): string {
    if (!fav || fav.diaSemana == null || !fav.horario) return '';
    return getCountdownLabel(fav.diaSemana, fav.horario);
  }
}
