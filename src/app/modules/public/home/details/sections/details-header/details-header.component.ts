import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Mass } from '../../../../church/models/church.model';
import { ConfidenceBadgeComponent } from '../../../../../../shared/components/confidence-badge/confidence-badge.component';
import { ChurchPlaceholderComponent } from '../../../../../../shared/components/church-placeholder/church-placeholder.component';

/** Header da página da paróquia: foto, dados básicos e ações (extraído do DetailsComponent — auditoria 2.x). */
@Component({
  selector: 'app-details-header',
  standalone: true,
  imports: [CommonModule, ConfidenceBadgeComponent, ChurchPlaceholderComponent],
  templateUrl: './details-header.component.html',
  styleUrls: ['./details-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsHeaderComponent {
  @Input({ required: true }) igreja: any;
  @Input() proximaMissa: Mass | null = null;
  @Input() isFavorita = false;

  @Output() compartilharClick = new EventEmitter<void>();
  @Output() favoritarClick = new EventEmitter<void>();
  @Output() direcoesClick = new EventEmitter<void>();

  fotoQuebrou = false;

  get linkGoogleMaps(): string {
    const e = this.igreja?.endereco;
    if (!e) return '#';
    if (e.latitude && e.longitude)
      return `https://www.google.com/maps/search/?api=1&query=${e.latitude},${e.longitude}`;
    const q = encodeURIComponent(`${this.igreja.nome}, ${e.logradouro}, ${e.localidade} ${e.uf}`);
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  get linkWaze(): string {
    const e = this.igreja?.endereco;
    if (!e) return '#';
    if (e.latitude && e.longitude)
      return `https://waze.com/ul?ll=${e.latitude},${e.longitude}&navigate=yes`;
    const q = encodeURIComponent(`${this.igreja.nome}, ${e.logradouro}, ${e.localidade}`);
    return `https://waze.com/ul?q=${q}&navigate=yes`;
  }
}
