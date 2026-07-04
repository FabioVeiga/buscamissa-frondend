import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MassCardData } from '../../../../../shared/models/mass-card.model';
import { MassTimeCardComponent } from '../../../../../shared/components/mass-time-card/mass-time-card.component';
import { CityMapComponent } from '../../../../../shared/components/city-map/city-map.component';
import { getMissaAgoraUrgency } from '../../../../../shared/utils/mass-time.utils';

/**
 * Seção "Próximas missas + mapa" da home (extraída do HomeComponent — auditoria 2.1).
 * O grid mostra os cards já filtrados; o mapa usa a lista completa (mesmo
 * comportamento do original).
 */
@Component({
  selector: 'app-home-missas-mapa',
  standalone: true,
  imports: [CommonModule, RouterModule, MassTimeCardComponent, CityMapComponent],
  templateUrl: './home-missas-mapa.component.html',
  styleUrls: ['./home-missas-mapa.component.scss'],
})
export class HomeMissasMapaComponent {
  @Input({ required: true }) titulo = '';
  @Input() isLoading = false;
  /** Cards exibidos no grid (já com o quick filter aplicado). */
  @Input({ required: true }) cards: MassCardData[] = [];
  /** Lista completa (sem filtro) — origem dos pinos do mapa. */
  @Input({ required: true }) todasAsCards: MassCardData[] = [];
  /** Ids das igrejas favoritas (para o coração dos cards). */
  @Input() favoritasIds: number[] = [];
  @Input() cidadeNome = '';
  @Input() cidadeUf = '';

  @Output() cardClick = new EventEmitter<MassCardData>();
  @Output() navigateClick = new EventEmitter<MassCardData>();
  @Output() favoriteClick = new EventEmitter<MassCardData>();

  /** Placeholders do skeleton (reserva espaço enquanto carrega — evita CLS). */
  readonly skeletons = [0, 1, 2, 3];

  ehFavorita(churchId: number): boolean {
    return this.favoritasIds.includes(churchId);
  }

  getUrgency(card: MassCardData) {
    if (card.mass.diaSemana == null) return null;
    return getMissaAgoraUrgency(card.mass.diaSemana, card.mass.horario);
  }

  get mapChurches(): { id: number; nome: string; lat: number | null; lng: number | null }[] {
    return this.todasAsCards.map((c) => ({
      id: c.churchId,
      nome: c.churchName,
      lat: c.latitude ?? null,
      lng: c.longitude ?? null,
    }));
  }

  get temMapaComCoords(): boolean {
    return this.mapChurches.some((m) => m.lat != null && m.lng != null);
  }
}
