import { Component, inject, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { ChurchesService } from "../../../core/services/churches.service";
import { SeoService } from "../../../core/services/seo.service";
import { AnalyticsService } from "../../../core/services/analytics.service";
import { MassTimeCardComponent } from "../../../shared/components/mass-time-card/mass-time-card.component";
import { MassCardData } from "../../../shared/models/mass-card.model";
import { Mass } from "../../../core/interfaces/church.interface";
import { getMissaAgoraUrgency, getCountdownLabel } from "../../../shared/utils/mass-time.utils";
import { MessageService } from "primeng/api";
import { PrimeNgModule } from "../../../shared/primeng.module";

type GeoStatus = 'idle' | 'loading' | 'found' | 'denied' | 'error';

@Component({
  selector: "app-missa-agora",
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MassTimeCardComponent, PrimeNgModule],
  providers: [MessageService],
  templateUrl: "./missa-agora.component.html",
  styleUrl: "./missa-agora.component.scss",
})
export class MissaAgoraComponent implements OnInit, OnDestroy {
  private _church = inject(ChurchesService);
  private _seo = inject(SeoService);
  private _router = inject(Router);
  private _analytics = inject(AnalyticsService);
  private _toast = inject(MessageService);

  geoStatus: GeoStatus = 'idle';
  permissaoNegadaPeloBrowser = false;
  missas: MassCardData[] = [];
  isLoading = false;
  cidadeDetectada: string | null = null;
  horaAtual = '';
  private _clockInterval: any;

  readonly cidadesFallback = [
    { nome: 'São Paulo',           uf: 'sp', slug: 'sao-paulo' },
    { nome: 'Campinas',            uf: 'sp', slug: 'campinas' },
    { nome: 'Rio de Janeiro',      uf: 'rj', slug: 'rio-de-janeiro' },
    { nome: 'Belo Horizonte',      uf: 'mg', slug: 'belo-horizonte' },
    { nome: 'Brasília',            uf: 'df', slug: 'brasilia' },
    { nome: 'Santos',              uf: 'sp', slug: 'santos' },
  ];

  ngOnInit(): void {
    this._seo.update({
      title: 'Missa Agora | BuscaMissa',
      description: 'Veja as missas que estão acontecendo agora ou nas próximas 2 horas perto de você.',
      canonical: 'https://buscamissa.com.br/missa-agora',
    });
    this._atualizarHora();
    this._clockInterval = setInterval(() => this._atualizarHora(), 30000);
    this._pedirGeolocalizacao();
  }

  ngOnDestroy(): void {
    clearInterval(this._clockInterval);
  }

  private _atualizarHora(): void {
    const agora = new Date();
    this.horaAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  private _pedirGeolocalizacao(): void {
    if (!navigator.geolocation) {
      this.geoStatus = 'denied';
      return;
    }
    this.geoStatus = 'loading';
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.permissaoNegadaPeloBrowser = false;
        this.geoStatus = 'found';
        this._buscarMissas(pos.coords.latitude, pos.coords.longitude);
        this._reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      },
      err => {
        this.geoStatus = 'denied';
        if (err.code === 1) {
          this.permissaoNegadaPeloBrowser = true;
        }
      }
    );
  }

  private _buscarMissas(lat: number, lng: number): void {
    this.isLoading = true;
    this._church.proximasMissas(lat, lng, 10).subscribe({
      next: (res: any) => {
        const items: any[] = res?.data ?? res ?? [];
        this.missas = items.slice(0, 10).map((item: any) => ({
          churchId: item.igrejaId,
          churchName: item.nome,
          slug: item.slug,
          uf: item.uf?.toLowerCase(),
          cidadeSlug: item.cidadeSlug,
          bairro: item.bairro ?? '',
          localidade: '',
          imagemUrl: item.imagemUrl,
          mass: {
            id: item.missa?.id,
            diaSemana: item.missa?.diaSemana,
            horario: item.missa?.horario,
            observacao: item.missa?.observacao,
            fontePrincipal: item.missa?.fontePrincipal,
            ultimaValidacao: item.missa?.ultimaValidacao,
            scoreConfianca: item.missa?.scoreConfianca,
            statusConfianca: item.missa?.statusConfianca,
          } as Mass,
          distanceMeters: item.distanciaKm != null ? item.distanciaKm * 1000 : undefined,
          latitude: item.latitude,
          longitude: item.longitude,
        }));
      },
      error: () => { this.geoStatus = 'error'; },
      complete: () => { this.isLoading = false; },
    });
  }

  private _reverseGeocode(lat: number, lng: number): void {
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`)
      .then(r => r.json())
      .then((data: any) => {
        const addr = data.address ?? {};
        this.cidadeDetectada = addr.city || addr.town || addr.village || null;
      })
      .catch(() => {});
  }

  getUrgency(card: MassCardData) {
    if (card.mass.diaSemana == null) return null;
    return getMissaAgoraUrgency(card.mass.diaSemana, card.mass.horario);
  }

  tentar(): void {
    this.missas = [];
    this.permissaoNegadaPeloBrowser = false;
    this._pedirGeolocalizacao();
  }

  irParaCidade(cidade: { uf: string; slug: string }): void {
    this._router.navigate(['/missas', cidade.uf, cidade.slug]);
  }

  onNavigate(card: MassCardData): void {
    const lat = card.latitude;
    const lng = card.longitude;
    const url = lat && lng
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.churchName)}`;
    window.open(url, '_blank', 'noopener');
    this._analytics.getDirections(card.churchName);
  }

  onFavorite(card: MassCardData): void {
    const proximaMissaLabel = card.mass.diaSemana != null
      ? getCountdownLabel(card.mass.diaSemana, card.mass.horario)
      : undefined;
    const favorita = {
      id: card.churchId, nome: card.churchName, uf: card.uf,
      cidadeSlug: card.cidadeSlug, slug: card.slug,
      proximaMissaLabel, diaSemana: card.mass.diaSemana, horario: card.mass.horario,
    };
    localStorage.setItem('buscamissa_favorita', JSON.stringify(favorita));
    this._analytics.userContribution('confirm', card.churchName);
    this._toast.add({ severity: 'success', summary: 'Paróquia salva!', detail: `${card.churchName} foi salva como sua paróquia.` });
  }
}
