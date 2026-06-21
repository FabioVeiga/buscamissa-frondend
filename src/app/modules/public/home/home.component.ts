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
import { ModalComponent } from "../../../core/components/modal/modal.component";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { ShareButtons } from "ngx-sharebuttons/buttons";
import { STATES } from "../../../core/constants/states";
import { MassTimeCardComponent } from "../../../shared/components/mass-time-card/mass-time-card.component";
import { MassCardData } from "../../../shared/models/mass-card.model";
import { getMissaAgoraUrgency, getCountdownLabel } from "../../../shared/utils/mass-time.utils";

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
    ModalComponent,
    RouterModule,
    ShareButtons,
    MassTimeCardComponent,
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

  /** Cards de próximas missas */
  proximasMissasCards: MassCardData[] = [];
  isLoadingProximas = false;
  tituloProximasMissas = 'Missas acontecendo hoje';

  // Sprint 3B — Minha Paróquia
  paroquiaFavorita: {
    id: number; nome: string; uf: string; cidadeSlug: string; slug: string;
    proximaMissaLabel?: string; diaSemana?: number; horario?: string;
  } | null = null;
  mostrarMinhaParoquia = false;

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

  public isModalVisible: boolean = false;
  public modalHeader: string = "Denunciar igreja";
  public totalRecords: any;

  public reportForm: FormGroup = new FormGroup({
    titulo: new FormControl("", Validators.required),
    descricao: new FormControl("", Validators.required),
    nomeDenunciador: new FormControl("", Validators.required),
    emailDenunciador: new FormControl("", [
      Validators.required,
      Validators.email,
    ]),
  });

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

  ngOnInit(): void {
    this.form = this._fb.group({
      Uf: [null, Validators.required],
      Localidade: [null],
      Bairro: [null],
      DiaDaSemana: [null],
      Horario: [null],
    });
    this.getAddress();
    this._loadFavorita();

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
        this._loadProximasMissas();
        this._requestGeolocation();
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
      },
      () => { this.geoStatus = 'denied'; }
    );
  }

  private _loadProximasMissas(lat?: number | null, lng?: number | null): void {
    this._churchService.proximasMissas(lat, lng).subscribe({
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

  // Sprint 3B — Minha Paróquia (localStorage)

  toggleMinhaParoquia(): void {
    this.mostrarMinhaParoquia = !this.mostrarMinhaParoquia;
  }

  onFavoriteClick(card: MassCardData): void {
    const proximaMissaLabel = card.mass.diaSemana != null
      ? getCountdownLabel(card.mass.diaSemana, card.mass.horario)
      : undefined;
    this.paroquiaFavorita = {
      id: card.churchId, nome: card.churchName, uf: card.uf,
      cidadeSlug: card.cidadeSlug, slug: card.slug,
      proximaMissaLabel, diaSemana: card.mass.diaSemana, horario: card.mass.horario,
    };
    localStorage.setItem('buscamissa_favorita', JSON.stringify(this.paroquiaFavorita));
    this.mostrarMinhaParoquia = true;
  }

  removerFavorita(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    localStorage.removeItem('buscamissa_favorita');
    this.paroquiaFavorita = null;
    this.mostrarMinhaParoquia = false;
  }

  private _loadFavorita(): void {
    const raw = localStorage.getItem('buscamissa_favorita');
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved.diaSemana != null && saved.horario)
        saved.proximaMissaLabel = getCountdownLabel(saved.diaSemana, saved.horario);
      this.paroquiaFavorita = saved;
      this.mostrarMinhaParoquia = true;
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
    if (p['pagina']) this.pageIndex = Number(p['pagina']);

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

  public searchFilter(resetPage = true): void {
    if (this.isLoading || this.form.invalid) return;

    if (resetPage) this.pageIndex = 1;

    this.isLoading = true;
    this.churchInfo = [];

    const uf = this.form.get("Uf")?.value;
    const localidade = this.form.get("Localidade")?.value;
    const bairro = this.form.get("Bairro")?.value;
    const diaDaSemana = this.form.get("DiaDaSemana")?.value;
    const horario = this._datePipe.transform(this.form.value.Horario, "HH:mm");

    this._router.navigate([], {
      queryParams: {
        uf: uf || null,
        cidade: localidade || null,
        bairro: bairro || null,
        dia: diaDaSemana ?? null,
        horario: horario || null,
        pagina: this.pageIndex,
      },
      replaceUrl: true,
    });

    const filters: FilterSearchChurch = {
      Uf: uf,
      Localidade: localidade,
      Bairro: bairro,
      DiaDaSemana: diaDaSemana,
      Horario: horario,
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

  reportChurch(idChurch: any): void {
    // Renomeie a função para usar os dados do form
    if (this.reportForm.valid) {
      const reportData = this.reportForm.value;
      this._churchService.report(idChurch.id, reportData).subscribe({
        next: (res: any) => {
          if (!res.data.resultadoDenuncia) {
            this.isModalVisible = false;
            return this._toast.add({
              severity: "warn",
              summary: "Alerta",
              detail: res.data.messagemAplicacao,
              
            });
          } else {
            this.isModalVisible = false;
            this._toast.add({
              severity: "success",
              summary: "Sucesso",
              detail: "Denúncia enviada com sucesso!",
            });
          }
        },
        error: (err: HttpErrorResponse) => {
          console.error(err);
          this._toast.add({
            severity: "warn",
            summary: "Igreja não encontrada",
            detail: "Igreja não encontrada.",
          });
        },
      });
    }
  }

  abrirModalDenuncia(): void {
    // Crie uma função específica para abrir o modal de denúncia
    this.isModalVisible = true;
    this.reportForm.reset(); // Limpa o formulário ao abrir o modal
  }

  fecharModal(): void {
    this.isModalVisible = false;
    this.reportForm.reset(); // Limpa o formulário ao fechar o modal
    console.log("Modal foi fechado.");
  }

  onModalShow(): void {
    console.log("Modal foi aberto.");
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
    if (url.includes("facebook.com")) return "pi pi-facebook";
    if (url.includes("instagram.com")) return "pi pi-instagram";
    if (url.includes("youtube.com")) return "pi pi-youtube";
    if (url.includes("tiktok.com")) return "pi pi-tiktok";
    return "pi pi-globe";
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
