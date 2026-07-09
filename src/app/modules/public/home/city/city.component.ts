import { Component, DestroyRef, inject, OnDestroy, OnInit } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { finalize } from "rxjs/operators";
import { SkeletonModule } from "primeng/skeleton";
import { ChurchesService } from "../../../../core/services/churches.service";
import { distanciaMetrosAte } from "../../../../shared/utils/distance.utils";
import { CIDADES_POPULARES } from "../../../../core/constants/cidades-populares";
import { SeoService } from "../../../../core/services/seo.service";
import { getNextOccurrenceMinutes } from "../../../../shared/utils/mass-time.utils";
import { AnalyticsService } from "../../../../core/services/analytics.service";
import { FavoritesService } from "../../../../core/services/favorites.service";
import { ClarityService } from "../../../../core/services/clarity.service";
import { CityMapComponent, MapChurch } from "../../../../shared/components/city-map/city-map.component";
import { DIAS, PERIODOS } from "./city.constants";
import { CityFiltrosComponent, Ordenacao, QuickFilter } from "./sections/city-filtros/city-filtros.component";
import { CityCardComponent } from "./sections/city-card/city-card.component";
import { CityFaqComponent } from "./sections/city-faq/city-faq.component";
import { CityOutrasComponent } from "./sections/city-outras/city-outras.component";

/**
 * Página de cidade — orquestra carregamento, filtros/URL, SEO/Schema.org e tracking.
 * As seções visuais foram extraídas para ./sections (auditoria 2.x).
 */
@Component({
  selector: "app-city",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    SkeletonModule,
    CityMapComponent,
    CityFiltrosComponent,
    CityCardComponent,
    CityFaqComponent,
    CityOutrasComponent,
  ],
  templateUrl: "./city.component.html",
  styleUrl: "./city.component.scss",
})
export class CityComponent implements OnInit, OnDestroy {
  private _route = inject(ActivatedRoute);
  private _destroyRef = inject(DestroyRef);
  private _router = inject(Router);
  private _church = inject(ChurchesService);
  private _seo = inject(SeoService);
  private _analytics = inject(AnalyticsService);
  private _favorites = inject(FavoritesService);
  private _clarity = inject(ClarityService);

  isLoading = false;
  uf = "";
  cidade = "";
  cidadeNome = "";
  igrejas: any[] = [];
  igrejasFiltradas: any[] = [];
  trackByIgrejaId = (_: number, igreja: any): number => igreja.id;
  naoEncontrado = false;
  /** Erro de rede/API ao carregar — mostra estado com "Tentar novamente" (≠ cidade sem paróquias) */
  erroCarregar = false;
  faqs: { pergunta: string; resposta: string }[] = [];

  favoritasIds: number[] = [];

  // Filtros
  diaAtivo: number | null = null;
  periodoAtivo: string | null = null;
  quickFilter: QuickFilter | null = null;

  // UI
  mapVisible = false;

  // Ordenação
  ordenacaoAtiva: Ordenacao = 'proxima-missa';

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

  /** Cidades populares para links internos (exclui a cidade atual) — SEO/navegação */
  get cidadesRelacionadas(): { nome: string; uf: string; slug: string }[] {
    return CIDADES_POPULARES
      .filter((c) => !(c.slug === this.cidade && c.uf.toLowerCase() === this.uf?.toLowerCase()))
      .slice(0, 8);
  }

  ngOnInit(): void {
    this._route.params.pipe(takeUntilDestroyed(this._destroyRef)).subscribe((params) => {
      this.uf = params["uf"];
      this.cidade = params["cidade"];
      this.cidadeNome = this.cidade
        .split('-')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      this._route.queryParams.pipe(takeUntilDestroyed(this._destroyRef)).subscribe((qp) => {
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
    this.erroCarregar = false;
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

        // Tags Clarity de contexto
        this._clarity.tag('cidade', this.cidadeNome);
        this._clarity.tag('estado', this.uf?.toUpperCase());
        this._clarity.tag('qtd_resultados', String(this.igrejas.length));

        // Marca o momento da busca para medir tempo até encontrar uma missa
        localStorage.setItem('bm_ts_busca', String(Date.now()));

        if (this.igrejas.length === 0) {
          this.naoEncontrado = true;
          this._clarity.track('nenhum_resultado', {
            cidade: this.cidadeNome,
            estado: this.uf?.toUpperCase(),
          });
        }

        const ufUpper = this.uf?.toUpperCase();
        const totalIgrejas = this.igrejas.length;
        const descFallback = totalIgrejas
          ? `Veja horários de missa de ${totalIgrejas} ${totalIgrejas === 1 ? 'paróquia' : 'paróquias'} em ${this.cidadeNome}/${ufUpper}. Encontre a missa mais próxima por dia, horário e bairro no BuscaMissa.`
          : `Horários de missa em ${this.cidadeNome}/${ufUpper}. Encontre missas perto de você no BuscaMissa.`;
        this._seo.update({
          title: seo?.title ?? `Missas em ${this.cidadeNome}/${ufUpper} — Horários atualizados | BuscaMissa`,
          description: seo?.description ?? descFallback,
          canonical: seo?.canonicalUrl,
        });

        if (this.igrejas.length) {
          this.aplicarBreadcrumbSchema();
          this.montarFaqs();
          this.aplicarFaqSchema();
        }
      },
      error: () => {
        // Erro de rede/API ≠ "cidade sem paróquias": estado próprio com retry
        this.erroCarregar = true;
        this._seo.update({ title: `Missas em ${this.cidade}/${this.uf?.toUpperCase()} | BuscaMissa` });
      },
    });
  }

  ngOnDestroy(): void {
    this._seo.removeJsonLd("breadcrumb");
    this._seo.removeJsonLd("faq");
  }

  // ── Quick filters ─────────────────────────────────────────────────────────

  setQuickFilter(f: QuickFilter | null): void {
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

  setOrdenacao(o: Ordenacao): void {
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

  // ── Distância ─────────────────────────────────────────────────────────────

  distanciaMetros(igreja: any): number | null {
    return distanciaMetrosAte(
      this.userLat,
      this.userLng,
      igreja.endereco?.latitude,
      igreja.endereco?.longitude
    );
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

  onChurchClick(igreja: any): void {
    this._analytics.resultClicked(igreja.nome, this.cidadeNome, this.uf);
  }

  // ── Favoritar ─────────────────────────────────────────────────────────────

  private _loadFavorita(): void {
    this.favoritasIds = this._favorites.listar().map((f) => f.id);
  }

  ehFavorita(ig: any): boolean {
    return this.favoritasIds.includes(ig.id);
  }

  toggleFavoritar(ig: any): void {
    const pm = ig.proximaMissa ?? (ig.missas && ig.missas[0]) ?? null;
    const agoraFavorita = this._favorites.alternar({
      id: ig.id,
      nome: ig.nome,
      uf: this.uf?.toLowerCase(),
      cidadeSlug: this.cidade,
      slug: ig.slug,
      nomeUnico: ig.nomeUnico,
      diaSemana: pm?.diaSemana,
      horario: pm?.horario,
    });

    if (agoraFavorita) {
      this.favoritasIds = [...this.favoritasIds, ig.id];
      this._analytics.favoriteParishSaved(ig.nome);
    } else {
      this.favoritasIds = this.favoritasIds.filter((id) => id !== ig.id);
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
