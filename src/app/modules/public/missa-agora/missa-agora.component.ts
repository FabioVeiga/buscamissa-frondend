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
  favoritasIds = new Set<number>();
  isLoading = false;
  cidadeDetectada: string | null = null;
  horaAtual = '';
  cidadesProximas: { nome: string; uf: string; slug: string }[] = [];
  private _clockInterval: any;

  readonly cidadesFallback = [
    { nome: 'São Paulo',           uf: 'sp', slug: 'sao-paulo' },
    { nome: 'Campinas',            uf: 'sp', slug: 'campinas' },
    { nome: 'Rio de Janeiro',      uf: 'rj', slug: 'rio-de-janeiro' },
    { nome: 'Belo Horizonte',      uf: 'mg', slug: 'belo-horizonte' },
    { nome: 'Brasília',            uf: 'df', slug: 'brasilia' },
    { nome: 'Santos',              uf: 'sp', slug: 'santos' },
    { nome: 'Curitiba',            uf: 'pr', slug: 'curitiba' },
    { nome: 'São José dos Campos', uf: 'sp', slug: 'sao-jose-dos-campos' },
    { nome: 'Sorocaba',            uf: 'sp', slug: 'sorocaba' },
  ];

  get cidadesExibidas() {
    return this.geoStatus === 'found' && this.cidadesProximas.length
      ? this.cidadesProximas
      : this.cidadesFallback;
  }

  private _loadFavoritas(): void {
    try {
      const arr = JSON.parse(localStorage.getItem('buscamissa_favoritas') || '[]');
      this.favoritasIds = new Set(Array.isArray(arr) ? arr.map((f: any) => f.id) : []);
    } catch { this.favoritasIds = new Set(); }
  }

  ngOnInit(): void {
    this._loadFavoritas();
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
        this._loadCidadesProximas(pos.coords.latitude, pos.coords.longitude);
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

  onCardClick(card: MassCardData): void {
    this._analytics.missaAgoraCardClicked(card.churchName);
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

  ehFavorita(churchId: number): boolean {
    return this.favoritasIds.has(churchId);
  }

  onFavorite(card: MassCardData): void {
    try {
      const raw = localStorage.getItem('buscamissa_favoritas');
      let favoritas = Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw!) : [];

      const jaExiste = favoritas.some((f: any) => f.id === card.churchId);

      if (jaExiste) {
        favoritas = favoritas.filter((f: any) => f.id !== card.churchId);
      } else {
        const novaFavorita = {
          id: card.churchId,
          nome: card.churchName,
          uf: card.uf,
          cidadeSlug: card.cidadeSlug,
          slug: card.slug,
          diaSemana: card.mass.diaSemana,
          horario: card.mass.horario,
        };
        favoritas.push(novaFavorita);
      }

      localStorage.setItem('buscamissa_favoritas', JSON.stringify(favoritas));
      // atualiza o Set reativo para que o ícone mude imediatamente
      if (jaExiste) {
        this.favoritasIds.delete(card.churchId);
      } else {
        this.favoritasIds.add(card.churchId);
      }
      this.favoritasIds = new Set(this.favoritasIds); // nova referência → trigger change detection

      this._analytics.favoriteParishSaved(card.churchName);
      this._toast.add({
        severity: 'success',
        summary: jaExiste ? 'Removido' : 'Salvo!',
        detail: jaExiste
          ? `${card.churchName} foi removida.`
          : `${card.churchName} foi salva como favorita.`
      });
    } catch (e) {
      this._toast.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível salvar.' });
    }
  }

  private _loadCidadesProximas(lat: number, lng: number): void {
    this._church.cidadesProximas(lat, lng).subscribe({
      next: (res: any) => {
        const items: any[] = res?.data ?? res ?? [];
        const cidadesMapa = new Map<string, any>();
        items.forEach((item: any) => {
          const key = `${item.uf}_${item.cidadeSlug}`;
          if (!cidadesMapa.has(key)) {
            cidadesMapa.set(key, {
              nome: item.localidade || item.nome,
              uf: item.uf?.toUpperCase(),
              slug: item.cidadeSlug
            });
          }
        });
        const cidades = Array.from(cidadesMapa.values()).slice(0, 8);
        if (cidades.length) {
          this.cidadesProximas = cidades;
        }
      },
      error: () => { /* silencioso — mantém fallback */ }
    });
  }
}
