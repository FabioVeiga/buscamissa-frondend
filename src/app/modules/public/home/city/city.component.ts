import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { finalize } from "rxjs/operators";
import { SkeletonModule } from "primeng/skeleton";
import { PrimeNgModule } from "../../../../shared/primeng.module";
import { ChurchesService } from "../../../../core/services/churches.service";
import { SeoService } from "../../../../core/services/seo.service";
import { ConfidenceBadgeComponent } from "../../../../shared/components/confidence-badge/confidence-badge.component";
import { CountdownChipComponent } from "../../../../shared/components/countdown-chip/countdown-chip.component";
import { DistanceChipComponent } from "../../../../shared/components/distance-chip/distance-chip.component";
import { getNextOccurrenceMinutes, formatMassTime, getCountdownLabel } from "../../../../shared/utils/mass-time.utils";
import { AnalyticsService } from "../../../../core/services/analytics.service";
import { CityMapComponent, MapChurch } from "../../../../shared/components/city-map/city-map.component";

const PERIODOS: Record<string, { de: number; ate: number; label: string }> = {
  manha: { de: 5 * 60, ate: 11 * 60 + 59, label: "Manhã" },
  tarde: { de: 12 * 60, ate: 17 * 60 + 59, label: "Tarde" },
  noite: { de: 18 * 60, ate: 23 * 60 + 59, label: "Noite" },
};

const DIAS: { label: string; slug: string; idx: number }[] = [
  { label: "Dom", slug: "domingo", idx: 0 },
  { label: "Seg", slug: "segunda", idx: 1 },
  { label: "Ter", slug: "terca", idx: 2 },
  { label: "Qua", slug: "quarta", idx: 3 },
  { label: "Qui", slug: "quinta", idx: 4 },
  { label: "Sex", slug: "sexta", idx: 5 },
  { label: "Sáb", slug: "sabado", idx: 6 },
];

@Component({
  selector: "app-city",
  standalone: true,
  imports: [
    PrimeNgModule,
    CommonModule,
    RouterLink,
    SkeletonModule,
    ConfidenceBadgeComponent,
    CityMapComponent,
  ],
  templateUrl: "./city.component.html",
  styleUrl: "./city.component.scss",
})
export class CityComponent implements OnInit, OnDestroy {
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _church = inject(ChurchesService);
  private _seo = inject(SeoService);
  private _analytics = inject(AnalyticsService);

  isLoading = false;
  uf = "";
  cidade = "";
  cidadeNome = "";
  igrejas: any[] = [];
  igrejasFiltradas: any[] = [];
  naoEncontrado = false;
  faqs: { pergunta: string; resposta: string }[] = [];

  imagensQuebradas = new Set<number>();
  paroquiaFavoritaId: number | null = null;

  // Filtros
  diaAtivo: number | null = null;
  periodoAtivo: string | null = null;
  quickFilter: 'hoje' | 'amanha' | 'fds' | null = null;

  // UI
  mostrarFiltrosAvancados = false;
  mapVisible = false;

  // Ordenação
  ordenacaoAtiva: 'az' | 'za' | 'proximidade' | 'proxima-missa' = 'proxima-missa';

  // Geolocalização
  userLat: number | null = null;
  userLng: number | null = null;

  get temGeolocalizacao(): boolean { return this.userLat !== null && this.userLng !== null; }

  get mapIgrejas(): MapChurch[] {
    return this.igrejasFiltradas.map((ig) => ({
      id: ig.id,
      nome: ig.nome,
      lat: ig.endereco?.latitude ?? null,
      lng: ig.endereco?.longitude ?? null,
    }));
  }
  get diaHoje(): number { return new Date().getDay(); }
  get diaAmanha(): number { return (new Date().getDay() + 1) % 7; }

  readonly dias = DIAS;
  readonly periodos = Object.entries(PERIODOS).map(([slug, v]) => ({ slug, label: v.label }));

  ngOnInit(): void {
    this._route.params.subscribe((params) => {
      this.uf = params["uf"];
      this.cidade = params["cidade"];
      this.cidadeNome = this.cidade
        .split('-')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      this._route.queryParams.subscribe((qp) => {
        this.diaAtivo = this.parseDiaSlug(qp["dia"]);
        this.periodoAtivo = qp["periodo"] ?? null;
        this.carregar();
      });
    });

    this.pedirGeolocalizacao();
    this._loadFavorita();
  }

  carregar(): void {
    this.isLoading = true;
    this.naoEncontrado = false;
    this._church.getByCidade(this.uf, this.cidade).pipe(
      finalize(() => { this.isLoading = false; })
    ).subscribe({
      next: (response: any) => {
        const data = response?.data;
        this.igrejas = data?.igrejas ?? [];
        this.cidadeNome = data?.cidade ?? this.cidade;
        const seo = data?.seo;

        this.aplicarFiltros();
        this._analytics.searchPerformed(this.cidadeNome, this.uf);

        if (this.igrejas.length === 0) this.naoEncontrado = true;

        this._seo.update({
          title: seo?.title ?? `Missas em ${this.cidadeNome}/${this.uf?.toUpperCase()} | BuscaMissa`,
          description: seo?.description ?? `Horários de missa em ${this.cidadeNome}/${this.uf?.toUpperCase()}.`,
          canonical: seo?.canonicalUrl,
        });

        if (this.igrejas.length) {
          this.aplicarBreadcrumbSchema();
          this.montarFaqs();
          this.aplicarFaqSchema();
        }
      },
      error: () => {
        this.naoEncontrado = true;
        this._seo.update({ title: `Missas em ${this.cidade}/${this.uf?.toUpperCase()} | BuscaMissa` });
      },
    });
  }

  ngOnDestroy(): void {
    this._seo.removeJsonLd("breadcrumb");
    this._seo.removeJsonLd("faq");
  }

  // ── Quick filters ─────────────────────────────────────────────────────────

  setQuickFilter(f: 'hoje' | 'amanha' | 'fds' | null): void {
    this.quickFilter = this.quickFilter === f ? null : f;
    this.diaAtivo = null;
    this.periodoAtivo = null;
    this._router.navigate([], { queryParams: {}, replaceUrl: true });
    this.aplicarFiltros();
  }

  // ── Filtros avançados ─────────────────────────────────────────────────────

  setDia(idx: number): void {
    this.diaAtivo = this.diaAtivo === idx ? null : idx;
    this.quickFilter = null;
    const slug = DIAS.find((d) => d.idx === this.diaAtivo)?.slug ?? null;
    this._router.navigate([], {
      queryParams: { dia: slug, periodo: this.periodoAtivo },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
    this.aplicarFiltros();
  }

  setPeriodo(slug: string): void {
    this.periodoAtivo = this.periodoAtivo === slug ? null : slug;
    this._router.navigate([], {
      queryParams: { dia: this.diaAtivo !== null ? DIAS.find((d) => d.idx === this.diaAtivo)?.slug : null, periodo: this.periodoAtivo },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
    this.aplicarFiltros();
  }

  limparFiltros(): void {
    this.diaAtivo = null;
    this.periodoAtivo = null;
    this.quickFilter = null;
    this._router.navigate([], { queryParams: {}, replaceUrl: true });
    this.aplicarFiltros();
  }

  setOrdenacao(o: 'az' | 'za' | 'proximidade' | 'proxima-missa'): void {
    this.ordenacaoAtiva = o;
    this.aplicarFiltros();
  }

  get temFiltroAtivo(): boolean {
    return this.diaAtivo !== null || this.periodoAtivo !== null || this.quickFilter !== null;
  }

  private aplicarFiltros(): void {
    let lista = [...this.igrejas];

    // Quick filters
    if (this.quickFilter === 'hoje') {
      lista = lista.filter(ig => ig.missas?.some((m: any) => m.diaSemana === this.diaHoje));
    } else if (this.quickFilter === 'amanha') {
      lista = lista.filter(ig => ig.missas?.some((m: any) => m.diaSemana === this.diaAmanha));
    } else if (this.quickFilter === 'fds') {
      lista = lista.filter(ig => ig.missas?.some((m: any) => m.diaSemana === 0 || m.diaSemana === 6));
    }

    // Filtro por dia manual
    if (this.diaAtivo !== null) {
      lista = lista.filter(ig => ig.missas?.some((m: any) => m.diaSemana === this.diaAtivo));
    }

    // Filtro por período
    if (this.periodoAtivo && PERIODOS[this.periodoAtivo]) {
      const { de, ate } = PERIODOS[this.periodoAtivo];
      lista = lista.filter(ig =>
        ig.missas?.some((m: any) => {
          const [h, min] = (m.horario ?? "").split(":").map(Number);
          const total = h * 60 + min;
          return total >= de && total <= ate;
        })
      );
    }

    lista = this._ordenar(lista);
    this.igrejasFiltradas = lista;
    if (!this.isLoading) this.naoEncontrado = lista.length === 0 && this.igrejas.length > 0;
  }

  private _ordenar(lista: any[]): any[] {
    switch (this.ordenacaoAtiva) {
      case 'az':
        return [...lista].sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'));
      case 'za':
        return [...lista].sort((a, b) => (b.nome ?? '').localeCompare(a.nome ?? '', 'pt-BR'));
      case 'proxima-missa':
        return [...lista].sort((a, b) => this._minProximaMissa(a) - this._minProximaMissa(b));
      case 'proximidade':
        if (!this.temGeolocalizacao) return lista;
        return [...lista].sort((a, b) => {
          const dA = this.distanciaMetros(a) ?? Infinity;
          const dB = this.distanciaMetros(b) ?? Infinity;
          return dA - dB;
        });
      default:
        return lista;
    }
  }

  private _minProximaMissa(igreja: any): number {
    const diasFiltro = this._diasFiltroAtivos();
    const missas: any[] = (igreja.missas ?? []).filter((m: any) =>
      diasFiltro === null || diasFiltro.includes(m.diaSemana)
    );
    if (!missas.length) return Infinity;
    return Math.min(...missas.map((m) => getNextOccurrenceMinutes(m.diaSemana, m.horario)));
  }

  private _diasFiltroAtivos(): number[] | null {
    if (this.quickFilter === 'hoje') return [this.diaHoje];
    if (this.quickFilter === 'amanha') return [this.diaAmanha];
    if (this.quickFilter === 'fds') return [0, 6];
    if (this.diaAtivo !== null) return [this.diaAtivo];
    return null;
  }

  // ── Próxima missa do card ─────────────────────────────────────────────────

  proximaMissa(igreja: any): any | null {
    let candidatas: any[] = igreja.missas ?? [];
    if (!candidatas.length) return null;

    const diasFiltro = this._diasFiltroAtivos();
    if (diasFiltro) candidatas = candidatas.filter((m) => diasFiltro.includes(m.diaSemana));

    if (this.periodoAtivo && PERIODOS[this.periodoAtivo]) {
      const { de, ate } = PERIODOS[this.periodoAtivo];
      candidatas = candidatas.filter((m) => {
        const [h, min] = (m.horario ?? "").split(":").map(Number);
        const total = h * 60 + min;
        return total >= de && total <= ate;
      });
    }

    if (!candidatas.length) candidatas = igreja.missas ?? [];

    return candidatas.reduce((melhor: any, m: any) => {
      const min = getNextOccurrenceMinutes(m.diaSemana, m.horario);
      const melhorMin = getNextOccurrenceMinutes(melhor.diaSemana, melhor.horario);
      return min < melhorMin ? m : melhor;
    });
  }

  countdownLabel(m: any): string {
    return getCountdownLabel(m.diaSemana, m.horario);
  }

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }

  diaNome(dia: number): string {
    return ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][dia] ?? "";
  }

  ehUrgente(m: any): boolean {
    return getNextOccurrenceMinutes(m.diaSemana, m.horario) <= 180;
  }

  diaLabelRelativo(m: any): string {
    const min = getNextOccurrenceMinutes(m.diaSemana, m.horario);
    const alvo = new Date(Date.now() + min * 60_000);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dAlvo = new Date(alvo); dAlvo.setHours(0, 0, 0, 0);
    const diff = Math.round((dAlvo.getTime() - hoje.getTime()) / 86_400_000);
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanhã";
    return this.diaNome(m.diaSemana);
  }

  // ── Distância ─────────────────────────────────────────────────────────────

  distanciaMetros(igreja: any): number | null {
    if (this.userLat === null || this.userLng === null) return null;
    const lat2 = igreja.endereco?.latitude;
    const lng2 = igreja.endereco?.longitude;
    if (!lat2 || !lng2) return null;
    return this.haversine(this.userLat, this.userLng, lat2, lng2);
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private pedirGeolocalizacao(): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.userLat = pos.coords.latitude;
        this.userLng = pos.coords.longitude;
        if (this.ordenacaoAtiva === 'proximidade') this.aplicarFiltros();
      },
      () => {}
    );
  }

  // ── Ações ─────────────────────────────────────────────────────────────────

  comoChegar(igreja: any): void {
    const lat = igreja.endereco?.latitude;
    const lng = igreja.endereco?.longitude;
    const url = lat && lng
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(igreja.nome + ' ' + this.cidadeNome)}`;
    window.open(url, '_blank', 'noopener');
    this._analytics.getDirections(igreja.nome);
  }

  abrirMapaCidade(): void {
    const url = `https://www.google.com/maps/search/missa+${encodeURIComponent(this.cidadeNome)}+${this.uf.toUpperCase()}`;
    window.open(url, "_blank", "noopener");
  }

  linkParoquia(igreja: any): string[] {
    return ["/paroquia", this.uf, this.cidade, igreja.slug];
  }

  onChurchClick(igreja: any): void {
    this._analytics.resultClicked(igreja.nome, this.cidadeNome, this.uf);
  }

  // ── Favoritar ─────────────────────────────────────────────────────────────

  private _loadFavorita(): void {
    try {
      const raw = localStorage.getItem('buscamissa_favorita');
      if (raw) this.paroquiaFavoritaId = JSON.parse(raw)?.id ?? null;
    } catch { }
  }

  ehFavorita(ig: any): boolean {
    return this.paroquiaFavoritaId === ig.id;
  }

  toggleFavoritar(ig: any, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.ehFavorita(ig)) {
      localStorage.removeItem('buscamissa_favorita');
      this.paroquiaFavoritaId = null;
    } else {
      const data = {
        id: ig.id,
        nome: ig.nome,
        slug: ig.slug,
        cidadeSlug: this.cidade,
        uf: this.uf,
      };
      localStorage.setItem('buscamissa_favorita', JSON.stringify(data));
      this.paroquiaFavoritaId = ig.id;
      this._analytics.favoriteParishSaved(ig.nome);
    }
  }

  // ── Compartilhar ──────────────────────────────────────────────────────────

  compartilhar(): void {
    const title = `Missas em ${this.cidadeNome}/${this.uf.toUpperCase()} | BuscaMissa`;
    if (navigator.share) {
      navigator.share({ title, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href);
    }
  }

  // ── Dia da missa ──────────────────────────────────────────────────────────

  diasMissa(ig: any): string {
    const pm = this.proximaMissa(ig);
    if (!pm) return '';
    return this.diaNome(pm.diaSemana);
  }

  linkCidade(): string[] {
    return ["/missas", this.uf.toLowerCase(), this.cidade];
  }

  getSocialIcon(url: string): string {
    if (url.includes("facebook.com")) return "pi pi-facebook";
    if (url.includes("instagram.com")) return "pi pi-instagram";
    if (url.includes("youtube.com")) return "pi pi-youtube";
    if (url.includes("tiktok.com")) return "pi pi-tiktok";
    return "pi pi-globe";
  }

  // ── SEO ───────────────────────────────────────────────────────────────────

  private parseDiaSlug(slug?: string): number | null {
    if (!slug) return null;
    return DIAS.find((d) => d.slug === slug.toLowerCase())?.idx ?? null;
  }

  private aplicarBreadcrumbSchema(): void {
    const base = "https://buscamissa.com.br";
    this._seo.setJsonLd("breadcrumb", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: `${base}/home` },
        { "@type": "ListItem", position: 2, name: `${this.cidadeNome}/${this.uf.toUpperCase()}`, item: `${base}/missas/${this.uf}/${this.cidade}` },
      ],
    });
  }

  private montarFaqs(): void {
    const local = `${this.cidadeNome}/${this.uf.toUpperCase()}`;
    this.faqs = [
      { pergunta: `Que horas é a missa hoje em ${this.cidadeNome}?`, resposta: `Consulte nesta página os horários de missa das ${this.igrejas.length} paróquia(s) de ${local}, organizados por dia da semana.` },
      { pergunta: `Tem missa de domingo em ${this.cidadeNome}?`, resposta: `Sim. Diversas paróquias de ${local} celebram missas aos domingos. Veja a lista e os horários abaixo.` },
      { pergunta: `Como encontrar uma igreja católica perto de mim em ${this.cidadeNome}?`, resposta: `Listamos todas as paróquias e comunidades católicas de ${local} com endereço e horários atualizados pela comunidade.` },
    ];
  }

  private aplicarFaqSchema(): void {
    this._seo.setJsonLd("faq", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: this.faqs.map((f) => ({
        "@type": "Question",
        name: f.pergunta,
        acceptedAnswer: { "@type": "Answer", text: f.resposta },
      })),
    });
  }
}
