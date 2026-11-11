import { Component, inject, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { ChurchesService } from "../../../core/services/churches.service";
import { MetricasService, PaginaMetrica } from "../../../core/services/metricas.service";
import { SeoService } from "../../../core/services/seo.service";
import { NotFoundComponent } from "../not-found/not-found.component";

/**
 * Rota legada `/detalhes/{cep}` (links antigos do Google Maps). Os CEPs citados em
 * fichas do Google Business Profile têm 301 na borda (staticwebapp.config.json); os
 * demais chegam aqui e são resolvidos pela API.
 *
 * Quando o CEP não leva a nenhuma igreja, a página mostra "não encontrada" com noindex
 * em vez de mandar para a home: redirecionar URL inexistente para a home é o padrão
 * clássico de Soft 404 (Search Console, 11/2026). Erro transitório (rede, 5xx) também
 * não vai mais para a home: mostra a mesma página sem indexar, e o usuário segue pelos
 * links dela.
 */
@Component({
  selector: "app-cep-redirect",
  standalone: true,
  imports: [NotFoundComponent],
  template: `@if (naoEncontrado) { <app-not-found /> }`,
})
export class CepRedirectComponent implements OnInit {
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _churches = inject(ChurchesService);
  private _metricas = inject(MetricasService);
  private _seo = inject(SeoService);

  naoEncontrado = false;

  ngOnInit(): void {
    this._metricas.registrarVisualizacaoPagina(PaginaMetrica.CepRedirect);
    const cep = this._route.snapshot.paramMap.get("cep")?.replace(/\D/g, "") ?? "";

    if (!cep || cep.length !== 8) {
      this.marcarNaoEncontrado();
      return;
    }

    this._churches.searchByCEPv2(cep).subscribe({
      next: (res) => {
        const igrejas = res?.data ?? [];
        const endereco = igrejas[0]?.dadosEndereco;

        if (!endereco?.localidade || !endereco?.uf) {
          this.marcarNaoEncontrado();
          return;
        }

        const uf = endereco.uf.toLowerCase();
        const cidadeSlug = this._toSlug(endereco.localidade);

        if (igrejas.length === 1) {
          const ig = igrejas[0];
          const slugFinal = ig.slug ?? ig.nomeUnico;
          const cidadeFinal = ig.cidadeSlug ?? cidadeSlug;
          if (slugFinal) {
            this._router.navigate(["/paroquia", uf, cidadeFinal, slugFinal], { replaceUrl: true });
          } else {
            this._router.navigate(["/missas", uf, cidadeSlug], { replaceUrl: true });
          }
        } else {
          // Múltiplas igrejas no CEP — mostra a lista da cidade
          this._router.navigate(["/missas", uf, cidadeSlug], { replaceUrl: true });
        }
      },
      error: () => this.marcarNaoEncontrado(),
    });
  }

  private marcarNaoEncontrado(): void {
    this.naoEncontrado = true;
    this._seo.update({
      title: "Página não encontrada | BuscaMissa",
      description: "A página que você procura não existe ou foi movida.",
      canonical: null,
      noindex: true,
    });
  }

  private _toSlug(nome: string): string {
    return nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-");
  }
}
