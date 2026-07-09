import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

/** Seção "Como chegar": mapa embed + endereço (extraído do DetailsComponent — auditoria 2.x). */
@Component({
  selector: 'app-details-como-chegar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './details-como-chegar.component.html',
  styleUrls: ['./details-como-chegar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsComoChegarComponent {
  private _sanitizer = inject(DomSanitizer);

  @Input({ required: true }) igreja: any;

  @Output() direcoesClick = new EventEmitter<void>();

  // Cache por referência da igreja — evita recriar a SafeResourceUrl (e recarregar
  // o iframe) a cada ciclo de change detection.
  private _mapUrlCache: SafeResourceUrl | null = null;
  private _mapUrlCacheFor: any = null;

  /** Mapa embarcado (Google Maps embed, sem API key) */
  get mapEmbedUrl(): SafeResourceUrl | null {
    const e = this.igreja?.endereco;
    if (!e) return null;
    if (this._mapUrlCacheFor !== this.igreja) {
      const q = e.latitude && e.longitude
        ? `${e.latitude},${e.longitude}`
        : encodeURIComponent(`${this.igreja.nome}, ${e.logradouro}, ${e.localidade} ${e.uf}`);
      this._mapUrlCache = this._sanitizer.bypassSecurityTrustResourceUrl(
        `https://maps.google.com/maps?q=${q}&z=16&output=embed`
      );
      this._mapUrlCacheFor = this.igreja;
    }
    return this._mapUrlCache;
  }

  /** CEP só é exibível se não for placeholder/zerado dos imports */
  get cepValido(): boolean {
    const cep = (this.igreja?.endereco?.cep ?? '').replace(/\D/g, '');
    return cep.length === 8 && cep !== '00000000';
  }

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
