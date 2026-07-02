import { Component, inject } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import {
  FormControl,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormBuilder,
} from "@angular/forms";
import { ChurchesService } from "../../../core/services/churches.service";
import { MessageService } from "primeng/api";
import { WEEK_DAYS } from "../../../core/constants/weekdays";
import { PrimeNgModule } from "../../../shared/primeng.module";
import {
  Church,
  FilterSearchChurch,
  Mass,
} from "../../../core/interfaces/church.interface";
import { HttpErrorResponse } from "@angular/common/http";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { ShareButtons } from "ngx-sharebuttons/buttons";
import { STATES } from "../../../core/constants/states";
import { MassTimeCardComponent } from "../../../shared/components/mass-time-card/mass-time-card.component";
import { ChurchResultCardComponent } from "../../../shared/components/church-result-card/church-result-card.component";
import { CityMapComponent } from "../../../shared/components/city-map/city-map.component";
import { MassCardData } from "../../../shared/models/mass-card.model";
import { getMissaAgoraUrgency, getCountdownLabel, getNextOccurrenceMinutes, formatMassTime } from "../../../shared/utils/mass-time.utils";
import { AnalyticsService } from "../../../core/services/analytics.service";
import { RedesSociaisService, TipoRedeSocial } from "../../../core/services/redes-sociais.service";
import { getSocialIconFromTipos } from "../../../shared/utils/social-icon.utils";

interface AddressData {
  [uf: string]: {
    [city: string]: string[];
  };
}

@Component({
  selector: "app-home",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PrimeNgModule,
    RouterModule,
    ShareButtons,
    MassTimeCardComponent,
    ChurchResultCardComponent,
    CityMapComponent,
  ],
  providers: [MessageService, DatePipe],
  templateUrl: "./home.component.html",
  styleUrls: ["./home.component.scss"],
})
export class HomeComponent {
  private _churchService = inject(ChurchesService);
  private _toast = inject(MessageService);
  private _datePipe = inject(DatePipe);
  private _fb = inject(FormBuilder);
  public _router = inject(Router);
  private _route = inject(ActivatedRoute);
  private _analytics = inject(AnalyticsService);
  private _redesSociais = inject(RedesSociaisService);
  tiposRedeSocial: TipoRedeSocial[] = [];

  /** Status da geolocalização */
  geoStatus: 'idle' | 'loading' | 'found' | 'denied' | 'error' = 'idle';

  /** Cidade detectada por geoloc */
  cidadeDetectada: { nome: string; uf: string; slug: string } | null = null;

  /** Cidades vizinhas (por geoloc) */
  cidadesGrid: { nome: string; uf: string; slug: string }[] = [];

  /** Cidades populares — exibidas quando sem geoloc */
  readonly cidadesFallback = [
    { nome: 'São Paulo',           uf: 'SP', slug: 'sao-paulo' },
    { nome: 'Campinas',            uf: 'SP', slug: 'campinas' },
    { nome: 'São José dos Campos', uf: 'SP', slug: 'sao-jose-dos-campos' },
    { nome: 'Ribeirão Preto',      uf: 'SP', slug: 'ribeirao-preto' },
    { nome: 'Santos',              uf: 'SP', slug: 'santos' },
    { nome: 'Sorocaba',            uf: 'SP', slug: 'sorocaba' },
    { nome: 'Curitiba',            uf: 'PR', slug: 'curitiba' },
    { nome: 'Brasília',            uf: 'DF', slug: 'brasilia' },
    { nome: 'Belo Horizonte',      uf: 'MG', slug: 'belo-horizonte' },
  ];

  get cidadesExibidas() {
    return this.geoStatus === 'found' && this.cidadesGrid.length
      ? this.cidadesGrid
      : this.cidadesFallback;
  }

  get tituloCidades() {
    return this.geoStatus === 'found' && this.cidadeDetectada
      ? 'Cidades próximas de você'
      : 'Missas por cidade';
  }

  get urgencyBadgeText(): string | null {
    if (this.isLoadingProximas || this.geoStatus !== 'found') return null;
    const cards = this.proximasMissasCards;
    if (cards.length === 0) return null;
    const mins = getNextOccurrenceMinutes(
      cards[0].mass.diaSemana!,
      cards[0].mass.horario
    );
    if (mins <= 90) return `🟢 Próxima missa em ${mins} min`;
    return '📍 Missas encontradas perto de você';
  }

  get missasDeHojeHorarios(): string[] {
    const hoje = new Date().getDay();
    return [...new Set(
      this.proximasMissasCards
        .filter(c => c.mass.diaSemana === hoje)
        .map(c => formatMassTime(c.mass.horario))
    )].slice(0, 8);
  }

  /** ── Filtros rápidos (chips do hero) ── */
  quickFilter: 'perto' | 'hoje' | 'amanha' | 'fds' | 'manha' | 'tarde' | 'noite' | null = null;

  setQuickFilter(f: typeof this.quickFilter): void {
    if (f === 'perto') {
      this._requestGeolocation();
      this.quickFilter = 'perto';
      return;
    }
    if (!this.chipsHabilitados) return;
    this.quickFilter = this.quickFilter === f ? null : f;
  }

  /** Há conteúdo para os chips de dia/horário filtrarem? (missas próximas carregadas ou resultados de busca) */
  get chipsHabilitados(): boolean {
    return this.proximasMissasCards.length > 0 || this.churchInfo.length > 0;
  }

  readonly chipsTooltip = 'Busque uma cidade ou ative "Perto de mim" para filtrar por horário';

  private _aplicarQuickFilterCards(cards: MassCardData[]): MassCardData[] {
    const hoje = new Date().getDay();
    const amanha = (hoje + 1) % 7;
    const hora = (c: MassCardData) => parseInt((c.mass.horario || '0').split(':')[0], 10);

    switch (this.quickFilter) {
      case 'hoje':  return cards.filter(c => c.mass.diaSemana === hoje);
      case 'amanha': return cards.filter(c => c.mass.diaSemana === amanha);
      case 'fds':   return cards.filter(c => c.mass.diaSemana === 0 || c.mass.diaSemana === 6);
      case 'manha': return cards.filter(c => hora(c) < 12);
      case 'tarde': return cards.filter(c => hora(c) >= 12 && hora(c) < 18);
      case 'noite': return cards.filter(c => hora(c) >= 18);
      default:      return cards;
    }
  }

  get proximasFiltradas(): MassCardData[] {
    return this._aplicarQuickFilterCards(this.proximasMissasCards);
  }

  private _aplicarQuickFilterChurches(igrejas: Church[]): Church[] {
    if (!this.quickFilter) return igrejas;

    const hoje = new Date().getDay();
    const amanha = (hoje + 1) % 7;
    const hora = (horario: string) => parseInt((horario || '0').split(':')[0], 10);

    return igrejas.filter(church => {
      const missas = church.missas ?? [];
      if (!missas.length) return false;

      switch (this.quickFilter) {
        case 'hoje':  return missas.some(m => m.diaSemana === hoje);
        case 'amanha': return missas.some(m => m.diaSemana === amanha);
        case 'fds':   return missas.some(m => m.diaSemana === 0 || m.diaSemana === 6);
        case 'manha': return missas.some(m => hora(m.horario) < 12);
        case 'tarde': return missas.some(m => {
          const h = hora(m.horario);
          return h >= 12 && h < 18;
        });
        case 'noite': return missas.some(m => hora(m.horario) >= 18);
        default:      return true;
      }
    });
  }

  get churchInfoFiltrado(): Church[] {
    return this._aplicarQuickFilterChurches(this.churchInfo);
  }

  private _ordenarIgrejas(lista: Church[]): Church[] {
    const copia = [...lista];
    switch (this.ordenacaoResultados) {
      case 'az':
        return copia.sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'));
      case 'za':
        return copia.sort((a, b) => (b.nome ?? '').localeCompare(a.nome ?? '', 'pt-BR'));
      case 'proxima-missa':
        return copia.sort((a, b) => this._minProximaMissaHome(a) - this._minProximaMissaHome(b));
      case 'proximidade':
        if (this._userLat === null || this._userLng === null) return copia;
        return copia.sort((a, b) => {
          const dA = this._distHome(a) ?? Infinity;
          const dB = this._distHome(b) ?? Infinity;
          return dA - dB;
        });
      default:
        return copia;
    }
  }

  get churchInfoOrdenaFiltrado(): Church[] {
    return this._ordenarIgrejas(this.churchInfoFiltrado);
  }

  get totalRecordsFiltrado(): number {
    return this.quickFilter ? this.churchInfoFiltrado.length : this.totalRecords;
  }

  /** Igrejas para o mapa lateral (a partir das próximas missas) */
  get mapChurches(): { id: number; nome: string; lat: number | null; lng: number | null }[] {
    return this.proximasMissasCards.map(c => ({
      id: c.churchId,
      nome: c.churchName,
      lat: c.latitude ?? null,
      lng: c.longitude ?? null,
    }));
  }

  get temMapaComCoords(): boolean {
    return this.mapChurches.some(m => m.lat != null && m.lng != null);
  }

  /** Cards de próximas missas */
  proximasMissasCards: MassCardData[] = [];
  isLoadingProximas = false;
  tituloProximasMissas = 'Missas acontecendo hoje';

  // Sprint 3B — Minhas Paróquias (múltiplas)
  paroquiasFavoritas: Array<{
    id: number; nome: string; uf: string; cidadeSlug: string; slug: string;
    proximaMissaLabel?: string; diaSemana?: number; horario?: string;
  }> = [];

  /** Flag loading do CTA */
  isLoadingGeoNav = false;

  /** Ordenação dos resultados da busca */
  ordenacaoResultados: 'az' | 'za' | 'proximidade' | 'proxima-missa' = 'az';

  /** Coords do usuário (preenchidas após geoloc) */
  private _userLat: number | null = null;
  private _userLng: number | null = null;

  public isLoading = false;
  public isLoadingAddress = false;
  public isLoadingCities = false;
  public isLoadingDistricts = false;
  public showNoChurchCard = false;

  public totalRecords: any;

  public churchInfo: Church[] = [];
  public weakDays = WEEK_DAYS;

  public statesList: { label: string; value: string }[] = [];
  public citiesList: { label: string; value: string }[] = [];
  public districtsList: { label: string; value: string }[] = [];

  public selectedState: string = "";
  public selectedCity: string = "";
  public selectedDistrict: string = "";

  public fullAddressData: AddressData = {};

  totalItems: number = 0;
  pageSize: number = 10;
  pageIndex: number = 1;

  public form!: FormGroup;

  /** True quando renderizado na rota /buscar (só busca + resultados) */
  resultsMode = false;

  /** ── Busca em abas (redesign) ── */
  searchTab: 'cidade' | 'local' = 'cidade';
  /** Dia/Horário escondidos por padrão na aba cidade */
  mostrarMaisFiltros = false;
  /** Loading do botão da aba "perto de mim" (GPS ou CEP) */
  isLoadingCep = false;
  /** Raio (km) da busca por localização */
  raioCep = 5;

  /** Estatísticas (números reais via getInfo, com fallback) */
  stats = { igrejas: 2000, horarios: 9100, cidades: 213, estados: 26 };

  setSearchTab(tab: 'cidade' | 'local'): void {
    if (this.searchTab === tab) return;
    this.searchTab = tab;
    this._router.navigate([], { queryParams: {}, replaceUrl: true });
    this.churchInfo = [];
    this.showNoChurchCard = false;
  }

  /** Formata número com separador de milhar pt-BR (ex.: 2000 → "2.000") */
  fmt(n: number): string {
    return (n ?? 0).toLocaleString('pt-BR');
  }

  toggleMaisFiltros(): void {
    this.mostrarMaisFiltros = !this.mostrarMaisFiltros;
  }

  /** Botão "Usar minha localização" (aba localização) */
  usarMinhaLocalizacao(): void {
    this._analytics.searchStarted();
    this._requestGeolocation();
    setTimeout(() => this._scrollToProximas(), 600);
  }

  /** Busca por CEP → geocodifica e lista missas por distância */
  onCepSearch(): void {
    const cepRaw = String(this.form.get('Cep')?.value ?? '').replace(/\D/g, '');
    if (cepRaw.length !== 8) {
      this._toast.add({
        severity: 'warn',
        summary: 'CEP inválido',
        detail: 'Digite um CEP com 8 dígitos.',
      });
      return;
    }
    this.isLoadingCep = true;
    this._analytics.searchStarted();
    this._geocodeCep(cepRaw);
  }

  /** Reexecuta a busca com novo raio (chips 2/5/10 km) */
  setRaioCep(km: number): void {
    this.raioCep = km;
    if (this._userLat != null && this._userLng != null) {
      this._loadProximasMissas(this._userLat, this._userLng, km);
      this._loadCidadesProximas(this._userLat, this._userLng);
    }
  }

  private _geocodeCep(cep: string): void {
    // ViaCEP → obtém cidade/UF; a busca acontece em /buscar (URL própria,
    // com histórico — o "Voltar" do browser e o link p/ home funcionam)
    fetch(`https://viacep.com.br/ws/${cep}/json/`)
      .then(r => r.json())
      .then((addr: any) => {
        this.isLoadingCep = false;
        if (!addr || addr.erro) { this._cepNaoEncontrado(); return; }

        this._router.navigate(['/buscar'], {
          queryParams: { uf: addr.uf, cidade: addr.localidade, cep, pagina: 1 },
        });
      })
      .catch(() => this._cepNaoEncontrado());
  }

  /** Geocodifica o CEP apenas para ordenar os resultados por proximidade (fire-and-forget) */
  private _ordenarPorProximidadeDoCep(cep: string): void {
    fetch(`https://viacep.com.br/ws/${cep}/json/`)
      .then(r => r.json())
      .then((addr: any) => {
        if (!addr || addr.erro) return;
        const query = encodeURIComponent(
          [addr.logradouro, addr.bairro, addr.localidade, addr.uf, 'Brazil'].filter(Boolean).join(', ')
        );
        return fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=br`)
          .then(r => r.json())
          .then((arr: any[]) => {
            const hit = arr?.[0];
            if (hit?.lat && hit?.lon) {
              this._userLat = parseFloat(hit.lat);
              this._userLng = parseFloat(hit.lon);
              this.ordenacaoResultados = 'proximidade';
            }
          });
      })
      .catch(() => {});
  }

  private _cepNaoEncontrado(): void {
    this.isLoadingCep = false;
    this._toast.add({
      severity: 'warn',
      summary: 'CEP não encontrado',
      detail: 'Não encontramos igrejas para este CEP. Tente buscar por cidade.',
    });
  }

  private _scrollToProximas(): void {
    document.getElementById('proximas-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ngOnInit(): void {
    this._redesSociais.obterTipos().subscribe((tipos) => (this.tiposRedeSocial = tipos));
    this.resultsMode = !!this._route.snapshot.data['resultsMode'];

    this.form = this._fb.group({
      Uf: [null, Validators.required],
      Localidade: [null],
      Bairro: [null],
      DiaDaSemana: [null],
      Horario: [null],
      HorarioFim: [null],
      Cep: [null],
    });
    // Na página de resultados a aba "cidade" é a mais útil (filtros visíveis)
    // aba padrão sempre "cidade" (inclusive em resultsMode)
    this.searchTab = 'cidade';
    this.getAddress();
    this._loadFavorita();
    this._loadStats();

    // Limpa resultados quando o usuário navega para home sem filtros (ex: clique no logo).
    // Usa a key 'uf' (minúscula) — a mesma gravada por searchFilter — senão o form
    // seria resetado a cada busca/paginação, deixando-o inválido e travando a paginação.
    this._route.queryParams.subscribe(params => {
      if (!params['uf']) {
        this.churchInfo = [];
        this.showNoChurchCard = false;
        this.form.reset();
      }
    });
  }

  setDefaultTimeIfNull() {
    const current = this.form.get("Horario")?.value;
    const d = current ? new Date(current) : new Date();
    const snapped = Math.round(d.getMinutes() / 15) * 15;
    d.setMinutes(snapped % 60, 0, 0);
    if (snapped === 60) d.setHours(d.getHours() + 1);
    this.form.get("Horario")?.setValue(d);
  }

  public getAddress(): void {
    this.isLoadingAddress = true;

    this._churchService.addressRange().subscribe({
      next: ({ data }: { data: AddressData }) => {
        this.fullAddressData = data;
        this.statesList = Object.keys(data).map((sigla) => {
          const estado = STATES.find((s) => s.sigla === sigla);
          return {
            label: estado?.nome || sigla,
            value: sigla,
          };
        }).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
      },
      error: () => {
        this._toast.add({
          severity: "error",
          summary: "Erro ao carregar dados",
          detail: "Não foi possível carregar as cidades e bairros.",
        });
      },
      complete: () => {
        this.isLoadingAddress = false;
        this._restoreFromQueryParams();
        if (!this.resultsMode) {
          this._loadProximasMissas();
          this._requestGeolocation();
        }
      },
    });
  }

  private _requestGeolocation(): void {
    if (!navigator.geolocation) return;
    this.geoStatus = 'loading';
    navigator.geolocation.getCurrentPosition(
      pos => {
        this._userLat = pos.coords.latitude;
        this._userLng = pos.coords.longitude;
        this._reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        this.tituloProximasMissas = 'Próximas missas perto de você';
        this._loadProximasMissas(pos.coords.latitude, pos.coords.longitude);
        this._loadCidadesProximas(pos.coords.latitude, pos.coords.longitude);
        this.geoStatus = 'found';
      },
      () => { this.geoStatus = 'denied'; }
    );
  }

  private _loadStats(): void {
    this._churchService.getInfo().subscribe({
      next: (res: any) => {
        const d = res?.data ?? res ?? {};
        const igrejas = d.quantidadesIgrejas ?? d.quantidadeIgrejas ?? d.totalIgrejas;
        const horarios = d.quantidadeMissas ?? d.quantidadesMissas ?? d.totalMissas;
        if (igrejas) this.stats.igrejas = igrejas;
        if (horarios) this.stats.horarios = horarios;
      },
      error: () => { /* silencioso — mantém fallback */ },
    });
  }

  private _loadProximasMissas(lat?: number | null, lng?: number | null, raioKm = 10): void {
    this._churchService.proximasMissas(lat, lng, raioKm).subscribe({
      next: (res: any) => {
        const items: any[] = res?.data ?? res ?? [];
        this.proximasMissasCards = items.slice(0, 5).map((item: any) => ({
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
      error: () => { /* silencioso — seção simplesmente não aparece */ },
    });
  }

  getUrgency(card: MassCardData) {
    if (card.mass.diaSemana == null) return null;
    return getMissaAgoraUrgency(card.mass.diaSemana, card.mass.horario);
  }

  /** CTA "Encontrar missas perto de mim" */
  encontrarMissasPerto(): void {
    if (this.cidadeDetectada) {
      this._router.navigate(['/missas', this.cidadeDetectada.uf.toLowerCase(), this.cidadeDetectada.slug]);
      return;
    }
    if (!navigator.geolocation) return;
    this.isLoadingGeoNav = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        this._userLat = pos.coords.latitude;
        this._userLng = pos.coords.longitude;
        this._reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        // Aguarda a cidade ser detectada (máx 5s) depois navega
        const wait = setInterval(() => {
          if (this.cidadeDetectada) {
            clearInterval(wait);
            this.isLoadingGeoNav = false;
            this._router.navigate(['/missas', this.cidadeDetectada.uf.toLowerCase(), this.cidadeDetectada.slug]);
          }
        }, 200);
        setTimeout(() => { clearInterval(wait); this.isLoadingGeoNav = false; }, 5000);
      },
      () => { this.isLoadingGeoNav = false; }
    );
  }

  // Sprint 3B — Minhas Paróquias (localStorage)

  /** Verifica se uma igreja é favorita */
  ehFavorita(churchId: number): boolean {
    return this.paroquiasFavoritas.some(f => f.id === churchId);
  }

  /** Retorna urgência de um favorito específico */
  getUrgenciaFavorita(fav: any): 'hot' | 'soon' | null {
    if (!fav || fav.diaSemana == null || !fav.horario) return null;
    const mins = getNextOccurrenceMinutes(fav.diaSemana, fav.horario);
    if (mins <= 180) return 'hot';
    if (new Date().getDay() === fav.diaSemana) return 'soon';
    return null;
  }

  /** Label da próxima missa para um favorito */
  getProximaLabelFavorita(fav: any): string {
    if (!fav || fav.diaSemana == null || !fav.horario) return '';
    return getCountdownLabel(fav.diaSemana, fav.horario);
  }

  onCtaClick(): void {
    this._analytics.searchStarted();
  }

  onCardClick(card: MassCardData): void {
    this._analytics.resultClicked(card.churchName, card.cidadeSlug, card.uf);
  }

  onResultCardClick(church: any): void {
    this._analytics.resultClicked(
      church?.nome,
      church?.endereco?.localidade ?? "",
      church?.endereco?.uf ?? ""
    );
  }

  onNavigateClick(card: MassCardData): void {
    const lat = card.latitude;
    const lng = card.longitude;
    const url = lat && lng
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.churchName)}`;
    window.open(url, '_blank', 'noopener');
    this._analytics.getDirections(card.churchName);
  }

  onFavoriteClick(card: MassCardData): void {
    if (this.ehFavorita(card.churchId)) {
      this.removerFavorita(card.churchId);
    } else {
      this.adicionarFavorita(card);
    }
  }

  private adicionarFavorita(card: MassCardData): void {
    const novaFavorita = {
      id: card.churchId,
      nome: card.churchName,
      uf: card.uf,
      cidadeSlug: card.cidadeSlug,
      slug: card.slug,
      diaSemana: card.mass.diaSemana,
      horario: card.mass.horario,
    };
    this.paroquiasFavoritas = [...this.paroquiasFavoritas, novaFavorita];
    this._salvarFavoritas();
    this._analytics.favoriteParishSaved(card.churchName);
  }

  removerFavorita(churchId: number, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.paroquiasFavoritas = this.paroquiasFavoritas.filter(f => f.id !== churchId);
    this._salvarFavoritas();
  }

  private _salvarFavoritas(): void {
    localStorage.setItem('buscamissa_favoritas', JSON.stringify(this.paroquiasFavoritas));
  }

  private _loadFavorita(): void {
    const raw = localStorage.getItem('buscamissa_favoritas');
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        this.paroquiasFavoritas = saved.map((f: any) => ({
          ...f,
          proximaMissaLabel: f.diaSemana != null && f.horario ? getCountdownLabel(f.diaSemana, f.horario) : undefined,
        }));
      }
    } catch { /* ignora JSON inválido */ }
  }

  private _reverseGeocode(lat: number, lng: number): void {
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`)
      .then(r => r.json())
      .then((data: any) => {
        const addr = data.address ?? {};
        const nomeCidade = addr.city || addr.town || addr.village || addr.municipality || '';
        const nomeEstado = addr.state || '';
        const estado = STATES.find(s =>
          this._norm(nomeEstado).includes(this._norm(s.nome)) ||
          this._norm(s.nome).includes(this._norm(nomeEstado))
        );
        if (!estado || !nomeCidade) { this.geoStatus = 'error'; return; }

        const uf = estado.sigla;
        const cidadesDoEstado = this.fullAddressData[uf] ? Object.keys(this.fullAddressData[uf]) : [];
        const match = cidadesDoEstado.find(c => this._norm(c) === this._norm(nomeCidade));

        if (!match) { this.geoStatus = 'error'; return; }

        const slug = this._slugify(match);
        this.cidadeDetectada = { nome: match, uf, slug };

        const outras = cidadesDoEstado
          .filter(c => this._norm(c) !== this._norm(match))
          .slice(0, 7)
          .map(c => ({ nome: c, uf, slug: this._slugify(c) }));

        this.cidadesGrid = [{ nome: match, uf, slug }, ...outras];
        this.geoStatus = 'found';
      })
      .catch(() => { this.geoStatus = 'error'; });
  }

  private _loadCidadesProximas(lat: number, lng: number): void {
    this._churchService.cidadesProximas(lat, lng).subscribe({
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
          this.cidadesGrid = cidades;
        }
      },
      error: () => { /* silencioso — mantém fallback */ }
    });
  }

  private _norm(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  private _slugify(s: string): string {
    return this._norm(s).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  private _restoreFromQueryParams(): void {
    const p = this._route.snapshot.queryParams;
    if (!p['uf']) return;

    // Restaura UF e popula cidades
    this.form.get('Uf')?.setValue(p['uf']);
    this.onStateChange({ value: p['uf'] });

    if (p['cidade']) {
      this.form.get('Localidade')?.setValue(p['cidade']);
      this.onCityChange({ value: p['cidade'] });
    }

    if (p['bairro']) this.form.get('Bairro')?.setValue(p['bairro']);
    if (p['dia'] != null) this.form.get('DiaDaSemana')?.setValue(Number(p['dia']));
    if (p['horario']) {
      const [h, m] = p['horario'].split(':').map(Number);
      const t = new Date();
      t.setHours(h, m, 0, 0);
      this.form.get('Horario')?.setValue(t);
    }
    if (p['horarioFim']) {
      const [h2, m2] = p['horarioFim'].split(':').map(Number);
      const t2 = new Date();
      t2.setHours(h2, m2, 0, 0);
      this.form.get('HorarioFim')?.setValue(t2);
    }
    if (p['pagina']) this.pageIndex = Number(p['pagina']);

    // Busca veio do CEP: abre a aba de CEP com o valor preenchido (continuidade),
    // preserva o param na URL e ordena por proximidade
    if (p['cep']) {
      this.searchTab = 'local';
      this.form.get('Cep')?.setValue(p['cep']);
      this._ordenarPorProximidadeDoCep(String(p['cep']));
    }

    this.searchFilter(false);
  }

  public onStateChange(event: any): void {
    this.selectedState = event.value;
    if (this.selectedState) {
      const cities = Object.keys(this.fullAddressData[this.selectedState]);
      this.citiesList = cities.map((city) => ({
        label: city,
        value: city,
      })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    } else {
      this.citiesList = [];
    }
    this.districtsList = [];
    this.selectedCity = "";
    this.form.get('Localidade')?.setValue(null);
    this.form.get('Bairro')?.setValue(null);
  }

  public onCityChange(event: any): void {
    this.selectedCity = event.value;
    if (this.selectedState && this.selectedCity) {
      const districts =
        this.fullAddressData[this.selectedState][this.selectedCity];
      this.districtsList = districts.map((district) => ({
        label: district,
        value: district,
      })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    } else {
      this.districtsList = [];
    }
    this.form.get('Bairro')?.setValue(null);
  }

  /** Extrai valores de filtro do formulário para query params */
  private _buildFilterQueryParams(): {
    uf: string | null;
    cidade: string | null;
    bairro: string | null;
    dia: number | null;
    horario: string | null;
    horarioFim: string | null;
    cep: string | null;
  } {
    const uf = this.form.get("Uf")?.value;
    const localidade = this.form.get("Localidade")?.value;
    const bairro = this.form.get("Bairro")?.value;
    const diaDaSemana = this.form.get("DiaDaSemana")?.value;
    const horarioRaw = this.form.value.Horario;
    const horario = horarioRaw ? (typeof horarioRaw === 'string' ? horarioRaw : this._datePipe.transform(horarioRaw, 'HH:mm')) : null;
    const horarioFimRaw = this.form.value.HorarioFim;
    const horarioFim = horarioFimRaw ? (typeof horarioFimRaw === 'string' ? horarioFimRaw : this._datePipe.transform(horarioFimRaw, 'HH:mm')) : null;
    const cepRaw = String(this.form.get('Cep')?.value ?? '').replace(/\D/g, '');

    return {
      uf: uf ?? null,
      cidade: localidade ?? null,
      bairro: bairro ?? null,
      dia: diaDaSemana ?? null,
      horario: horario ?? null,
      horarioFim: horarioFim ?? null,
      cep: cepRaw.length === 8 ? cepRaw : null,
    };
  }

  /** Clique no botão "Buscar": na home navega p/ /buscar; em /buscar refaz inline */
  public onBuscarClick(): void {
    if (this.form.invalid) return;
    if (this.resultsMode) {
      this.searchFilter();
    } else {
      this.submitBusca();
    }
  }

  /** Navega para a página de resultados com os filtros como query params */
  public submitBusca(): void {
    const params = this._buildFilterQueryParams();
    this._router.navigate(['/buscar'], {
      queryParams: { ...params, pagina: 1 },
    });
  }

  public searchFilter(resetPage = true): void {
    if (this.isLoading || this.form.invalid) return;

    if (resetPage) this.pageIndex = 1;

    this.isLoading = true;
    this.churchInfo = [];

    const params = this._buildFilterQueryParams();

    this._router.navigate([], {
      queryParams: { ...params, pagina: this.pageIndex },
      replaceUrl: true,
    });

    const filters: FilterSearchChurch = {
      Uf: params.uf!,
      Localidade: params.cidade || undefined,
      Bairro: params.bairro || undefined,
      DiaDaSemana: params.dia || undefined,
      Horario: params.horario || undefined,
      HorarioFim: params.horarioFim || undefined,
      "Paginacao.PageIndex": this.pageIndex,
      "Paginacao.PageSize": this.pageSize,
    };

    this._churchService.searchByFilters(filters).subscribe({
      next: (data: any) => {
        this.churchInfo = data.data.items;
        this.totalRecords = data.data.totalItems;
        this.isLoading = false;

        if (!this.churchInfo.length) {
          this._toast.add({
            severity: "warn",
            summary: "Nenhuma igreja encontrada",
            detail: "Não encontramos igrejas para os filtros aplicados.",
          });
          this.showNoChurchCard = true;
        } else {
          this.showNoChurchCard = false;
        }
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading = false;
        if (err.error.status === 404) {
          this._toast.add({
            severity: "warn",
            summary: "Nenhuma igreja encontrada",
            detail: "Não encontramos igrejas para os filtros aplicados.",
          });
          this.showNoChurchCard = true;
        } else {
          this._toast.add({
            severity: "error",
            summary: "Erro na busca",
            detail: "Não foi possível buscar igrejas.",
          });
          this.showNoChurchCard = false;
        }
      },
      complete: () => {
        this.isLoading = false; // Marca o final do carregamento
      },
    });
  }

  setOrdenacaoResultados(o: 'az' | 'za' | 'proximidade' | 'proxima-missa'): void {
    this.ordenacaoResultados = o;
  }

  get churchInfoOrdenada(): any[] {
    const lista = [...this.churchInfo];
    switch (this.ordenacaoResultados) {
      case 'az':
        return lista.sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'));
      case 'za':
        return lista.sort((a, b) => (b.nome ?? '').localeCompare(a.nome ?? '', 'pt-BR'));
      case 'proxima-missa':
        return lista.sort((a, b) => this._minProximaMissaHome(a) - this._minProximaMissaHome(b));
      case 'proximidade':
        if (this._userLat === null || this._userLng === null) return lista;
        return lista.sort((a, b) => {
          const dA = this._distHome(a) ?? Infinity;
          const dB = this._distHome(b) ?? Infinity;
          return dA - dB;
        });
      default:
        return lista;
    }
  }

  private _minProximaMissaHome(church: any): number {
    const missas: any[] = church.missas ?? [];
    if (!missas.length) return Infinity;
    return Math.min(...missas.map((m: any) => getMissaAgoraUrgency != null
      ? this._nextMinutes(m.diaSemana, m.horario)
      : Infinity));
  }

  private _nextMinutes(diaSemana: number, horario: string): number {
    const agora = new Date();
    const [h, min] = (horario ?? '00:00').split(':').map(Number);
    const diasAte = ((diaSemana - agora.getDay()) + 7) % 7;
    const alvo = new Date(agora);
    alvo.setDate(agora.getDate() + diasAte);
    alvo.setHours(h, min, 0, 0);
    if (diasAte === 0 && alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 7);
    return Math.round((alvo.getTime() - agora.getTime()) / 60_000);
  }

  private _distHome(church: any): number | null {
    if (this._userLat === null || this._userLng === null) return null;
    const lat2 = church.endereco?.latitude;
    const lng2 = church.endereco?.longitude;
    if (!lat2 || !lng2) return null;
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - this._userLat!);
    const dLng = toRad(lng2 - this._userLng!);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(this._userLat!)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  get temGeolocalizacao(): boolean {
    return this._userLat !== null && this._userLng !== null;
  }

  /** Geolocalização exposta para o card de resultado (distância). */
  get geoLat(): number | null { return this._userLat; }
  get geoLng(): number | null { return this._userLng; }

  onPageChange(event: any) {
    this.pageIndex = Math.floor(event.first / event.rows) + 1;
    this.pageSize = event.rows;
    this.searchFilter(false);
  }

  clearFilter() {
    this.form.reset();
    this.churchInfo = [];
    this.showNoChurchCard = false;
    this.ordenacaoResultados = 'az';
    this._router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  editChurch(church: Church) {
    // Receba o objeto da igreja
    // Redireciona para a página de edição com o CPF da igreja
    this._router.navigate(["/editar", church.id]);
  }

  // Converte dia da semana de número para nome
  getDayName(dia: number): string {
    const daysOfWeek = [
      "Domingo",
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
    ];
    return daysOfWeek[dia] || "Desconhecido";
  }

  getFormattedMasses(
    missas: Mass[]
  ): { horario: string; observacao: string }[] {
    const daysOfWeek = [
      "Domingo",
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
    ];
  
    const groupedMasses: { [key: number]: Mass[] } = {};
    missas.forEach((missa) => {
      if (missa.diaSemana !== undefined) {
        if (!groupedMasses[missa.diaSemana]) {
          groupedMasses[missa.diaSemana] = [];
        }
        groupedMasses[missa.diaSemana].push(missa);
      }
    });
  
    const formattedMasses: { horario: string; observacao: string }[] = [];
    for (const dayIndex in groupedMasses) {
      if (groupedMasses.hasOwnProperty(dayIndex)) {
        const day = daysOfWeek[parseInt(dayIndex, 10)];
        const massesOnDay = groupedMasses[dayIndex];
  
        const times = massesOnDay
          .map((missa) => this.formatTime(missa.horario))
          .sort((a, b) => {
            // Ordena por hora real
            const [h1, m1] = a.split(":").map(Number);
            const [h2, m2] = b.split(":").map(Number);
            return h1 - h2 || m1 - m2;
          });
  
        const horarioFormatado = `${day}: ${times.join(", ")}`;
  
        const observacao = massesOnDay[0]?.observacao || "Sem observação";
  
        formattedMasses.push({
          horario: horarioFormatado,
          observacao: observacao,
        });
      }
    }
  
    return formattedMasses;
  }
  

  formatTime(timeString: string): string {
    const [hours, minutes] = timeString.split(":");
    return `${parseInt(hours, 10)}:${minutes}`;
  }

  getSocialIcon(url: string): string {
    return getSocialIconFromTipos(url, this.tiposRedeSocial);
  }

  // Usa a URL canônica nova se houver slug+cidade; senão cai no legado /igrejas
  linkParoquia(church: any): string[] {
    const uf = church?.endereco?.uf;
    const cidadeSlug = church?.endereco?.cidadeSlug;
    if (uf && cidadeSlug && church?.slug) {
      return ["/paroquia", uf.toLowerCase(), cidadeSlug, church.slug];
    }
    return ["/igrejas", church?.nomeUnico];
  }

  /** URL completa para compartilhamento (SEO3 revisado) */
  shareUrlChurch(church: any): string {
    const base = 'https://buscamissa.com.br';
    const uf = church?.endereco?.uf;
    const cidadeSlug = church?.endereco?.cidadeSlug;
    if (uf && cidadeSlug && church?.slug) {
      return `${base}/paroquia/${uf.toLowerCase()}/${cidadeSlug}/${church.slug}`;
    }
    return `${base}/igrejas/${church?.nomeUnico}`;
  }

  // 0=Desconhecida, 1=Baixa, 2=Media, 3=Alta
  getConfiancaLabel(status: number): string {
    const labels: Record<number, string> = {
      3: '✓ Confirmado',
      2: '~ Não confirmado',
      1: '⚠ Desatualizado',
      0: 'Sem validação',
    };
    return labels[status] ?? 'Sem validação';
  }

  getConfiancaTooltip(status: number): string {
    const tips: Record<number, string> = {
      3: 'Horário validado nos últimos 30 dias ou confirmado pela paróquia',
      2: 'Horário validado entre 30 e 90 dias atrás',
      1: 'Horário não validado há mais de 90 dias — pode estar desatualizado',
      0: 'Horário nunca validado — confirme antes de ir',
    };
    return tips[status] ?? 'Horário nunca validado — confirme antes de ir';
  }
}
