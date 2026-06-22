import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  SimpleChanges,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';

export interface MapChurch {
  id: number;
  nome: string;
  lat: number | null;
  lng: number | null;
}

@Component({
  selector: 'app-city-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="city-map-wrap">
      <div #mapEl class="city-map-el"></div>
      <div class="city-map-footer" *ngIf="igrejas.length">
        <span class="city-map-footer__text">
          Mostrando as próximas missas ordenadas por horário
        </span>
        <a [href]="mapsSearchUrl" target="_blank" rel="noopener" class="city-map-footer__link">
          Saiba como funciona
        </a>
      </div>
    </div>
  `,
  styles: [`
    .city-map-wrap {
      border-radius: 1rem;
      overflow: hidden;
      border: 1.5px solid #e5e7eb;
      background: #f9fafb;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 28rem;
    }
    .city-map-el {
      flex: 1;
      min-height: 24rem;
    }
    .city-map-footer {
      padding: 0.625rem 1rem;
      background: #fff;
      border-top: 1px solid #f0f0f0;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .city-map-footer__text {
      font-size: 0.75rem;
      color: #6b7280;
    }
    .city-map-footer__link {
      font-size: 0.75rem;
      color: #bc5d10;
      font-weight: 600;
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }
  `],
})
export class CityMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  @Input() igrejas: MapChurch[] = [];
  @Input() cidadeNome = '';
  @Input() uf = '';

  private _map: L.Map | null = null;
  private _markers: L.Marker[] = [];

  get mapsSearchUrl(): string {
    return `https://www.google.com/maps/search/missa+${encodeURIComponent(this.cidadeNome)}+${this.uf.toUpperCase()}`;
  }

  constructor(private _zone: NgZone) {}

  ngAfterViewInit(): void {
    this._zone.runOutsideAngular(() => {
      this._initMap();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['igrejas'] && !changes['igrejas'].firstChange && this._map) {
      this._zone.runOutsideAngular(() => this._renderMarkers());
    }
  }

  ngOnDestroy(): void {
    this._map?.remove();
    this._map = null;
  }

  private _initMap(): void {
    if (this._map) return;

    this._map = L.map(this.mapEl.nativeElement, {
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(this._map);

    this._renderMarkers();
  }

  private _renderMarkers(): void {
    if (!this._map) return;

    this._markers.forEach((m) => m.remove());
    this._markers = [];

    const comCoords = this.igrejas
      .map((ig, i) => ({ ig, i }))
      .filter(({ ig }) => ig.lat && ig.lng);

    if (!comCoords.length) {
      // Sem coordenadas: só define view padrão (Brasil)
      this._map.setView([-14.235, -51.925], 4);
      return;
    }

    comCoords.forEach(({ ig, i }) => {
      const marker = L.marker([ig.lat!, ig.lng!], {
        icon: this._numberIcon(i + 1),
      })
        .addTo(this._map!)
        .bindTooltip(ig.nome, { direction: 'top', offset: [0, -30] });
      this._markers.push(marker);
    });

    // Ajusta bounds para mostrar todos os pins
    const group = L.featureGroup(this._markers);
    this._map.fitBounds(group.getBounds().pad(0.3));
  }

  private _numberIcon(n: number): L.DivIcon {
    return L.divIcon({
      className: '',
      html: `
        <div style="
          width:32px;height:32px;
          background:#bc5d10;
          border:2.5px solid #fff;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 2px 8px rgba(0,0,0,.3);
          display:flex;align-items:center;justify-content:center;">
          <span style="
            transform:rotate(45deg);
            color:#fff;font-size:12px;
            font-weight:800;font-family:sans-serif;">
            ${n}
          </span>
        </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });
  }
}
