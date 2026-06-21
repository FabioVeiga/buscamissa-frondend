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
import { getNextOccurrenceMinutes, formatMassTime } from "../../../../shared/utils/mass-time.utils";
import { AnalyticsService } from "../../../../core/services/analytics.service";

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
    CountdownChipComponent,
    DistanceChipComponent,
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

  /** Ids de igrejas cuja foto falhou ao carregar — caem no placeholder */
  imagensQuebradas = new Set<number>();

  // Filtros ativos
  diaAtivo: number | null = null;
  periodoAtivo: string | null = null;

  // Ordenação
  ordenacaoAtiva: 'az' | 'za' | 'proximidade' | 'proxima-missa' = 'az';

  // Geolocalização
  userLat: number | null = null;
  userLng: number | null = null;

  get temGeolocalizacao(): boolean {
    return this.userLat !== null && this.userLng !== null;
  }

  readonly dias = DIAS;
  readonly periodos = Object.entries(PERIODOS).map(([slug, v]) => ({ slug, label: v.label }));

  ngOnInit(): void {
    this._route.params.subscribe((params) => {
      this.uf = params["uf"];
      this.cidade = params["cidade"];

      // Inicializa o nome da cidade imediatamente a partir do slug (evita "Missas em /SP" no header)
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

  // ── Filtros ──────────────────────────────────────────────────────────────────

  setDia(idx: number): void {
    this.diaAtivo = idx;
    const slug = DIAS.find((d) => d.idx === idx)?.slug ?? null;
    this._router.navigate([], {
      queryParams: { dia: slug, periodo: this.periodoAtivo },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
    this.aplicarFiltros();
  }

  setPeriodo(slug: string): void {
    this.periodoAtivo = slug;
    this._router.navigate([], {
      queryParams: { dia: this.diaAtivo !== null ? DIAS.find((d) => d.idx === this.diaAtivo)?.slug : null, periodo: slug },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
    this.aplicarFiltros();
  }

  limparFiltros(): void {
    this.diaAtivo = null;
    this.periodoAtivo = null;
    this._router.navigate([], { queryParams: {}, replaceUrl: true });
    this.aplicarFiltros();
  }

  setOrdenacao(o: 'az' | 'za' | 'proximidade' | 'proxima-missa'): void {
    this.ordenacaoAtiva = o;
    this.aplicarFiltros();
  }

  get temFiltroAtivo(): boolean {
    return this.diaAtivo !== null || this.periodoAtivo !== null;
  }

  private aplicarFiltros(): void {
    let lista = [...this.igrejas];

    if (this.diaAtivo !== null) {
      lista = lista.filter((ig) =>
        ig.missas?.some((m: any) => m.diaSemana === this.diaAtivo)
      );
    }

    if (this.periodoAtivo && PERIODOS[this.periodoAtivo]) {
      const { de, ate } = PERIODOS[this.periodoAtivo];
      lista = lista.filter((ig) =>
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
        return [...lista].sort((a, b) => {
          const minA = this._minProximaMissa(a);
          const minB = this._minProximaMissa(b);
          return minA - minB;
        });
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
    const missas: any[] = igreja.missas ?? [];
    if (!missas.length) return Infinity;
    return Math.min(...missas.map((m) => getNextOccurrenceMinutes(m.diaSemana, m.horario)));
  }

  // ── Próxima missa do card ─────────────────────────────────────────────────

  proximaMissa(igreja: any): any | null {
    let candidatas: any[] = igreja.missas ?? [];
    if (!candidatas.length) return null;

    // Respeita o filtro de dia: destaca a próxima missa daquele dia
    if (this.diaAtivo !== null)
      candidatas = candidatas.filter((m) => m.diaSemana === this.diaAtivo);

    // Respeita o filtro de período: destaca a próxima missa daquela faixa de horário
    if (this.periodoAtivo && PERIODOS[this.periodoAtivo]) {
      const { de, ate } = PERIODOS[this.periodoAtivo];
      candidatas = candidatas.filter((m) => {
        const [h, min] = (m.horario ?? "").split(":").map(Number);
        const total = h * 60 + min;
        return total >= de && total <= ate;
      });
    }

    if (!candidatas.length) return null;

    return candidatas.reduce((melhor: any, m: any) => {
      const min = getNextOccurrenceMinutes(m.diaSemana, m.horario);
      const melhorMin = getNextOccurrenceMinutes(melhor.diaSemana, melhor.horario);
      return min < melhorMin ? m : melhor;
    });
  }

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }

  diaNome(dia: number): string {
    return ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][dia] ?? "";
  }

  /** Contador só quando há urgência real (até 3h) — senão mostra só o dia */
  ehUrgente(m: any): boolean {
    return getNextOccurrenceMinutes(m.diaSemana, m.horario) <= 180;
  }

  /** Rótulo relativo do dia, sem horário: "Hoje" / "Amanhã" / "Domingo" */
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
        // Reordena se o usuário já escolheu "por proximidade" antes da geoloc chegar
        if (this.ordenacaoAtiva === 'proximidade') this.aplicarFiltros();
      },
      () => { /* silencioso — distância é opcional */ }
    );
  }

  // ── Mapa ──────────────────────────────────────────────────────────────────

  abrirMapa(): void {
    const url = `https://www.google.com/maps/search/missa+${encodeURIComponent(this.cidadeNome)}+${this.uf.toUpperCase()}`;
    window.open(url, "_blank", "noopener");
  }

  linkParoquia(igreja: any): string[] {
    return ["/paroquia", this.uf, this.cidade, igreja.slug];
  }

  onChurchClick(igreja: any): void {
    this._analytics.resultClicked(igreja.nome, this.cidadeNome, this.uf);
  }

  linkCidade(): string[] {
    return ["/missas", this.uf.toLowerCase(), this.cidade];
  }

  // ── SEO helpers ───────────────────────────────────────────────────────────

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
        {
          "@type": "ListItem",
          position: 2,
          name: `${this.cidadeNome}/${this.uf.toUpperCase()}`,
          item: `${base}/missas/${this.uf}/${this.cidade}`,
        },
      ],
    });
  }

  private montarFaqs(): void {
    const local = `${this.cidadeNome}/${this.uf.toUpperCase()}`;
    this.faqs = [
      {
        pergunta: `Que horas é a missa hoje em ${this.cidadeNome}?`,
        resposta: `Consulte nesta página os horários de missa das ${this.igrejas.length} paróquia(s) de ${local}, organizados por dia da semana.`,
      },
      {
        pergunta: `Tem missa de domingo em ${this.cidadeNome}?`,
        resposta: `Sim. Diversas paróquias de ${local} celebram missas aos domingos. Veja a lista e os horários abaixo.`,
      },
      {
        pergunta: `Como encontrar uma igreja católica perto de mim em ${this.cidadeNome}?`,
        resposta: `Listamos todas as paróquias e comunidades católicas de ${local} com endereço e horários atualizados pela comunidade.`,
      },
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

  getSocialIcon(url: string): string {
    if (url.includes("facebook.com")) return "pi pi-facebook";
    if (url.includes("instagram.com")) return "pi pi-instagram";
    if (url.includes("youtube.com")) return "pi pi-youtube";
    if (url.includes("tiktok.com")) return "pi pi-tiktok";
    return "pi pi-globe";
  }
}
