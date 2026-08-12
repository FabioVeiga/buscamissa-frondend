import { Component, DestroyRef, inject, OnInit, PLATFORM_ID } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { finalize } from "rxjs/operators";
import { ChurchesService } from "../../../../core/services/churches.service";
import { SeoService } from "../../../../core/services/seo.service";
import { SkeletonModule } from "primeng/skeleton";
import { MessageService } from "primeng/api";
import { PrimeNgModule } from "../../../../shared/primeng.module";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
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
import { ResponsavelService } from "../../../../core/services/responsavel.service";
import { AuthService } from "../../../../core/services/auth.service";
import { LoggerService } from "../../../../core/services/logger.service";

/**
 * Página da paróquia — orquestra o carregamento, SEO/Schema.org e tracking.
 * As seções visuais foram extraídas para ./sections (auditoria 2.x).
 */
@Component({
  selector: "app-details",
  imports: [
    PrimeNgModule,
    CommonModule,
    FormsModule,
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
  private _responsavel = inject(ResponsavelService);
  private _auth = inject(AuthService);
  private _logger = inject(LoggerService);
  /** No prerender (server) roda sem browser-APIs — ver ngOnInit/carregar. */
  private _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  tiposRedeSocial: TipoRedeSocial[] = [];
  isLoading = false;
  nomeUnico: string | null = null;
  churchInfo: any;
  /** Erro de rede/API ao carregar — mostra estado com "Tentar novamente" */
  erroCarregar = false;
  /** Última requisição (cold observable do HttpClient) — reusada pelo retry */
  private _reqAtual: import("rxjs").Observable<any> | null = null;

  // Favorito
  isFavorita = false;

  // Reportar problema
  modalReportarProblemaVisible = false;

  // Sessões de atendimento/confissão (Feature B)
  private static readonly DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  get sessoesSecretaria(): any[] {
    return (this.churchInfo?.sessoes ?? []).filter((s: any) => s.tipo === 1);
  }
  get sessoesConfissao(): any[] {
    return (this.churchInfo?.sessoes ?? []).filter((s: any) => s.tipo === 2);
  }
  diaCurto(dia: number): string {
    return DetailsComponent.DIAS_CURTOS[dia] ?? "";
  }

  // Responsável Verificado (Fase 5)
  igrejaVerificada = false;
  modalResponsavelVisible = false;
  solicitacaoEnviando = false;
  solicitacaoCargo = "";
  solicitacaoObservacao = "";

  ngOnInit(): void {
    // Browser-only: no prerender o injector é recriado por rota, então este GET a
    // v1/RedeSocial/tipos dispararia 1x POR paróquia (~4.4k chamadas → 429). Os tipos
    // só alimentam os links de rede social (interativos), que hidratam no cliente.
    // O error handler garante que uma falha aqui nunca quebre a página.
    if (this._isBrowser) {
      this._redesSociais.obterTipos().subscribe({
        next: (tipos) => (this.tiposRedeSocial = tipos),
        error: () => {},
      });
    }

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

  private _carregarSeloVerificado(igrejaId: number | undefined): void {
    this.igrejaVerificada = false;
    if (!igrejaId) return;
    this._responsavel.igrejaVerificada(igrejaId).subscribe({
      next: (verificada) => (this.igrejaVerificada = verificada),
      error: () => {}, // selo é informativo — falha não pode quebrar a página
    });
  }

  /** Botão "Sou o responsável": exige login; logado abre o modal de solicitação. */
  abrirSolicitacaoResponsavel(): void {
    if (!this._auth.estaLogado) {
      this._toast.add({
        severity: "info",
        summary: "Faça login",
        detail: "Entre (ou crie sua senha) para solicitar a gestão desta igreja.",
      });
      this._router.navigate(["/entrar"]);
      return;
    }
    this.solicitacaoCargo = "";
    this.solicitacaoObservacao = "";
    this.modalResponsavelVisible = true;
  }

  /** Fase 4: Redireciona usuário logado para formulário de cadastro com dados pré-preenchidos */
  solicitarResponsabilidadeLogado(): void {
    if (this.nomeUnico) {
      this._router.navigate(["/nova"], { queryParams: { nomeUnico: this.nomeUnico } });
    }
  }

  enviarSolicitacaoResponsavel(): void {
    if (!this.churchInfo?.id) return;
    this.solicitacaoEnviando = true;
    this._responsavel
      .solicitar(this.churchInfo.id, {
        cargoInformado: this.solicitacaoCargo?.trim() || undefined,
        observacao: this.solicitacaoObservacao?.trim() || undefined,
      })
      .subscribe({
        next: (mensagem) => {
          this.modalResponsavelVisible = false;
          this._toast.add({ severity: "success", summary: "Solicitação enviada", detail: mensagem });
        },
        error: (error) => {
          this.solicitacaoEnviando = false;
          this._toast.add({
            severity: "error",
            summary: "Não foi possível enviar",
            detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
          });
          this._logger.logError(error, "details:solicitar-responsavel");
        },
        complete: () => (this.solicitacaoEnviando = false),
      });
  }

  /** Refaz a última requisição após um erro de carregamento. */
  tentarNovamente(): void {
    if (this._reqAtual) this.carregar(this._reqAtual);
  }

  private carregar(req: import("rxjs").Observable<any>): void {
    this._reqAtual = req;
    this.isLoading = true;
    this.erroCarregar = false;
    // SWR: com o interceptor de TransferState, `next` roda 2x (cache prerenderizado,
    // depois a revalidação viva). Reatribuir o dado é idempotente; os efeitos ÚNICOS
    // (analytics/métricas/selo) só podem rodar na 1ª emissão.
    let primeira = true;
    req.pipe(
      finalize(() => { this.isLoading = false; })
    ).subscribe({
      next: (response: any) => {
        const igreja = response?.data?.igreja ?? response?.data;
        const seo = response?.data?.seo;

        if (!igreja) {
          this.churchInfo = igreja;
          this._toast.add({ severity: "error", summary: "Erro", detail: "Dados da igreja não encontrados." });
          this._router.navigate(['/home']);
          return;
        }

        // Comparação por REFERÊNCIA (não por campo): a resposta da rede é sempre um
        // objeto novo → normalmente reconcilia; só pula se vier a MESMA instância.
        const mudou = this.churchInfo !== igreja;
        if (mudou) this.churchInfo = igreja;

        if (primeira) {
          this._loadFavoritaState();
          this._analytics.churchView(igreja.nome, igreja.endereco?.localidade ?? '', igreja.endereco?.uf ?? '');
          if (igreja.id) this._metricas.registrarVisualizacaoIgreja(igreja.id);

          // Browser-only: no prerender (server) o selo dispararia ~4.4k GETs a
          // v1/responsavel/... (risco de 429) e _aplicarClarityTags lê localStorage
          // (quebra no server). Ambos são informativos e hidratam no cliente.
          if (this._isBrowser) {
            this._carregarSeloVerificado(igreja.id);
            this._aplicarClarityTags(igreja);
          }
          primeira = false;
        }

        if (!mudou) return; // SEO/schema idênticos — nada a reaplicar

        const cidadeUf = igreja.endereco?.localidade
          ? `${igreja.endereco.localidade}${igreja.endereco?.uf ? '/' + igreja.endereco.uf : ''}`
          : '';
        this._seo.update({
          title: seo?.title ?? (cidadeUf
            ? `${igreja.nome} — Missas em ${cidadeUf} | BuscaMissa`
            : `${igreja.nome} — Horários de Missa | BuscaMissa`),
          description: seo?.description ?? `Confira os horários de missa, endereço e contato da ${igreja.nome}${cidadeUf ? ' em ' + cidadeUf : ''}. Encontre missas perto de você no BuscaMissa.`,
          canonical: seo?.canonicalUrl,
          image: igreja.imagemUrl || undefined,
        });
        this.aplicarBreadcrumbSchema(igreja);
        this.aplicarPlaceSchema(igreja);
      },
      error: () => {
        // Estado de erro na página (com retry) — toast some e deixava a tela em branco
        this.erroCarregar = true;
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
      nomeUnico: this.churchInfo.nomeUnico,
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

  /**
   * Fim presumido de uma missa: início + DURACAO_MISSA_HORAS.
   *
   * O dado de horário não tem duração — só o começo. A suposição de 1 hora já
   * existia aqui (o `endDate` de cada Event era `somarHora(inicio, 1)`); ela foi
   * mantida ao migrar para OpeningHoursSpecification, que precisa de `closes`
   * para descrever um intervalo válido.
   */
  private static readonly DURACAO_MISSA_HORAS = 1;

  private fimPresumido(horaMin: string): string {
    const [h, m] = (horaMin || "00:00").split(":").map(Number);
    const total = (h + DetailsComponent.DURACAO_MISSA_HORAS) * 60 + m;
    const p = (n: number) => String(n).padStart(2, "0");
    // 23:30 + 1h volta para 00:30 (mesmo dia da semana no schema)
    return `${p(Math.floor(total / 60) % 24)}:${p(total % 60)}`;
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

    // Horários de missa como OpeningHoursSpecification, não como Event.
    //
    // Antes cada missa virava um Event completo, repetindo location (com o
    // endereço inteiro), organizer, performer, offers, description e image — ~4
    // Events por paróquia, ~93% de todo o JSON-LD da página e ~22 MB no dist
    // (12% do total, que já roda a 74% do teto de 250 MB do Azure SWA).
    //
    // Além do peso, o retorno era duvidoso: o Google não tem rich result para
    // missa recorrente, e Event é voltado a eventos pontuais/com ingresso.
    // Para horário recorrente de um local, OpeningHoursSpecification é o padrão
    // documentado e é o que o Google interpreta em LocalBusiness/Place.
    //
    // Dedupe por (dia, hora): registros repetidos no banco gerariam entradas
    // idênticas. Ordenado por dia e hora para a saída ser estável entre builds.
    const horarios = (igreja.missas ?? [])
      .filter((m: any) => m.diaSemana !== undefined && m.diaSemana !== null && dias[m.diaSemana])
      .map((m: any) => ({ dia: m.diaSemana as number, hora: (m.horario ?? "").slice(0, 5) }))
      .filter((m: any) => !!m.hora);

    const vistos = new Set<string>();
    const openingHours = horarios
      .filter((m: any) => {
        const chave = `${m.dia}|${m.hora}`;
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      })
      .sort((a: any, b: any) => a.dia - b.dia || a.hora.localeCompare(b.hora))
      .map((m: any) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: dias[m.dia],
        opens: m.hora,
        closes: this.fimPresumido(m.hora),
      }));

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
    if (openingHours.length) place.openingHoursSpecification = openingHours;

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
