import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { finalize } from "rxjs/operators";
import { SkeletonModule } from "primeng/skeleton";
import { PrimeNgModule } from "../../../../shared/primeng.module";
import { ChurchesService } from "../../../../core/services/churches.service";
import { SeoService } from "../../../../core/services/seo.service";

@Component({
  selector: "app-city",
  imports: [PrimeNgModule, CommonModule, RouterLink, SkeletonModule],
  templateUrl: "./city.component.html",
  styleUrl: "./city.component.scss",
})
export class CityComponent implements OnInit, OnDestroy {
  private _route = inject(ActivatedRoute);
  private _church = inject(ChurchesService);
  private _seo = inject(SeoService);

  isLoading = false;
  uf = "";
  cidade = "";
  cidadeNome = "";
  igrejas: any[] = [];
  naoEncontrado = false;
  faqs: { pergunta: string; resposta: string }[] = [];

  ngOnInit(): void {
    this._route.params.subscribe((params) => {
      this.uf = params["uf"];
      this.cidade = params["cidade"];
      this.carregar();
    });
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
        if (this.igrejas.length === 0) {
          this.naoEncontrado = true;
        }
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
        this._seo.update({
          title: `Missas em ${this.cidade}/${this.uf?.toUpperCase()} | BuscaMissa`,
        });
      },
    });
  }

  ngOnDestroy(): void {
    this._seo.removeJsonLd("breadcrumb");
    this._seo.removeJsonLd("faq");
  }

  // Monta a URL canônica da paróquia
  linkParoquia(igreja: any): string[] {
    return ["/paroquia", this.uf, this.cidade, igreja.slug];
  }

  // Schema.org BreadcrumbList: Início > Cidade/UF
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

  // Perguntas frequentes geradas a partir da cidade (alinhadas ao FAQ visível)
  private montarFaqs(): void {
    const local = `${this.cidadeNome}/${this.uf.toUpperCase()}`;
    this.faqs = [
      {
        pergunta: `Que horas é a missa hoje em ${this.cidadeNome}?`,
        resposta: `Consulte nesta página os horários de missa das ${this.igrejas.length} paróquia(s) de ${local}, organizados por dia da semana. Selecione uma paróquia para ver os horários de hoje.`,
      },
      {
        pergunta: `Tem missa de domingo em ${this.cidadeNome}?`,
        resposta: `Sim. Diversas paróquias de ${local} celebram missas aos domingos. Veja a lista de igrejas nesta página e os respectivos horários de domingo.`,
      },
      {
        pergunta: `Como encontrar uma igreja católica perto de mim em ${this.cidadeNome}?`,
        resposta: `Liste abaixo as paróquias e comunidades católicas de ${local} com endereço, contato e horários de missa atualizados pela comunidade.`,
      },
    ];
  }

  // Schema.org FAQPage (rich result) — espelha o FAQ visível na página
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

  // Agrupa missas por dia: "Domingo: 7:00, 10:00, 18:00"
  resumoMissas(missas: any[]): { dia: string; horarios: string }[] {
    if (!missas?.length) return [];
    const dias = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
    const grupos: { [k: number]: string[] } = {};
    missas.forEach((m) => {
      if (m.diaSemana !== undefined && m.diaSemana !== null) {
        (grupos[m.diaSemana] = grupos[m.diaSemana] || []).push(this.fmt(m.horario));
      }
    });
    return Object.keys(grupos).map(Number).sort((a, b) => a - b).map((d) => ({
      dia: dias[d],
      horarios: grupos[d].sort((a, b) => {
        const [h1, m1] = a.split(":").map(Number);
        const [h2, m2] = b.split(":").map(Number);
        return h1 - h2 || m1 - m2;
      }).join(", "),
    }));
  }

  private fmt(t: string): string {
    if (!t) return "";
    const [h, m] = t.split(":");
    return `${parseInt(h, 10)}:${m}`;
  }

  // 0=Desconhecida, 1=Baixa, 2=Media, 3=Alta
  confiancaDot(status: number): string {
    return status === 3 ? "bg-green-500" : status === 2 ? "bg-yellow-500" : status === 1 ? "bg-orange-500" : "bg-gray-400";
  }

  confiancaLabel(status: number): string {
    const l: Record<number, string> = { 3: "Confirmado", 2: "Validado", 1: "Aguardando confirmação", 0: "Não confirmado" };
    return l[status] ?? "Não confirmado";
  }

  getSocialIcon(url: string): string {
    if (url.includes("facebook.com")) return "pi pi-facebook";
    if (url.includes("instagram.com")) return "pi pi-instagram";
    if (url.includes("youtube.com")) return "pi pi-youtube";
    if (url.includes("tiktok.com")) return "pi pi-tiktok";
    return "pi pi-globe";
  }
}
