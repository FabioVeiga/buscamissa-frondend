import { Component, inject, OnInit } from "@angular/core";
import { finalize } from "rxjs/operators";
import { ChurchesService } from "../../../../core/services/churches.service";
import { SeoService } from "../../../../core/services/seo.service";
import { SkeletonModule } from "primeng/skeleton";
import { MessageService } from "primeng/api";
import { PrimeNgModule } from "../../../../shared/primeng.module";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Location } from "@angular/common";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { Mass } from "../../church/models/church.model";
import { ConfidenceBadgeComponent } from "../../../../shared/components/confidence-badge/confidence-badge.component";
import { CountdownChipComponent } from "../../../../shared/components/countdown-chip/countdown-chip.component";
import { ChurchPlaceholderComponent } from "../../../../shared/components/church-placeholder/church-placeholder.component";
import { getNextOccurrenceMinutes, formatMassTime } from "../../../../shared/utils/mass-time.utils";

@Component({
  selector: "app-details",
  imports: [
    PrimeNgModule,
    CommonModule,
    SkeletonModule,
    RouterLink,
    ConfidenceBadgeComponent,
    CountdownChipComponent,
    ChurchPlaceholderComponent,
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
  _router = inject(Router);
  _location = inject(Location);
  _sanitizer = inject(DomSanitizer);

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

  ngOnInit(): void {
    this._route.params.subscribe((params) => {
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

        this._seo.update({
          title: seo?.title ?? `${igreja.nome} | BuscaMissa`,
          description: seo?.description ?? `Veja os horários de missa, endereço e contato de ${igreja.nome}. Encontre missas perto de você no BuscaMissa.`,
          canonical: seo?.canonicalUrl,
        });
        this.aplicarBreadcrumbSchema(igreja);
        this.aplicarPlaceSchema(igreja);
      },
      error: (error) => {
        this._toast.add({ severity: "error", summary: "Erro", detail: "Erro ao carregar dados da igreja." });
        console.error(error);
      },
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
    if (url.includes('facebook.com')) return 'pi pi-facebook';
    if (url.includes('instagram.com')) return 'pi pi-instagram';
    if (url.includes('youtube.com')) return 'pi pi-youtube';
    if (url.includes('tiktok.com')) return 'pi pi-tiktok';
    return 'pi pi-globe';
  }

  voltar(): void {
    this._location.back();
  }

  /** Compartilhar: usa a API nativa quando disponível, senão copia o link */
  compartilhar(): void {
    const url = this.shareUrl;
    const nav = navigator as any;
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

  editChurch(church: any): void {
    this._router.navigate(['/editar', church.id]);
  }

  reportarErro(): void {
    if (this.churchInfo?.id) this._router.navigate(['/editar', this.churchInfo.id]);
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
