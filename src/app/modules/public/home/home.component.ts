import { Component, DestroyRef, inject, NgZone, PLATFORM_ID, ViewChild } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { finalize } from "rxjs/operators";
import { firstValueFrom } from "rxjs";
import { CommonModule, DatePipe, isPlatformBrowser } from "@angular/common";
import {
  FormGroup,
  ReactiveFormsModule,
  FormBuilder,
} from "@angular/forms";
import { ChurchesService } from "../../../core/services/churches.service";
import { MessageService } from "primeng/api";
import { Select } from "primeng/select";
import { WEEK_DAYS } from "../../../core/constants/weekdays";
import { PrimeNgModule } from "../../../shared/primeng.module";
import {
  Church,
  FilterSearchChurch,
  Mass,
} from "../../../core/interfaces/church.interface";
import { HttpErrorResponse } from "@angular/common/http";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { STATES } from "../../../core/constants/states";
import { ChurchResultCardComponent } from "../../../shared/components/church-result-card/church-result-card.component";
import { MassCardData } from "../../../shared/models/mass-card.model";
import { getMissaAgoraUrgency, getCountdownLabel, getNextOccurrenceMinutes, formatMassTime } from "../../../shared/utils/mass-time.utils";
import { AnalyticsService } from "../../../core/services/analytics.service";
import { FavoritesService, IgrejaFavorita } from "../../../core/services/favorites.service";
import { RedesSociaisService, TipoRedeSocial } from "../../../core/services/redes-sociais.service";
import { getSocialIconFromTipos } from "../../../shared/utils/social-icon.utils";
import { distanciaMetrosAte } from "../../../shared/utils/distance.utils";
import { CIDADES_POPULARES } from "../../../core/constants/cidades-populares";
import { GeolocationService } from "../../../core/services/geolocation.service";
import { HomeStatsComponent } from "./sections/home-stats/home-stats.component";
import { HomeComoFuncionaComponent } from "./sections/home-como-funciona/home-como-funciona.component";
import { HomeFavoritosComponent } from "./sections/home-favoritos/home-favoritos.component";
import { HomeCidadesComponent } from "./sections/home-cidades/home-cidades.component";
import { HomeChipsComponent, ChipLink, ChipDestaque } from "./sections/home-chips/home-chips.component";
import { HomeExplorarComponent } from "./sections/home-explorar/home-explorar.component";
import { DIAS_INTENCAO } from "../../../core/constants/dias-intencao";
import { HomeMissasMapaComponent } from "./sections/home-missas-mapa/home-missas-mapa.component";
import { linkParoquia } from "../../../shared/utils/church-link.utils";
import { SeoPaginasService } from "../../../core/services/seo-paginas.service";
import { SeoService } from "../../../core/services/seo.service";
import { MetricasService } from "../../../core/services/metricas.service";
import { BuscaLocalService, IgrejaBusca } from "../../../core/services/busca-local.service";

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
    ChurchResultCardComponent,
    HomeStatsComponent,
    HomeComoFuncionaComponent,
    HomeFavoritosComponent,
    HomeCidadesComponent,
    HomeMissasMapaComponent,
    HomeChipsComponent,
    HomeExplorarComponent,
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
  private _destroyRef = inject(DestroyRef);
  private _analytics = inject(AnalyticsService);
  private _favorites = inject(FavoritesService);
  private _redesSociais = inject(RedesSociaisService);
  private _geo = inject(GeolocationService);
  private _seo = inject(SeoService);
  private _seoPaginas = inject(SeoPaginasService);
  private _metricas = inject(MetricasService);
  private _buscaLocal = inject(BuscaLocalService);
  tiposRedeSocial: TipoRedeSocial[] = [];

  /** Status da geolocalização */
  geoStatus: 'idle' | 'loading' | 'found' | 'denied' | 'error' = 'idle';

  /** Cidade detectada por geoloc */
  cidadeDetectada: { nome: string; uf: string; slug: string } | null = null;

  /** Cidades vizinhas (por geoloc) */
  cidadesGrid: { nome: string; uf: string; slug: string }[] = [];

  /** Cidades populares — exibidas quando sem geoloc */
  readonly cidadesFallback = CIDADES_POPULARES;

  /** Ponto de entrada "Missas por dia da semana" (chips + link p/ o hub /dias). */
  readonly chipsDias: ChipLink[] = DIAS_INTENCAO.map((d) => ({
    label: d.nome,
    link: ['/missa-' + d.slug],
  }));

  /** Estado detectado (derivado da mesma geo da cidade) — card "Seu estado". */
  get estadoDetectado(): ChipDestaque | null {
    const uf = this.cidadeDetectada?.uf;
    if (this.geoStatus !== 'found' || !uf) return null;
    const est = STATES.find((e) => e.sigla.toLowerCase() === uf.toLowerCase());
    if (!est) return null;
    return { rotulo: 'Seu estado', nome: est.nome, link: ['/missas', est.sigla.toLowerCase()] };
  }

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

  // Memo: evita realocar o array a cada ciclo de CD (relevante p/ filhos OnPush — 3.L)
  private _proximasFiltradasCache: MassCardData[] = [];
  private _proximasFiltradasKey = '';
  get proximasFiltradas(): MassCardData[] {
    const key = `${this.quickFilter ?? ''}|${this.proximasMissasCards.length}|${this.proximasMissasCards[0]?.churchId ?? ''}`;
    if (key !== this._proximasFiltradasKey) {
      this._proximasFiltradasKey = key;
      this._proximasFiltradasCache = this._aplicarQuickFilterCards(this.proximasMissasCards);
    }
    return this._proximasFiltradasCache;
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

  /** Ids das favoritas (para o coração dos cards da seção de missas) */
  get favoritasIds(): number[] {
    return this.paroquiasFavoritas.map(f => f.id);
  }

  /** Cards de próximas missas */
  proximasMissasCards: MassCardData[] = [];
  isLoadingProximas = false;
  tituloProximasMissas = 'Missas acontecendo hoje';

  // Sprint 3B — Minhas Paróquias (múltiplas)
  paroquiasFavoritas: IgrejaFavorita[] = [];

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
  /** Erro de rede/API na busca — mostra estado com "Tentar novamente" (≠ busca sem resultados) */
  public erroBusca = false;

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

  /** Erro de preenchimento do formulário, mostrado inline sob os campos. */
  erroFormulario: string | null = null;

  /** Select de Estado — para devolver o foco quando o usuário busca sem escolher um. */
  @ViewChild('ufSelect') private _ufSelect?: Select;

  /** ── Busca por NOME de igreja (índice estático local) ────────────────────────
   *
   * Não existe endpoint que ache paróquia por nome no Brasil inteiro
   * (`buscar-por-filtro` exige `Uf`), então o autocomplete vem do índice que o
   * prebuild gera — o mesmo já usado em `/cidades`. Nenhuma API nova.
   *
   * Os dois caminhos convivem no MESMO campo: a lista é o atalho direto para a
   * paróquia (nacional, ou recortada pelo estado/cidade já escolhidos), e o valor
   * digitado também viaja como `Nome` na busca filtrada quando há estado. */

  /** Consulta abaixo disto não sugere nada — 1 ou 2 letras casariam meia base. */
  private static readonly MIN_CONSULTA = 3;

  sugestoesIgrejas: IgrejaBusca[] = [];
  /** Total de paróquias que casaram, antes do corte da lista. */
  totalSugestoes = 0;
  /** Índice do item com foco de teclado; -1 = foco no campo. */
  sugestaoAtiva = -1;

  /**
   * O painel abre porque o usuário está PROCURANDO, não porque o campo tem texto.
   *
   * A diferença aparece ao chegar em `/buscar?nome=catedral`: o valor é restaurado
   * da URL sem ninguém digitar, e o índice — que só é pedido no foco do campo —
   * nunca foi baixado. Sem esta flag o painel abria sozinho e ficava preso em
   * "Carregando a lista de igrejas…", esperando um download que ninguém pediu.
   */
  painelAberto = false;

  /** Já pedimos o índice nesta sessão? (o serviço é idempotente, isto evita ruído) */
  private _indicePedido = false;
  /** O índice chegou (com dados ou vazio) — é o que distingue "carregando" de "não achei". */
  indiceResolvido = false;
  /** O índice resolveu SEM dados: rede caiu, 404, ou HTML no lugar do JSON. */
  indiceIndisponivel = false;

  /**
   * Há uma consulta vinda da URL esperando o índice chegar para ser resolvida.
   * A decisão (navegar ou não) depende de saber quantas paróquias casaram, e isso
   * só se sabe depois do download.
   */
  private _resolverAposIndice = false;

  /** Estatísticas (números reais via getInfo, com fallback) */
  stats = { igrejas: 2000, horarios: 9100, cidades: 213, estados: 26 };

  /**
   * True só no browser. No prerender/SSG (Fase 3) a home é assada no server, onde
   * navigator/document/timers não existem — qualquer acesso trava o render e aborta
   * o build inteiro. Guardamos o caminho de geolocalização/scroll com este flag.
   * Ver city.component.ts / countdown-chip.component.ts (mesmo padrão).
   */
  /** protected (não private): o template usa para não prerenderizar blocos client-only. */
  protected _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private _ngZone = inject(NgZone);

  setSearchTab(tab: 'cidade' | 'local'): void {
    if (this.searchTab === tab) return;
    this.searchTab = tab;
    this._router.navigate([], { queryParams: {}, replaceUrl: true });
    this.churchInfo = [];
    this.showNoChurchCard = false;
    this.erroFormulario = null;
    this.form?.get('Nome')?.setValue(null);
    this.limparSugestoes();
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
    if (!this._isBrowser) return;
    document.getElementById('proximas-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ngOnInit(): void {
    this._setSeo();
    this._redesSociais.obterTipos().subscribe({
      next: (tipos) => (this.tiposRedeSocial = tipos),
      error: () => { /* silencioso — mantém a lista padrão se a API falhar */ },
    });
    this.resultsMode = !!this._route.snapshot.data['resultsMode'];
    // Só conta como visita à Home a rota /home — /buscar é a mesma tela em
    // modo de resultados e não deve inflar a métrica.
    if (!this.resultsMode) {
      this._metricas.registrarVisualizacaoHome();
    }

    this.form = this._fb.group({
      // Sem `Validators.required` em `Uf` de propósito: com ele o formulário nasce
      // inválido e o botão principal nasce desabilitado, sem dizer o que falta.
      // A exigência de estado é cobrada em `onBuscarClick()`, com mensagem e foco.
      Uf: [null],
      Localidade: [null],
      Bairro: [null],
      Nome: [null],
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
    this._route.queryParams.pipe(takeUntilDestroyed(this._destroyRef)).subscribe(params => {
      // `nome` na guarda porque `/buscar?nome=catedral` é uma busca legítima, sem
      // UF: é o alvo declarado pelo SearchAction do JSON-LD. Sem isto o valor era
      // restaurado da URL e apagado no mesmo tick pelo `form.reset()` abaixo.
      if (!params['uf'] && !params['nome']) {
        this.churchInfo = [];
        this.showNoChurchCard = false;
        this.erroFormulario = null;
        this.form.reset();
      }
    });
  }

  /**
   * Dados estruturados site-wide injetados a partir da home: Organization e
   * WebSite/SearchAction (habilita a sitelinks searchbox do Google).
   * title/description/canonical são aplicados centralmente pelo AppComponent via
   * route.data — não repetir aqui (a home também serve /buscar).
   */
  private _setSeo(): void {
    const base = "https://buscamissa.com.br";

    this._seo.setJsonLd("organization", {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "BuscaMissa",
      url: base,
      logo: `${base}/android-chrome-512x512.png`,
      sameAs: ["https://www.instagram.com/buscamissa/"],
    });

    this._seo.setJsonLd("website", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "BuscaMissa",
      url: base,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          // `nome`, não `busca`: o app nunca leu um param chamado `busca`, então
          // este alvo levava a uma página de busca vazia desde sempre.
          urlTemplate: `${base}/buscar?nome={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    });

    // Breadcrumb só na página de resultados (/buscar). Na home limpa qualquer
    // breadcrumb deixado por uma navegação anterior (details/city usam o mesmo id).
    if (this._route.snapshot.data["resultsMode"]) {
      this._seo.setJsonLd("breadcrumb", {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Início", item: `${base}/home` },
          { "@type": "ListItem", position: 2, name: "Buscar", item: `${base}/buscar` },
        ],
      });
    } else {
      this._seo.removeJsonLd("breadcrumb");
    }
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

    // finalize (não complete): se o addressRange falhar, a continuação PRECISA rodar
    // mesmo assim — senão a busca da URL (/buscar?uf=...) nunca dispara e o usuário
    // vê o vazio enganoso "Nenhuma igreja encontrada" em vez do estado de erro.
    this._churchService.addressRange().pipe(
      finalize(() => {
        this.isLoadingAddress = false;
        this._restoreFromQueryParams();
        // Geolocalização e próximas missas são UPGRADE do cliente: no prerender o
        // server assa o estado default estável (sem geo), o browser preenche ao
        // hidratar. Guardar evita crash no SSR e hydration swap.
        if (!this.resultsMode && this._isBrowser) {
          this._loadProximasMissas();
          this._requestGeolocation();
          this._agendarRefreshProximas();
        }
      })
    ).subscribe({
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
    });
  }

  private _requestGeolocation(): void {
    if (!this._isBrowser || !navigator.geolocation) return;
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
        // Nova referência (não mutar): HomeStatsComponent é OnPush e só
        // re-renderiza quando a referência do input muda.
        if (igrejas || horarios) {
          this.stats = {
            ...this.stats,
            ...(igrejas ? { igrejas } : {}),
            ...(horarios ? { horarios } : {}),
          };
        }
      },
      error: () => { /* silencioso — mantém fallback */ },
    });
  }

  /** Args da última carga — usados pelo refresh periódico para repetir a mesma busca. */
  private _ultimaBuscaProximas: { lat?: number | null; lng?: number | null; raioKm: number } | null = null;
  private _ultimaCargaProximasEm = 0;

  private _loadProximasMissas(lat?: number | null, lng?: number | null, raioKm = 10, silencioso = false): void {
    this._ultimaBuscaProximas = { lat, lng, raioKm };
    // No refresh automático não mostramos skeleton: a lista já está na tela e
    // piscar o loading a cada ciclo seria pior que a espera invisível.
    if (!silencioso) this.isLoadingProximas = true;
    this._churchService.proximasMissas(lat, lng, raioKm).subscribe({
      next: (res: any) => {
        this._ultimaCargaProximasEm = Date.now();
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
        this.isLoadingProximas = false;
      },
      error: () => { this.isLoadingProximas = false; /* silencioso — seção simplesmente não aparece */ },
    });
  }

  /**
   * Mantém "próximas missas" coerente com a hora do relógio: a lista vem ordenada
   * por proximidade temporal, então uma aba aberta por muito tempo mostraria missas
   * que já aconteceram. Dois gatilhos, ambos SÓ no browser — um timer pendente no
   * servidor trava o prerender e derruba o build inteiro:
   *  - intervalo fixo, para quem deixa a página aberta;
   *  - volta do foco da aba, que cobre o caso real mais comum (usuário retorna
   *    depois de horas) sem esperar o próximo tick.
   */
  private static readonly REFRESH_PROXIMAS_MS = 5 * 60_000;

  private _agendarRefreshProximas(): void {
    if (!this._isBrowser) return;

    const recarregar = (silencioso = true) => {
      const args = this._ultimaBuscaProximas;
      if (!args || this.resultsMode) return;
      this._loadProximasMissas(args.lat, args.lng, args.raioKm, silencioso);
    };

    // runOutsideAngular é obrigatório, não otimização: um setInterval recorrente
    // dentro da zona mantém ApplicationRef.isStable() em false para sempre, e a
    // hidratação nunca conclui (NG0506) — foi exatamente isso que congelou os
    // blocos @defer desta página. O re-entry na zona acontece no subscribe do
    // HttpClient, então a UI atualiza normalmente.
    const timer = this._ngZone.runOutsideAngular(() =>
      setInterval(() => this._ngZone.run(() => recarregar()), HomeComponent.REFRESH_PROXIMAS_MS)
    );

    // Só revalida na volta do foco se a última carga já envelheceu — alt-tab
    // rápido não deve gerar request.
    const aoVoltarFoco = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - this._ultimaCargaProximasEm < HomeComponent.REFRESH_PROXIMAS_MS) return;
      this._ngZone.run(() => recarregar());
    };
    this._ngZone.runOutsideAngular(() =>
      document.addEventListener('visibilitychange', aoVoltarFoco)
    );

    this._destroyRef.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', aoVoltarFoco);
    });
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
    this._favorites.adicionar(novaFavorita);
    this._metricas.registrarFavorito(card.churchId);
    this.paroquiasFavoritas = [...this.paroquiasFavoritas, novaFavorita];
    this._analytics.favoriteParishSaved(card.churchName);
  }

  removerFavorita(churchId: number, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this._favorites.remover(churchId);
    this.paroquiasFavoritas = this.paroquiasFavoritas.filter(f => f.id !== churchId);
  }

  private _loadFavorita(): void {
    this.paroquiasFavoritas = this._favorites.listar().map((f) => ({
      ...f,
      proximaMissaLabel: f.diaSemana != null && f.horario ? getCountdownLabel(f.diaSemana, f.horario) : undefined,
    }));
  }

  /**
   * Cidades por UF com o `cidadeSlug` REAL do backend (`GET /v2/seo/estados`, a mesma
   * fonte de `/cidades`, `/estados` e do autocomplete de `missa-agora`).
   *
   * Só é buscada no caminho da geolocalização — nunca no load da home — e fica em cache
   * porque `_reverseGeocode()` roda de novo no CTA "Encontrar missas perto de mim".
   * Falha de rede vira mapa vazio: sem slug a gente não navega (ver `_reverseGeocode`).
   */
  private _cidadesPorUf?: Promise<Map<string, { nome: string; slug: string }[]>>;

  private _carregarCidadesPorUf(): Promise<Map<string, { nome: string; slug: string }[]>> {
    this._cidadesPorUf ??= firstValueFrom(this._seoPaginas.getEstados())
      .then((res: unknown) => {
        const lista: any[] = Array.isArray(res) ? res : ((res as any)?.data ?? []);
        const mapa = new Map<string, { nome: string; slug: string }[]>();
        lista.filter((e) => e?.uf).forEach((e) => {
          mapa.set(
            String(e.uf).toUpperCase(),
            (e.cidades ?? []).map((c: any) => ({ nome: c.cidade, slug: c.cidadeSlug })),
          );
        });
        return mapa;
      })
      .catch(() => new Map<string, { nome: string; slug: string }[]>());
    return this._cidadesPorUf;
  }

  /**
   * UF a partir da resposta do Nominatim.
   *
   * Prefere o código ISO 3166-2 (`BR-PR`), que é inequívoco. O fallback por nome faz
   * match EXATO antes de tentar substring: "Paraná" normalizado ("parana") CONTÉM
   * "Pará" ("para"), e como Pará vem antes na lista, a busca por substring devolvia PA
   * para quem estava no Paraná — a home simplesmente nunca detectava a cidade lá.
   */
  private _resolverUf(addr: any): string | null {
    const iso = String(addr?.['ISO3166-2-lvl4'] ?? '');
    const daIso = iso.startsWith('BR-') ? iso.slice(3).toUpperCase() : '';
    if (STATES.some(s => s.sigla === daIso)) return daIso;

    const nomeEstado = this._norm(addr?.state ?? '');
    if (!nomeEstado) return null;
    const exato = STATES.find(s => this._norm(s.nome) === nomeEstado);
    if (exato) return exato.sigla;
    const parcial = STATES.find(s =>
      nomeEstado.includes(this._norm(s.nome)) || this._norm(s.nome).includes(nomeEstado)
    );
    return parcial?.sigla ?? null;
  }

  /**
   * Resolve a cidade do usuário a partir das coordenadas.
   *
   * O slug vem do BACKEND, nunca de um `slugify()` no cliente. O slug real não é
   * derivável do nome: além do apóstrofo ("São João do Pau d'Alho" → `sao-joao-do-pau-d-alho`,
   * não `...-dalho`), há cidades cujo slug é de um distrito ou bairro ("Guaranésia" →
   * `santa-cruz-da-prata-distrito-de-guaranesia`). Como `/missas/*` está fora do
   * `navigationFallback` do `staticwebapp.config.json`, errar o slug é 404 de verdade,
   * não shell CSR — por isso, sem slug conhecido, preferimos não navegar.
   */
  private _reverseGeocode(lat: number, lng: number): void {
    Promise.all([this._geo.reverseGeocode(lat, lng), this._carregarCidadesPorUf()])
      .then(([addr, cidadesPorUf]) => {
        if (!addr) { this.geoStatus = 'error'; return; }
        const nomeCidade = addr.city || addr.town || addr.village || addr.municipality || '';
        const uf = this._resolverUf(addr);
        if (!uf || !nomeCidade) { this.geoStatus = 'error'; return; }
        // Só cidades que têm página gerada — o índice de `/v2/seo/estados` é o mesmo
        // conjunto que o prerender publica, então nenhum link daqui aponta para o vazio.
        const cidadesDoEstado = cidadesPorUf.get(uf) ?? [];
        const match = cidadesDoEstado.find(c => this._norm(c.nome) === this._norm(nomeCidade));

        if (!match) { this.geoStatus = 'error'; return; }

        this.cidadeDetectada = { nome: match.nome, uf, slug: match.slug };

        const outras = cidadesDoEstado
          .filter(c => this._norm(c.nome) !== this._norm(match.nome))
          .slice(0, 7)
          .map(c => ({ nome: c.nome, uf, slug: c.slug }));

        this.cidadesGrid = [{ nome: match.nome, uf, slug: match.slug }, ...outras];
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

  private _restoreFromQueryParams(): void {
    const p = this._route.snapshot.queryParams;

    // Sem UF não existe busca de API: `buscar-por-filtro` exige `Uf`. Mas com
    // `nome` ainda existe o índice local — e é exatamente essa a URL que o
    // SearchAction declara ao Google.
    if (!p['uf']) {
      if (p['nome']) this._restaurarBuscaPorNome(String(p['nome']));
      return;
    }

    // Restaura UF e popula cidades
    this.form.get('Uf')?.setValue(p['uf']);
    this.onStateChange({ value: p['uf'] });

    if (p['cidade']) {
      this.form.get('Localidade')?.setValue(p['cidade']);
      this.onCityChange({ value: p['cidade'] });
    }

    if (p['bairro']) this.form.get('Bairro')?.setValue(p['bairro']);
    if (p['nome']) this.form.get('Nome')?.setValue(p['nome']);
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

  /**
   * `/buscar?nome=...` sem UF — a URL que o `SearchAction` do JSON-LD declara.
   *
   * Reproduz o que acontece quando a pessoa digita no campo: índice sob demanda,
   * os mesmos estados de lista e a MESMA regra de ambiguidade. Nenhuma chamada de
   * API, porque sem `Uf` não há o que chamar.
   */
  private _restaurarBuscaPorNome(nome: string): void {
    this.form.get('Nome')?.setValue(nome);
    this.painelAberto = true;

    // O índice pode já estar em memória (voltar para cá dentro da mesma sessão).
    if (this.indiceResolvido) {
      this._recalcularSugestoes();
      this._resolverPorNome();
      return;
    }

    this._resolverAposIndice = true;
    this.garantirIndiceIgrejas();
  }

  public onStateChange(event: any): void {
    this.selectedState = event.value;
    // Escolher o estado é a correção do erro — a mensagem some junto.
    if (this.selectedState) this.erroFormulario = null;
    if (this.selectedState) {
      // Guarda: se o addressRange falhou, fullAddressData é undefined — não pode
      // derrubar o fluxo (a busca da URL ainda precisa rodar e mostrar o erro dela)
      const cities = Object.keys(this.fullAddressData?.[this.selectedState] ?? {});
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
        this.fullAddressData?.[this.selectedState]?.[this.selectedCity] ?? [];
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
    nome: string | null;
    dia: number | null;
    horario: string | null;
    horarioFim: string | null;
    cep: string | null;
  } {
    const uf = this.form.get("Uf")?.value;
    const localidade = this.form.get("Localidade")?.value;
    const bairro = this.form.get("Bairro")?.value;
    const nome = String(this.form.get("Nome")?.value ?? '').trim();
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
      nome: nome || null,
      dia: diaDaSemana ?? null,
      horario: horario ?? null,
      horarioFim: horarioFim ?? null,
      cep: cepRaw.length === 8 ? cepRaw : null,
    };
  }

  // ── Autocomplete de nome de igreja ──────────────────────────────────────────

  /** Escopo atual das sugestões: o que o usuário já escolheu no formulário. */
  private get _escopoBusca() {
    return {
      uf: this.form?.get('Uf')?.value ?? null,
      cidade: this.form?.get('Localidade')?.value ?? null,
    };
  }

  private get _consultaNome(): string {
    return String(this.form?.get('Nome')?.value ?? '').trim();
  }

  /**
   * Baixa o índice no FOCO do campo, não no load da página. Quem nunca usa a busca
   * por nome não paga o download — e quem usa já os tem quando termina
   * de digitar as três primeiras letras.
   */
  garantirIndiceIgrejas(): void {
    if (this._indicePedido || !this._isBrowser) return;
    this._indicePedido = true;

    this._buscaLocal
      .carregarIndice()
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((temIndice) => {
        this.indiceResolvido = true;
        this.indiceIndisponivel = !temIndice;
        // O usuário pode ter digitado enquanto o índice vinha: recalcula.
        this._recalcularSugestoes();

        // Consulta que veio da URL: agora dá para decidir se navega.
        if (this._resolverAposIndice) {
          this._resolverAposIndice = false;
          this._resolverPorNome();
        }
      });
  }

  onNomeInput(): void {
    this.erroFormulario = null;
    this.sugestaoAtiva = -1;
    this.painelAberto = true;
    this.garantirIndiceIgrejas();
    this._recalcularSugestoes();
  }

  private _recalcularSugestoes(): void {
    const consulta = this._consultaNome;
    if (consulta.length < HomeComponent.MIN_CONSULTA) {
      this.sugestoesIgrejas = [];
      this.totalSugestoes = 0;
      return;
    }
    // `buscarIgrejas` e não `buscar`: só igrejas, com bairro e escopo. `buscar()`
    // é o caminho de `/cidades` e continua intocado.
    const r = this._buscaLocal.buscarIgrejas(consulta, this._escopoBusca);
    this.sugestoesIgrejas = r.igrejas;
    this.totalSugestoes = r.total;
  }

  /** Mostrar o painel? Só com consulta útil e algo a dizer. */
  get mostrarSugestoes(): boolean {
    return (
      this.painelAberto &&
      this._consultaNome.length >= HomeComponent.MIN_CONSULTA &&
      (this.sugestoesIgrejas.length > 0 || !this.indiceResolvido || this.indiceIndisponivel || this.buscaSemResultado)
    );
  }

  /** Índice já respondeu, tem dados, e mesmo assim nada casou. */
  get buscaSemResultado(): boolean {
    return (
      this.indiceResolvido &&
      !this.indiceIndisponivel &&
      this._consultaNome.length >= HomeComponent.MIN_CONSULTA &&
      this.sugestoesIgrejas.length === 0
    );
  }

  /** Carregando: o índice ainda não chegou e já há o que buscar com ele. */
  get carregandoSugestoes(): boolean {
    return !this.indiceResolvido && this._consultaNome.length >= HomeComponent.MIN_CONSULTA;
  }

  /** A lista está cortada — quantas ficaram de fora importa para não enganar. */
  get sugestoesCortadas(): boolean {
    return this.totalSugestoes > this.sugestoesIgrejas.length;
  }

  /**
   * Enter no campo de nome. Com um item percorrido pelo teclado, abre esse item;
   * sem item ativo, faz exatamente o que o botão faz — inclusive a recusa de
   * escolher sozinho quando o nome é ambíguo.
   */
  onEnterNome(): void {
    if (this.sugestaoAtiva >= 0 && this.sugestoesIgrejas[this.sugestaoAtiva]) {
      this.abrirSugestao(this.sugestoesIgrejas[this.sugestaoAtiva]);
      return;
    }
    this.onBuscarClick();
  }

  linkIgrejaSugerida(i: IgrejaBusca): string[] {
    // Slugs sempre os do backend, nunca gerados aqui. Mesma montagem de /cidades.
    return ['/paroquia', i.uf, i.cidadeSlug, i.slug];
  }

  abrirSugestao(i: IgrejaBusca): void {
    this.limparSugestoes();
    this._router.navigate(this.linkIgrejaSugerida(i));
  }

  limparSugestoes(): void {
    this.sugestoesIgrejas = [];
    this.totalSugestoes = 0;
    this.sugestaoAtiva = -1;
    this.painelAberto = false;
  }

  /** Seta para baixo/cima percorre a lista; -1 devolve o foco ao campo. */
  moverSugestao(delta: number): void {
    if (!this.sugestoesIgrejas.length) return;
    const ultimo = this.sugestoesIgrejas.length - 1;
    const proximo = this.sugestaoAtiva + delta;
    this.sugestaoAtiva = proximo < 0 ? -1 : Math.min(proximo, ultimo);
  }

  // ── Ação principal ──────────────────────────────────────────────────────────

  /**
   * Clique no botão "Buscar" (e Enter no formulário) — os dois fazem o mesmo.
   *
   * O botão NÃO nasce mais desabilitado. Antes era `[disabled]="form.invalid"` com
   * `Uf` obrigatório, mas pintado como primário cheio (laranja 100%, opacidade 1,
   * cursor pointer): clicar não fazia nada e não dizia por quê. O requisito é
   * cobrado AQUI, com mensagem e foco — errar e ser corrigido ensina, botão inerte
   * não.
   *
   * Com estado: busca filtrada normal, agora levando `Nome` junto.
   * Sem estado, só com nome: o índice local resolve — mas SÓ navega sozinho quando
   * o destino é inequívoco (ver `_resolverPorNome`).
   */
  public onBuscarClick(): void {
    if (this.isLoading) return;

    if (this.form.get('Uf')?.value) {
      this.erroFormulario = null;
      this.limparSugestoes();
      if (this.resultsMode) {
        this.searchFilter();
      } else {
        this.submitBusca();
      }
      return;
    }

    if (this._consultaNome.length >= HomeComponent.MIN_CONSULTA) {
      this._resolverPorNome();
      return;
    }

    this._exigirEstado();
  }

  /**
   * Caminho "só o nome, sem estado".
   *
   * A regra que importa: **não escolher pelo usuário quando há mais de um destino.**
   * "São Francisco" casa dezenas de paróquias em cidades diferentes; abrir a
   * primeira o levaria em silêncio para a igreja errada, sem que ele percebesse que
   * houve uma escolha. Navegar direto só quando o destino é único — ou quando um
   * único nome bate EXATAMENTE com o que ele digitou.
   */
  private _resolverPorNome(): void {
    // Pode ser a primeira interação com o campo (valor veio da URL): garante o
    // índice e recalcula antes de decidir qualquer coisa.
    this.painelAberto = true;
    this.garantirIndiceIgrejas();
    this._recalcularSugestoes();

    if (this.carregandoSugestoes) {
      this.erroFormulario = 'Carregando a lista de igrejas. Tente de novo em um instante.';
      return;
    }

    if (this.indiceIndisponivel) {
      this.erroFormulario = 'A busca por nome está indisponível agora. Escolha um estado para buscar.';
      return;
    }

    if (this.totalSugestoes === 0) {
      this.erroFormulario = 'Não encontramos essa igreja. Escolha um estado para buscar pelos horários.';
      return;
    }

    this.erroFormulario = null;
    this._analytics.searchStarted();

    if (this.totalSugestoes === 1) {
      this.abrirSugestao(this.sugestoesIgrejas[0]);
      return;
    }

    const exatas = this._buscaLocal.correspondenciasExatas(this._consultaNome, this._escopoBusca);
    if (exatas.length === 1) {
      this.abrirSugestao(exatas[0]);
      return;
    }

    // Ambíguo: a lista já está na tela; leva o foco para ela e deixa a escolha
    // com quem sabe qual é a igreja certa.
    //
    // E DIZ isso. Destacar um item em silêncio depois de um clique é o mesmo
    // defeito do botão desabilitado que esta etapa remove: a pessoa age e nada
    // explica o que aconteceu.
    this.sugestaoAtiva = 0;
    this.erroFormulario =
      `Encontramos ${this.totalSugestoes} igrejas com esse nome. ` +
      `Escolha uma na lista ou informe o estado.`;
  }

  /** Mensagem + foco quando falta o estado, que é o único filtro que a API exige. */
  private _exigirEstado(): void {
    this.erroFormulario = 'Escolha um estado ou digite o nome da igreja.';
    this.form.get('Uf')?.markAsTouched();
    this._ufSelect?.focus();
  }

  /** Navega para a página de resultados com os filtros como query params */
  public submitBusca(): void {
    const params = this._buildFilterQueryParams();
    this._router.navigate(['/buscar'], {
      queryParams: { ...params, pagina: 1 },
    });
  }

  public searchFilter(resetPage = true): void {
    // `Uf` é `[Required]` no backend — sem ele a chamada volta 400. A validação de
    // formulário saiu do `Validators` para o clique, então o guard checa o campo.
    if (this.isLoading || !this.form.get('Uf')?.value) return;

    if (resetPage) this.pageIndex = 1;

    this.isLoading = true;
    this.erroBusca = false;
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
      Nome: params.nome || undefined,
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
        // Acesso seguro: em erro de rede err.error é ProgressEvent/null (sem .status)
        if (err?.error?.status === 404 || err?.status === 404) {
          this._toast.add({
            severity: "warn",
            summary: "Nenhuma igreja encontrada",
            detail: "Não encontramos igrejas para os filtros aplicados.",
          });
          this.showNoChurchCard = true;
        } else {
          // Estado de erro persistente na página (com retry) — toast some
          this.erroBusca = true;
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
    return distanciaMetrosAte(
      this._userLat,
      this._userLng,
      church.endereco?.latitude,
      church.endereco?.longitude
    );
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
    return linkParoquia(church);
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
