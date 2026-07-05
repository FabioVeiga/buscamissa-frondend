import { Component, DestroyRef, inject, OnInit } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { finalize } from "rxjs/operators";
import { ChurchesService } from "../../../../core/services/churches.service";
import { SeoService } from "../../../../core/services/seo.service";
import { SkeletonModule } from "primeng/skeleton";
import { MessageService } from "primeng/api";
import { PrimeNgModule } from "../../../../shared/primeng.module";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Mass } from "../../church/models/church.model";
import { getNextOccurrenceMinutes } from "../../../../shared/utils/mass-time.utils";
import { AnalyticsService } from "../../../../core/services/analytics.service";
import { ClarityService } from "../../../../core/services/clarity.service";
import { RedesSociaisService, TipoRedeSocial } from "../../../../core/services/redes-sociais.service";
import { MetricasService } from "../../../../core/services/metricas.service";
import { FavoritesService } from "../../../../core/services/favorites.service";
import { NavigationHistoryService } from "../../../../core/services/navigation-history.service";
import { DetailsHeaderComponent } from "./sections/details-header/details-header.component";
import { DetailsScoreboardComponent } from "./sections/details-scoreboard/details-scoreboard.component";
import { DetailsHorariosComponent } from "./sections/details-horarios/details-horarios.component";
import { DetailsConfirmarComponent } from "./sections/details-confirmar/details-confirmar.component";
import { DetailsComoChegarComponent } from "./sections/details-como-chegar/details-como-chegar.component";
import { DetailsContatoComponent } from "./sections/details-contato/details-contato.component";
import { DetailsReportarModalComponent } from "./sections/details-reportar-modal/details-reportar-modal.component";

/**
 * Página da paróquia — orquestra o carregamento, SEO/Schema.org e tracking.
 * As seções visuais foram extraídas para ./sections (auditoria 2.x).
 */
@Component({
  selector: "app-details",
  imports: [
    PrimeNgModule,
    CommonModule,
    SkeletonModule,
    RouterLink,
    DetailsHeaderComponent,
    DetailsScoreboardComponent,
    DetailsHorariosComponent,
    DetailsConfirmarComponent,
    DetailsComoChegarComponent,
    DetailsContatoComponent,
    DetailsReportarModalComponent,
  ],
  providers: [MessageService],
  templateUrl: "./details.component.html",
  styleUrl: "./details.component.scss",
})
export class DetailsComponent implements OnInit {
  _toast = inject(MessageService);
  _church = inject(ChurchesService);
  _seo = inject(SeoService);
  _route = inject(ActivatedRoute);
  private _destroyRef = inject(DestroyRef);
  _router = inject(Router);
  _navHistory = inject(NavigationHistoryService);
  private _analytics = inject(AnalyticsService);
  private _favorites = inject(FavoritesService);
  private _clarity = inject(ClarityService);
  private _redesSociais = inject(RedesSociaisService);
  private _metricas = inject(MetricasService);

  tiposRedeSocial: TipoRedeSocial[] = [];
  isLoading = false;
  nomeUnico: string | null = null;
  churchInfo: any;

  // Favorito
  isFavorita = false;

  // Reportar problema
  modalReportarProblemaVisible = false;

  ngOnInit(): void {
    this._redesSociais.obterTipos().subscribe((tipos) => (this.tiposRedeSocial = tipos));

    this._route.params.pipe(takeUntilDestroyed(this._destroyRef)).subscribe((params) => {
      const uf = params["uf"];
      const cidade = params["cidade"];
      const slug = params["slug"];
      this.nomeUnico = params["nomeUnico"] ?? null;

      if (uf && cidade && slug) {
        // Rota canônica nova: /paroquia/:uf/:cidade/:slug
        this.carregar(this._church.getByCidadeESlug(uf, cidade, slug));
      } else if (this.nomeUnico) {
        // Rota legada: /igrejas/:nomeUnico
        this.carregar(this._church.getByNomeUnico(this.nomeUnico));
      }
    });
  }

  private carregar(req: import("rxjs").Observable<any>): void {
    this.isLoading = true;
    req.pipe(
      finalize(() => { this.isLoading = false; })
    ).subscribe({
      next: (response: any) => {
        const igreja = response?.data?.igreja ?? response?.data;
        const seo = response?.data?.seo;
        this.churchInfo = igreja;

        if (!igreja) {
          this._toast.add({ severity: "error", summary: "Erro", detail: "Dados da igreja não encontrados." });
          this._router.navigate(['/home']);
          return;
        }

        this._loadFavoritaState();
        this._analytics.churchView(igreja.nome, igreja.endereco?.localidade ?? '', igreja.endereco?.uf ?? '');
        if (igreja.id) this._metricas.registrarVisualizacaoIgreja(igreja.id);
        this._aplicarClarityTags(igreja);

        const cidadeUf = igreja.endereco?.localidade
          ? `${igreja.endereco.localidade}${igreja.endereco?.uf ? '/' + igreja.endereco.uf : ''}`
          : '';
        this._seo.update({
          title: seo?.title ?? (cidadeUf
            ? `${igreja.nome} — Missas em ${cidadeUf} | BuscaMissa`
            : `${igreja.nome} — Horários de Missa | BuscaMissa`),
          description: seo?.description ?? `Confira os horários de missa, endereço e contato da ${igreja.nome}${cidadeUf ? ' em ' + cidadeUf : ''}. Encontre missas perto de você no BuscaMissa.`,
          canonical: seo?.canonicalUrl,
        });
        this.aplicarBreadcrumbSchema(igreja);
        this.aplicarPlaceSchema(igreja);
      },
      error: (error) => {
        this._toast.add({ severity: "error", summary: "Erro", detail: "Erro ao carregar dados da igreja." });
      },
    });
  }

  // ── Clarity ────────────────────────────────────────────────────────────────

  private _aplicarClarityTags(igreja: any): void {
    const end = igreja.endereco ?? {};
    const missas: any[] = igreja.missas ?? [];
    const redes: any[] = igreja.redesSociais ?? [];
    const contato = igreja.contato ?? {};

    const temFoto = !!igreja.imagemUrl;
    const temTelefone = !!(contato.telefone || contato.telefoneWhatsApp);
    const temSite = !!contato.site;
    const temInstagram = redes.some((r: any) => r.tipoRedeSocial === 2);
    const temFacebook = redes.some((r: any) => r.tipoRedeSocial === 1);
    const qtdMissas = missas.length;
    const dadosCompletos = temFoto && qtdMissas > 0 && temTelefone;

    this._clarity.tag('cidade', end.localidade ?? '');
    this._clarity.tag('estado', end.uf ?? '');
    this._clarity.tag('igrejaId', String(igreja.id ?? ''));
    this._clarity.tag('tipo_igreja', igreja.tipo ?? 'desconhecido');
    this._clarity.tag('paroquia_ou_nao', (igreja.tipo ?? '') === 'Paróquia' ? 'sim' : 'nao');
    this._clarity.tag('tem_foto', temFoto ? 'sim' : 'nao');
    this._clarity.tag('tem_telefone', temTelefone ? 'sim' : 'nao');
    this._clarity.tag('tem_site', temSite ? 'sim' : 'nao');
    this._clarity.tag('tem_instagram', temInstagram ? 'sim' : 'nao');
    this._clarity.tag('tem_facebook', temFacebook ? 'sim' : 'nao');
    this._clarity.tag('possui_missas', qtdMissas > 0 ? 'sim' : 'nao');
    this._clarity.tag('possui_redes', (temInstagram || temFacebook) ? 'sim' : 'nao');
    this._clarity.tag('qtd_missas', String(qtdMissas));
    this._clarity.tag('dados_completos', dadosCompletos ? 'sim' : 'nao');
    this._clarity.tag('origem_navegacao', this._clarity.navOrigem(''));

    // Tempo decorrido desde a busca inicial
    const ts = Number(localStorage.getItem('bm_ts_busca'));
    if (ts > 0) {
      const segundos = Math.round((Date.now() - ts) / 1000);
      if (segundos > 0 && segundos < 600) {
        this._clarity.track('tempo_para_encontrar', { segundos });
      }
      localStorage.removeItem('bm_ts_busca');
    }
  }

  trackObjetivoAlcancado(acao: string): void {
    const igreja = this.churchInfo;
    this._clarity.track('objetivo_alcancado', {
      acao,
      igrejaId: String(igreja?.id ?? ''),
      cidade: igreja?.endereco?.localidade ?? '',
    });
  }

  // ── Próxima missa ──────────────────────────────────────────────────────────

  /** Próxima missa que vai acontecer (menor tempo até o início) */
  get proximaMissa(): Mass | null {
    const missas: Mass[] = this.churchInfo?.missas ?? [];
    if (!missas.length) return null;
    return missas.reduce((melhor, m) => {
      const min = getNextOccurrenceMinutes(m.diaSemana!, m.horario);
      const melhorMin = getNextOccurrenceMinutes(melhor.diaSemana!, melhor.horario);
      return min < melhorMin ? m : melhor;
    });
  }

  // ── Favorito ───────────────────────────────────────────────────────────────

  private _loadFavoritaState(): void {
    this.isFavorita = this.churchInfo?.id != null && this._favorites.isFavorita(this.churchInfo.id);
  }

  toggleFavorita(): void {
    if (!this.churchInfo?.id) return;

    const id = this.churchInfo.id;
    const pm = this.proximaMissa;
    const end = this.churchInfo.endereco ?? {};
    this.isFavorita = this._favorites.alternar({
      id,
      nome: this.churchInfo.nome,
      uf: (end.uf ?? '').toLowerCase(),
      cidadeSlug: end.cidadeSlug,
      slug: this.churchInfo.slug,
      diaSemana: pm?.diaSemana,
      horario: pm?.horario,
    });

    if (this.isFavorita) {
      this._analytics.favoriteParishSaved(this.churchInfo.nome);
      this.trackObjetivoAlcancado('favoritar');
      this._metricas.registrarFavorito(id);
      this._toast.add({ severity: 'success', summary: 'Adicionada aos favoritos!', detail: this.churchInfo.nome });
    } else {
      this._toast.add({ severity: 'info', summary: 'Removida dos favoritos', detail: this.churchInfo.nome });
    }
  }

  // ── Navegação / compartilhamento / tracking ────────────────────────────────

  trackDirections(): void {
    this._analytics.getDirections(this.churchInfo?.nome ?? '');
    this.trackObjetivoAlcancado('tracar_rota');
    if (this.churchInfo?.id) this._metricas.registrarCliqueRota(this.churchInfo.id);
  }

  get shareUrl(): string {
    const base = 'https://buscamissa.com.br';
    const ig = this.churchInfo;
    const end = ig?.endereco;
    const uf = end?.uf?.toLowerCase();
    if (uf && end?.cidadeSlug && ig?.slug)
      return `${base}/paroquia/${uf}/${end.cidadeSlug}/${ig.slug}`;
    return `${base}/igrejas/${ig?.nomeUnico}`;
  }

  linkCidade(): string[] {
    const uf = this.churchInfo?.endereco?.uf;
    const cidadeSlug = this.churchInfo?.endereco?.cidadeSlug;
    if (uf && cidadeSlug) return ["/missas", uf.toLowerCase(), cidadeSlug];
    return ["/home"];
  }

  private getSocialTrackName(url: string): string {
    if (url.includes('facebook.com')) return 'facebook';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('youtube.com')) return 'youtube';
    if (url.includes('tiktok.com')) return 'tiktok';
    return 'rede_social';
  }

  trackSocialClick(url: string): void {
    this.trackObjetivoAlcancado(this.getSocialTrackName(url));
    if (url.includes('instagram.com') && this.churchInfo?.id)
      this._metricas.registrarCliqueInstagram(this.churchInfo.id);
  }

  trackCliqueTelefone(): void {
    if (this.churchInfo?.id) this._metricas.registrarCliqueTelefone(this.churchInfo.id);
  }

  voltar(): void {
    const anterior = this._navHistory.previousUrl;
    this._router.navigateByUrl(anterior ?? "/home");
  }

  /** Compartilhar: usa a API nativa quando disponível, senão copia o link */
  compartilhar(): void {
    const url = this.shareUrl;
    const nav = navigator as any;
    this.trackObjetivoAlcancado('compartilhar');
    if (this.churchInfo?.id) this._metricas.registrarCompartilhamento(this.churchInfo.id);
    if (nav.share) {
      nav.share({ title: this.churchInfo?.nome, text: `Horários de missa — ${this.churchInfo?.nome}`, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      this._toast.add({ severity: "success", summary: "Link copiado!", detail: "Cole onde quiser para compartilhar." });
    }
  }

  scrollToHorarios(): void {
    document.getElementById("horarios")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  reportarErro(): void {
    if (this.churchInfo?.id) {
      this._analytics.userContribution('report', this.churchInfo.nome);
      this._metricas.registrarSugestaoEdicao(this.churchInfo.id);
      this._router.navigate(['/editar', this.churchInfo.id]);
    }
  }

  abrirModalReportarProblema(): void {
    this.modalReportarProblemaVisible = true;
  }

  // ── SEO / Schema.org ────────────────────────────────────────────────────────

  // Próxima ocorrência futura em ISO 8601 com fuso de Brasília (-03:00)
  private proximaOcorrencia(diaSemana: number, horaMin: string): string {
    const [h, m] = (horaMin || "00:00").split(":").map(Number);
    const agora = new Date();
    const diasAte = (diaSemana - agora.getDay() + 7) % 7;
    const d = new Date(agora);
    d.setDate(agora.getDate() + diasAte);
    d.setHours(h, m, 0, 0);
    if (diasAte === 0 && d.getTime() <= agora.getTime()) d.setDate(d.getDate() + 7);
    return this.toIsoBrasilia(d);
  }

  private somarHora(iso: string, horas: number): string {
    const d = new Date(iso);
    d.setHours(d.getHours() + horas);
    return this.toIsoBrasilia(d);
  }

  private toIsoBrasilia(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00-03:00`;
  }

  private aplicarPlaceSchema(igreja: any): void {
    const base = "https://buscamissa.com.br";
    const end = igreja?.endereco ?? {};
    const uf = end.uf?.toLowerCase();
    const url = (uf && end.cidadeSlug && igreja.slug)
      ? `${base}/paroquia/${uf}/${end.cidadeSlug}/${igreja.slug}`
      : `${base}/igrejas/${igreja.nomeUnico}`;

    const address = {
      "@type": "PostalAddress",
      streetAddress: [end.logradouro, end.numero && end.numero !== 0 ? end.numero : null]
        .filter(Boolean).join(", "),
      addressLocality: end.localidade,
      addressRegion: end.uf,
      postalCode: end.cep,
      addressCountry: "BR",
    };

    const dias = [
      "https://schema.org/Sunday", "https://schema.org/Monday", "https://schema.org/Tuesday",
      "https://schema.org/Wednesday", "https://schema.org/Thursday", "https://schema.org/Friday",
      "https://schema.org/Saturday",
    ];

    const eventos = (igreja.missas ?? [])
      .filter((m: any) => m.diaSemana !== undefined && m.diaSemana !== null && dias[m.diaSemana])
      .map((m: any) => {
        const hora = (m.horario ?? "").slice(0, 5);
        const diaNome = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"][m.diaSemana];
        const inicio = this.proximaOcorrencia(m.diaSemana, hora);
        const fim = this.somarHora(inicio, 1);
        const ev: any = {
          "@type": "Event",
          name: `Missa - ${diaNome}`,
          startDate: inicio,
          endDate: fim,
          eventSchedule: {
            "@type": "Schedule",
            byDay: dias[m.diaSemana],
            startTime: hora,
            repeatFrequency: "P1W",
          },
          eventStatus: "https://schema.org/EventScheduled",
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          location: { "@type": "Church", name: igreja.nome, address },
          description: `Missa ${diaNome.toLowerCase()} às ${hora} na ${igreja.nome}, ${end.localidade}/${end.uf}.`,
          organizer: { "@type": "Organization", name: igreja.nome },
          performer: igreja.paroco
            ? { "@type": "Person", name: igreja.paroco }
            : { "@type": "Organization", name: igreja.nome },
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "BRL",
            availability: "https://schema.org/InStock",
            url,
          },
        };
        ev.image = igreja.imagemUrl || `${base}/assets/images/og-image.jpg`;
        return ev;
      });

    const place: any = {
      "@context": "https://schema.org",
      "@type": "Church",
      name: igreja.nome,
      url,
      address,
    };
    if (igreja.paroco) place.description = `Pároco: ${igreja.paroco}`;
    if (end.latitude && end.longitude) {
      place.geo = { "@type": "GeoCoordinates", latitude: end.latitude, longitude: end.longitude };
    }
    if (igreja.contato?.telefone) {
      place.telephone = `+55${igreja.contato.ddd ?? ""}${igreja.contato.telefone}`;
    }
    if (igreja.imagemUrl) place.image = igreja.imagemUrl;
    if (eventos.length) place.event = eventos;

    this._seo.setJsonLd("place", place);
  }

  private aplicarBreadcrumbSchema(igreja: any): void {
    const base = "https://buscamissa.com.br";
    const uf = igreja?.endereco?.uf?.toLowerCase();
    const cidadeSlug = igreja?.endereco?.cidadeSlug;
    const itens: any[] = [
      { "@type": "ListItem", position: 1, name: "Início", item: `${base}/home` },
    ];
    if (uf && cidadeSlug) {
      itens.push({
        "@type": "ListItem",
        position: 2,
        name: `${igreja.endereco.localidade}/${igreja.endereco.uf}`,
        item: `${base}/missas/${uf}/${cidadeSlug}`,
      });
      itens.push({ "@type": "ListItem", position: 3, name: igreja.nome });
    } else {
      itens.push({ "@type": "ListItem", position: 2, name: igreja.nome });
    }
    this._seo.setJsonLd("breadcrumb", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: itens,
    });
  }
}
