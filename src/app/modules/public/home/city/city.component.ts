import { Component, inject, OnInit } from "@angular/core";
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
export class CityComponent implements OnInit {
  private _route = inject(ActivatedRoute);
  private _church = inject(ChurchesService);
  private _seo = inject(SeoService);

  isLoading = false;
  uf = "";
  cidade = "";
  cidadeNome = "";
  igrejas: any[] = [];
  naoEncontrado = false;

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
      },
      error: () => {
        this.naoEncontrado = true;
        this._seo.update({
          title: `Missas em ${this.cidade}/${this.uf?.toUpperCase()} | BuscaMissa`,
        });
      },
    });
  }

  // Monta a URL canônica da paróquia
  linkParoquia(igreja: any): string[] {
    return ["/paroquia", this.uf, this.cidade, igreja.slug];
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
}
