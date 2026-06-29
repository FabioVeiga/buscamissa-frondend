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
        const endereco = res?.data?.[0]?.dadosEndereco;
        if (!endereco?.localidade || !endereco?.uf) {
          this._router.navigate(["/home"]);
          return;
        }
        const cidadeSlug = this._toSlug(endereco.localidade);
        const uf = endereco.uf.toLowerCase();
        this._router.navigate(["/missas", uf, cidadeSlug]);
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
