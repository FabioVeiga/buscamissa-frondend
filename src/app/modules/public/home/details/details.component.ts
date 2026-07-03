import { Component, DestroyRef, inject, OnInit } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { finalize } from "rxjs/operators";
import { FormsModule } from "@angular/forms";
import { ChurchesService } from "../../../../core/services/churches.service";
import { SeoService } from "../../../../core/services/seo.service";
import { SkeletonModule } from "primeng/skeleton";
import { MessageService } from "primeng/api";
import { PrimeNgModule } from "../../../../shared/primeng.module";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { ModalComponent } from "../../../../core/components/modal/modal.component";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { Mass } from "../../church/models/church.model";
import { ConfidenceBadgeComponent } from "../../../../shared/components/confidence-badge/confidence-badge.component";
import { CountdownChipComponent } from "../../../../shared/components/countdown-chip/countdown-chip.component";
import { ChurchPlaceholderComponent } from "../../../../shared/components/church-placeholder/church-placeholder.component";
import { getNextOccurrenceMinutes, formatMassTime, getCountdownLabel } from "../../../../shared/utils/mass-time.utils";
import { AnalyticsService } from "../../../../core/services/analytics.service";
import { ClarityService } from "../../../../core/services/clarity.service";
import { RedesSociaisService, TipoRedeSocial } from "../../../../core/services/redes-sociais.service";
import { MetricasService } from "../../../../core/services/metricas.service";
import { getSocialIconFromTipos } from "../../../../shared/utils/social-icon.utils";
import { NavigationHistoryService } from "../../../../core/services/navigation-history.service";

interface ItemReportarProblema {
  key: string;
  label: string;
  icon: string;
  emoji: string;
  subtitle?: string;
  placeholder?: string;
  especial?: boolean;
  marcado: boolean;
  texto: string;
}

function criarItensReportarProblema(): ItemReportarProblema[] {
  return [
    { key: "endereco", label: "Endereço", icon: "pi-map-marker", emoji: "📍", placeholder: "Descreva o que está incorreto ou informe o endereço correto.", marcado: false, texto: "" },
    { key: "contato", label: "Dados de contato", icon: "pi-phone", emoji: "☎️", subtitle: "Telefone, e-mail, Instagram, Facebook ou outras redes sociais.", placeholder: "Informe quais dados estão incorretos ou quais são os dados corretos.", marcado: false, texto: "" },
    { key: "nomeIgreja", label: "Nome da igreja", icon: "pi-building", emoji: "⛪", placeholder: "Informe o nome correto da igreja, comunidade ou paróquia.", marcado: false, texto: "" },
    { key: "incompleta", label: "Página incompleta", icon: "pi-file", emoji: "📄", placeholder: "Quais informações você acredita que estão faltando?", marcado: false, texto: "" },
    { key: "horarios", label: "Horários de Missa", icon: "pi-clock", emoji: "🕐", especial: true, marcado: false, texto: "" },
    { key: "outro", label: "Outro", icon: "pi-comment", emoji: "💬", placeholder: "Descreva o que deseja informar.", marcado: false, texto: "" },
  ];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: "app-details",
  imports: [
    PrimeNgModule,
    CommonModule,
    SkeletonModule,
    RouterLink,
    FormsModule,
    ConfidenceBadgeComponent,
    CountdownChipComponent,
    ChurchPlaceholderComponent,
    ModalComponent,
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
  _sanitizer = inject(DomSanitizer);
  _navHistory = inject(NavigationHistoryService);
  private _analytics = inject(AnalyticsService);
  private _clarity = inject(ClarityService);
  private _redesSociais = inject(RedesSociaisService);
  private _metricas = inject(MetricasService);

  tiposRedeSocial: TipoRedeSocial[] = [];
  isLoading = false;
  nomeUnico: string | null = null;
  churchInfo: any;
  fotoQuebrou = false;

  // Prova social
  totalConfirmacoes = 0;
  ultimaConfirmacao: string | null = null;

  // Confirmação de horários
  confirmacaoEnviada = false;
  confirmandoHorarios = false;

  // Favorito
  isFavorita = false;

  // Reportar problema
  modalReportarProblemaVisible = false;
  enviandoReportarProblema = false;
  itensReportar: ItemReportarProblema[] = criarItensReportarProblema();
  reportarNome = "";
  reportarEmail = "";

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
        this.fotoQuebrou = false;

        if (!igreja) {
          this._toast.add({ severity: "error", summary: "Erro", detail: "Dados da igreja não encontrados." });
          this._router.navigate(['/home']);
          return;
        }

        if (igreja.id) this.carregarResumoConfirmacoes(igreja.id);
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

  // ── Próxima missa (scoreboard) ─────────────────────────────────────────────

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

  /** Minutos até a próxima missa */
  get minutosProximaMissa(): number | null {
    const pm = this.proximaMissa;
    return pm ? getNextOccurrenceMinutes(pm.diaSemana!, pm.horario) : null;
  }

  /** Só mostra o contador regressivo quando cria urgência real (até 3h) — evita redundância com o dia */
  get mostrarContador(): boolean {
    const min = this.minutosProximaMissa;
    return min !== null && min <= 180;
  }

  /** Rótulo curto do dia da próxima missa: "Hoje" / "Amanhã" / "Sábado" */
  get proximaMissaDiaLabel(): string {
    const pm = this.proximaMissa;
    if (!pm) return "";
    const min = getNextOccurrenceMinutes(pm.diaSemana!, pm.horario);
    const alvo = new Date(Date.now() + min * 60_000);

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dAlvo = new Date(alvo); dAlvo.setHours(0, 0, 0, 0);
    const diff = Math.round((dAlvo.getTime() - hoje.getTime()) / 86_400_000);

    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanhã";
    return ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][pm.diaSemana!] ?? "";
  }

  /** Data completa da próxima ocorrência: "quinta-feira, 15 de maio" */
  get proximaMissaData(): string {
    const pm = this.proximaMissa;
    if (!pm) return "";
    const min = getNextOccurrenceMinutes(pm.diaSemana!, pm.horario);
    const data = new Date(Date.now() + min * 60_000);
    return data.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  }

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }

  isHoje(diaSemana: number): boolean {
    return new Date().getDay() === diaSemana;
  }

  /** CEP só é exibível se não for placeholder/zerado dos imports */
  get cepValido(): boolean {
    const cep = (this.churchInfo?.endereco?.cep ?? "").replace(/\D/g, "");
    return cep.length === 8 && cep !== "00000000";
  }

  /** Observações distintas das missas — resumo para "Informações da comunidade" */
  get observacoes(): string[] {
    const missas: Mass[] = this.churchInfo?.missas ?? [];
    const set = new Set<string>();
    missas.forEach((m) => {
      const o = (m.observacao ?? "").trim();
      if (o) set.add(o);
    });
    return Array.from(set);
  }

  get temContato(): boolean {
    const c = this.churchInfo?.contato;
    return !!(c?.telefone || c?.telefoneWhatsApp || c?.emailContato || c?.site || this.churchInfo?.redesSociais?.length);
  }

  /** Semana completa (7 dias) — dias sem missa entram vazios para mostrar "—" */
  get agendaSemana(): { dia: number; label: string; missas: Mass[] }[] {
    const labels = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
    const missas: Mass[] = this.churchInfo?.missas ?? [];
    const grupos: Record<number, Mass[]> = {};
    missas.forEach((m) => {
      if (m.diaSemana !== undefined && m.diaSemana !== null) {
        (grupos[m.diaSemana] = grupos[m.diaSemana] ?? []).push(m);
      }
    });
    return labels.map((label, dia) => ({
      dia,
      label,
      missas: (grupos[dia] ?? []).sort((a, b) => a.horario.localeCompare(b.horario)),
    }));
  }

  /** "última confirmação há 3 dias" — formato relativo */
  get ultimaConfirmacaoLabel(): string {
    if (!this.ultimaConfirmacao) return "";
    const dias = Math.floor((Date.now() - new Date(this.ultimaConfirmacao).getTime()) / 86_400_000);
    if (dias <= 0) return "hoje";
    if (dias === 1) return "ontem";
    if (dias < 7) return `há ${dias} dias`;
    if (dias < 30) { const s = Math.floor(dias / 7); return `há ${s} ${s === 1 ? "semana" : "semanas"}`; }
    const m = Math.floor(dias / 30); return `há ${m} ${m === 1 ? "mês" : "meses"}`;
  }

  // ── Favorito ───────────────────────────────────────────────────────────────

  private _loadFavoritaState(): void {
    try {
      const arr = JSON.parse(localStorage.getItem('buscamissa_favoritas') || '[]');
      this.isFavorita = Array.isArray(arr) && arr.some((f: any) => f.id === this.churchInfo?.id);
    } catch {
      this.isFavorita = false;
    }
  }

  toggleFavorita(): void {
    if (!this.churchInfo?.id) return;

    let favoritas: any[] = [];
    try { favoritas = JSON.parse(localStorage.getItem('buscamissa_favoritas') || '[]'); } catch { }
    if (!Array.isArray(favoritas)) favoritas = [];

    const id = this.churchInfo.id;
    if (this.isFavorita) {
      favoritas = favoritas.filter((f) => f.id !== id);
      this.isFavorita = false;
      this._toast.add({ severity: 'info', summary: 'Removida dos favoritos', detail: this.churchInfo.nome });
    } else {
      const pm = this.proximaMissa;
      const end = this.churchInfo.endereco ?? {};
      favoritas.push({
        id,
        nome: this.churchInfo.nome,
        uf: (end.uf ?? '').toLowerCase(),
        cidadeSlug: end.cidadeSlug,
        slug: this.churchInfo.slug,
        diaSemana: pm?.diaSemana,
        horario: pm?.horario,
      });
      this.isFavorita = true;
      this._analytics.favoriteParishSaved(this.churchInfo.nome);
      this.trackObjetivoAlcancado('favoritar');
      this._metricas.registrarFavorito(id);
      this._toast.add({ severity: 'success', summary: 'Adicionada aos favoritos!', detail: this.churchInfo.nome });
    }
    localStorage.setItem('buscamissa_favoritas', JSON.stringify(favoritas));
  }

  // ── Prova social + mapa ────────────────────────────────────────────────────

  private carregarResumoConfirmacoes(igrejaId: number): void {
    this.totalConfirmacoes = 0;
    this.ultimaConfirmacao = null;
    this._church.getResumoConfirmacoes(igrejaId).subscribe({
      next: (res: any) => {
        this.totalConfirmacoes = res?.data?.totalConfirmacoes ?? 0;
        this.ultimaConfirmacao = res?.data?.ultimaConfirmacao ?? null;
      },
      error: () => { /* prova social é opcional — silencioso */ },
    });
  }

  /** Mapa embarcado (Google Maps embed, sem API key) */
  get mapEmbedUrl(): SafeResourceUrl | null {
    const e = this.churchInfo?.endereco;
    if (!e) return null;
    const q = e.latitude && e.longitude
      ? `${e.latitude},${e.longitude}`
      : encodeURIComponent(`${this.churchInfo.nome}, ${e.logradouro}, ${e.localidade} ${e.uf}`);
    return this._sanitizer.bypassSecurityTrustResourceUrl(
      `https://maps.google.com/maps?q=${q}&z=16&output=embed`
    );
  }

  // ── Navegação / compartilhamento ───────────────────────────────────────────

  trackDirections(): void {
    this._analytics.getDirections(this.churchInfo?.nome ?? '');
    this.trackObjetivoAlcancado('tracar_rota');
    if (this.churchInfo?.id) this._metricas.registrarCliqueRota(this.churchInfo.id);
  }

  get linkGoogleMaps(): string {
    const e = this.churchInfo?.endereco;
    if (!e) return '#';
    if (e.latitude && e.longitude)
      return `https://www.google.com/maps/search/?api=1&query=${e.latitude},${e.longitude}`;
    const q = encodeURIComponent(`${this.churchInfo.nome}, ${e.logradouro}, ${e.localidade} ${e.uf}`);
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  get linkWaze(): string {
    const e = this.churchInfo?.endereco;
    if (!e) return '#';
    if (e.latitude && e.longitude)
      return `https://waze.com/ul?ll=${e.latitude},${e.longitude}&navigate=yes`;
    const q = encodeURIComponent(`${this.churchInfo.nome}, ${e.logradouro}, ${e.localidade}`);
    return `https://waze.com/ul?q=${q}&navigate=yes`;
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

  getSocialIcon(url: string): string {
    return getSocialIconFromTipos(url, this.tiposRedeSocial);
  }

  getSocialTrackName(url: string): string {
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

  scrollToLocal(): void {
    document.getElementById("como-chegar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  reportarErro(): void {
    if (this.churchInfo?.id) {
      this._analytics.userContribution('report', this.churchInfo.nome);
      this._metricas.registrarSugestaoEdicao(this.churchInfo.id);
      this._router.navigate(['/editar', this.churchInfo.id]);
    }
  }

  abrirModalReportarProblema(): void {
    this.itensReportar = criarItensReportarProblema();
    this.reportarNome = "";
    this.reportarEmail = "";
    this.modalReportarProblemaVisible = true;
  }

  fecharModalReportarProblema(): void {
    this.modalReportarProblemaVisible = false;
  }

  /**
   * Fecha o modal e leva o usuário para o fluxo de alteração. Se algum outro item já foi
   * preenchido, envia essa sugestão antes de redirecionar; caso contrário, redireciona direto.
   */
  irParaAlterarInformacoes(): void {
    const temItemPreenchido = this.itensReportar.some((item) => !item.especial && item.marcado && item.texto.trim());

    if (!temItemPreenchido) {
      this.modalReportarProblemaVisible = false;
      this.reportarErro();
      return;
    }

    if (!this.reportarProblemaValido) {
      this._toast.add({
        severity: 'warn',
        summary: 'Preencha seus dados',
        detail: 'Informe nome e e-mail para enviar sua sugestão antes de continuar.',
      });
      return;
    }

    this.enviarReportarProblema(() => this.reportarErro());
  }

  get reportarProblemaValido(): boolean {
    const temNomeEEmail = !!this.reportarNome.trim() && EMAIL_REGEX.test(this.reportarEmail.trim());
    const temItemPreenchido = this.itensReportar.some((item) => !item.especial && item.marcado && item.texto.trim());
    return temNomeEEmail && temItemPreenchido;
  }

  private montarDescricaoReportarProblema(): string {
    const secoes = this.itensReportar
      .filter((item) => !item.especial && item.marcado && item.texto.trim())
      .map((item) => `${item.emoji} ${item.label}\n${item.texto.trim()}`);
    return `Correções sugeridas\n\n${secoes.join("\n\n")}`;
  }

  /** Envia a sugestão. Se `aoConcluir` for informado (fluxo "Ir para alterar"), não mostra toast de sucesso nem fecha o modal aqui — quem chamou decide o próximo passo. */
  enviarReportarProblema(aoConcluir?: () => void): void {
    if (!this.reportarProblemaValido || !this.churchInfo?.id) return;

    this.enviandoReportarProblema = true;
    const body = {
      nome: this.reportarNome.trim(),
      email: this.reportarEmail.trim(),
      descricao: this.montarDescricaoReportarProblema(),
    };
    this._church.reportarProblema(this.churchInfo.id, body)
      .pipe(finalize(() => (this.enviandoReportarProblema = false)))
      .subscribe({
        next: () => {
          this._analytics.userContribution('report', this.churchInfo.nome);
          this.modalReportarProblemaVisible = false;
          if (aoConcluir) {
            aoConcluir();
            return;
          }
          this._toast.add({
            severity: 'success',
            summary: 'Obrigado!',
            detail: 'Sugestão enviada com sucesso. Nossa equipe vai analisar.',
          });
        },
        error: () => {
          this._toast.add({
            severity: 'error',
            summary: 'Erro',
            detail: 'Não foi possível enviar sua sugestão. Tente novamente.',
          });
        },
      });
  }

  // ── Confirmação de horários ─────────────────────────────────────────────────

  confirmarHorarios(): void {
    if (!this.churchInfo?.id) return;

    const localKey = `buscamissa_confirmacao_${this.churchInfo.id}`;
    if (localStorage.getItem(localKey)) {
      this._toast.add({ severity: 'info', summary: 'Já confirmado', detail: 'Você já confirmou os horários desta paróquia.' });
      return;
    }

    this.confirmandoHorarios = true;
    this._church.confirmarHorarios(this.churchInfo.id).subscribe({
      next: () => {
        localStorage.setItem(localKey, '1');
        this.confirmacaoEnviada = true;
        this.totalConfirmacoes++;
        this._analytics.userContribution('confirm', this.churchInfo.nome);
        this._toast.add({ severity: 'success', summary: 'Obrigado!', detail: 'Sua confirmação ajuda outras pessoas da comunidade.' });
      },
      error: (err) => {
        if (err.status === 409) {
          localStorage.setItem(localKey, '1');
          this.confirmacaoEnviada = true;
          this._toast.add({ severity: 'info', summary: 'Já registrado', detail: 'Você já confirmou os horários desta paróquia.' });
        } else {
          this._toast.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível enviar sua confirmação. Tente novamente.' });
        }
      },
      complete: () => { this.confirmandoHorarios = false; }
    });
  }

  jaConfirmou(): boolean {
    if (!this.churchInfo?.id) return false;
    return !!localStorage.getItem(`buscamissa_confirmacao_${this.churchInfo.id}`);
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
