import { Component, inject, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { HttpClient } from "@angular/common/http";

@Component({
  selector: "app-cep-redirect",
  standalone: true,
  template: ``,
})
export class CepRedirectComponent implements OnInit {
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _http = inject(HttpClient);

  ngOnInit(): void {
    const cep = this._route.snapshot.paramMap.get("cep")?.replace(/\D/g, "") ?? "";

    if (!cep || cep.length !== 8) {
      this._router.navigate(["/home"]);
      return;
    }

    this._http
      .get<{ localidade: string; uf: string; erro?: boolean }>(
        `https://viacep.com.br/ws/${cep}/json/`
      )
      .subscribe({
        next: (data) => {
          if (data.erro || !data.localidade || !data.uf) {
            this._router.navigate(["/home"]);
            return;
          }
          const cidadeSlug = this._toSlug(data.localidade);
          const uf = data.uf.toLowerCase();
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
