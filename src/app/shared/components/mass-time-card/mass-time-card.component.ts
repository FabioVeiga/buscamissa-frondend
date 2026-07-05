import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MassCardData, MassUrgency } from '../../models/mass-card.model';
import { formatMassTime } from '../../utils/mass-time.utils';
import { linkParoquia } from '../../utils/church-link.utils';
import { ConfidenceBadgeComponent } from '../confidence-badge/confidence-badge.component';
import { CountdownChipComponent } from '../countdown-chip/countdown-chip.component';
import { DistanceChipComponent } from '../distance-chip/distance-chip.component';

@Component({
  selector: 'app-mass-time-card',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ConfidenceBadgeComponent,
    CountdownChipComponent,
    DistanceChipComponent,
  ],
  templateUrl: './mass-time-card.component.html',
  styleUrl: './mass-time-card.component.scss',
})
export class MassTimeCardComponent implements OnChanges {
  @Input({ required: true }) data!: MassCardData;
  /** Usado na tela /missa-agora para colorir a borda por urgência */
  @Input() urgency: MassUrgency = null;
  /** Estado de favorito — controla o ícone de coração */
  @Input() isFavorite = false;

  @Output() navigateClick = new EventEmitter<MassCardData>();
  @Output() favoriteClick = new EventEmitter<MassCardData>();
  @Output() cardClick = new EventEmitter<MassCardData>();

  formattedTime = '';
  parishRoute: string[] = [];

  ngOnChanges(): void {
    this.formattedTime = formatMassTime(this.data.mass.horario);
    this.parishRoute = linkParoquia({
      slug: this.data.slug,
      nomeUnico: this.data.nomeUnico ?? this.data.slug,
      endereco: { uf: this.data.uf, cidadeSlug: this.data.cidadeSlug },
    });
  }

  onNavigate(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.navigateClick.emit(this.data);
  }

  onFavorite(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.favoriteClick.emit(this.data);
  }
}
