import { Component, inject, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { ChurchesService } from "../../../core/services/churches.service";
import { SeoService } from "../../../core/services/seo.service";
import { AnalyticsService } from "../../../core/services/analytics.service";
import { FavoritesService } from "../../../core/services/favorites.service";
import { MassTimeCardComponent } from "../../../shared/components/mass-time-card/mass-time-card.component";
import { MassCardData } from "../../../shared/models/mass-card.model";
import { Mass } from "../../../core/interfaces/church.interface";
import { getMissaAgoraUrgency, getCountdownLabel } from "../../../shared/utils/mass-time.utils";
import { CIDADES_POPULARES_MISSA_AGORA } from "../../../core/constants/cidades-populares";
import { GeolocationService } from "../../../core/services/geolocation.service";
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
  private _favorites = inject(FavoritesService);
  private _geo = inject(GeolocationService);

  geoStatus: GeoStatus = 'idle';
  permissaoNegadaPeloBrowser = false;
  missas: MassCardData[] = [];
  favoritasIds = new Set<number>();
  isLoading = false;
  cidadeDetectada: string | null = null;
  cidadeDetectadaUf: string | null = null;
  horaAtual = '';
  cidadesProximas: { nome: string; uf: string; slug: string }[] = [];
  private _clockInterval: any;

  // ── Busca por CEP ──
  cepBusca = '';
  isLoadingCep = false;

  // ── Busca por cidade (sugestões a partir de 3 letras) ──
  cidadeQuery = '';
  cidadeSugestoes: { nome: string; uf: string; slug: string }[] = [];
  private _todasCidades: { nome: string; uf: string; slug: string }[] | null = null;
  private _carregandoCidades = false;

  // ── Ajuda de permissão de localização (alert colapsado) ──
  mostrarAjudaGeo = false;

  // Fallback estático — substituir por métrica de acessos do banco quando existir
  readonly cidadesFallback = CIDADES_POPULARES_MISSA_AGORA;

  /** Há missas na tela (cards de busca ficam compactos, mas nunca somem) */
  get temResultados(): boolean {
    return this.geoStatus === 'found' && !this.isLoading && this.missas.length > 0;
  }

  /** 7 chips: cidades próximas reais quando há geo; senão o fallback estático */
  get cidadesExibidas() {
    const lista = this.geoStatus === 'found' && this.cidadesProximas.length
      ? this.cidadesProximas
      : this.cidadesFallback;
    return lista.slice(0, 7);
  }

  private _loadFavoritas(): void {
    this.favoritasIds = new Set(this._favorites.listar().map((f) => f.id));
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
    this._geo.reverseGeocode(lat, lng).then((addr) => {
      if (!addr) return;
      this.cidadeDetectada = addr.city || addr.town || addr.village || null;
      this.cidadeDetectadaUf = addr.state_code?.toUpperCase?.() || null;
    });
  }

  /** Busca por CEP: ViaCEP → geocodifica → mesma busca por raio de 10km / próximas 2h da geolocalização */
  buscarPorCep(): void {
    const cep = String(this.cepBusca ?? '').replace(/\D/g, '');
    if (cep.length !== 8) {
      this._toast.add({
        severity: 'warn',
        summary: 'CEP inválido',
        detail: 'Digite um CEP com 8 dígitos.',
      });
      return;
    }
    this.isLoadingCep = true;
    this.geoStatus = 'loading';
    this._analytics.searchStarted();
    fetch(`https://viacep.com.br/ws/${cep}/json/`)
      .then(r => r.json())
      .then((addr: any) => {
        if (!addr || addr.erro) {
          this._cepOuCidadeNaoEncontrada('Confira o CEP ou busque pela cidade.');
          return;
        }
        const query = encodeURIComponent(
          [addr.logradouro, addr.bairro, addr.localidade, addr.uf, 'Brazil'].filter(Boolean).join(', ')
        );
        this._geocodeEBuscar(query, addr.localidade, addr.uf, 'Confira o CEP ou busque pela cidade.');
      })
      .catch(() => this._cepOuCidadeNaoEncontrada('Não foi possível buscar o CEP.'))
      .finally(() => { this.isLoadingCep = false; });
  }

  /** Geocodifica um endereço/cidade via Nominatim e roda a mesma busca da geolocalização (raio 10km / próximas 2h) */
  private _geocodeEBuscar(query: string, cidadeNome: string, uf: string, msgFalha: string): void {
    fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=br`)
      .then(r => r.json())
      .then((arr: any[]) => {
        const hit = arr?.[0];
        if (!hit?.lat || !hit?.lon) {
          this._cepOuCidadeNaoEncontrada(msgFalha);
          return;
        }
        const lat = parseFloat(hit.lat);
        const lng = parseFloat(hit.lon);
        this.cidadeDetectada = cidadeNome;
        this.cidadeDetectadaUf = uf?.toUpperCase() || null;
        this.geoStatus = 'found';
        this.permissaoNegadaPeloBrowser = false;
        this._buscarMissas(lat, lng);
        this._loadCidadesProximas(lat, lng);
      })
      .catch(() => this._cepOuCidadeNaoEncontrada(msgFalha));
  }

  /** Mesma tela de "sem resultados" da geolocalização — sem beco sem saída */
  private _cepOuCidadeNaoEncontrada(detail: string): void {
    this.geoStatus = 'found';
    this.missas = [];
    this.isLoading = false;
    this.cidadeDetectada = null;
    this.cidadeDetectadaUf = null;
    this._toast.add({ severity: 'warn', summary: 'Local não encontrado', detail });
  }

  /** Carrega a lista de cidades só no primeiro focus do campo (não pesa o load da página).
   *  Se a lista crescer significativamente, substituir por autocomplete remoto. */
  onCidadeFocus(): void {
    if (this._todasCidades || this._carregandoCidades) return;
    this._carregandoCidades = true;
    this._church.addressRange().subscribe({
      next: ({ data }: any) => {
        this._todasCidades = Object.entries(data ?? {}).flatMap(([uf, cities]: [string, any]) =>
          Object.keys(cities).map(nome => ({ nome, uf: uf.toLowerCase(), slug: this._slugify(nome) }))
        );
        this._carregandoCidades = false;
        this.onCidadeInput();
      },
      error: () => { this._carregandoCidades = false; },
    });
  }

  /** Sugestões só a partir de 3 caracteres (estilo Google), máx. 8 */
  onCidadeInput(): void {
    const q = this._normalizar(this.cidadeQuery);
    if (q.length < 3 || !this._todasCidades) {
      this.cidadeSugestoes = [];
      return;
    }
    this.cidadeSugestoes = this._todasCidades
      .filter(c => this._normalizar(c.nome).includes(q))
      .slice(0, 8);
  }

  selecionarCidade(c: { nome: string; uf: string; slug: string }): void {
    this.cidadeQuery = '';
    this.cidadeSugestoes = [];
    this.irParaCidade(c);
  }

  private _slugify(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  private _normalizar(s: string): string {
    return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
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
    this._router.navigate(['/missas', cidade.uf.toLowerCase(), cidade.slug]);
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
      const agoraFavorita = this._favorites.alternar({
        id: card.churchId,
        nome: card.churchName,
        uf: card.uf,
        cidadeSlug: card.cidadeSlug,
        slug: card.slug,
        nomeUnico: card.nomeUnico,
        diaSemana: card.mass.diaSemana,
        horario: card.mass.horario,
      });

      // atualiza o Set reativo para que o ícone mude imediatamente
      if (agoraFavorita) {
        this.favoritasIds.add(card.churchId);
      } else {
        this.favoritasIds.delete(card.churchId);
      }
      this.favoritasIds = new Set(this.favoritasIds); // nova referência → trigger change detection

      this._analytics.favoriteParishSaved(card.churchName);
      this._toast.add({
        severity: 'success',
        summary: agoraFavorita ? 'Salvo!' : 'Removido',
        detail: agoraFavorita
          ? `${card.churchName} foi salva como favorita.`
          : `${card.churchName} foi removida.`
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
