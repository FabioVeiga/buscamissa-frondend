import { Component, inject, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { ChurchesService } from "../../../core/services/churches.service";

@Component({
  selector: "app-cep-redirect",
  standalone: true,
  template: ``,
})
export class CepRedirectComponent implements OnInit {
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _churches = inject(ChurchesService);

  ngOnInit(): void {
    const cep = this._route.snapshot.paramMap.get("cep")?.replace(/\D/g, "") ?? "";

    if (!cep || cep.length !== 8) {
      this._router.navigate(["/home"]);
      return;
    }

    this._churches.searchByCEPv2(cep).subscribe({
      next: (res) => {
        const igrejas = res?.data ?? [];
        const endereco = igrejas[0]?.dadosEndereco;

        if (!endereco?.localidade || !endereco?.uf) {
          this._router.navigate(["/home"]);
          return;
        }

        const uf = endereco.uf.toLowerCase();
        const cidadeSlug = this._toSlug(endereco.localidade);

        if (igrejas.length === 1) {
          const ig = igrejas[0];
          const slugFinal = ig.slug ?? ig.nomeUnico;
          const cidadeFinal = ig.cidadeSlug ?? cidadeSlug;
          if (slugFinal) {
            this._router.navigate(["/paroquia", uf, cidadeFinal, slugFinal]);
          } else {
            this._router.navigate(["/missas", uf, cidadeSlug]);
          }
        } else {
          // Múltiplas igrejas no CEP — mostra a lista da cidade
          this._router.navigate(["/missas", uf, cidadeSlug]);
        }
      },
      error: () => this._router.navigate(["/home"]),
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
