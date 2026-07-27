import { Component, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

// getDay(): 0=domingo … 6=sábado — mesma ordem do DiaDaSemanaEnum do backend.
const SLUG_POR_DIA = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];

/**
 * `/missa-hoje` — resolve o dia atual NO CLIENTE (o Brasil tem 4 fusos, então não
 * existe um "hoje" único no servidor) e redireciona para a landing do dia explícito
 * (`/missa-domingo`, ...). Rota CSR (não prerenderizada). No SSR não faz nada.
 */
@Component({
  selector: 'app-missa-hoje',
  standalone: true,
  template: '<p class="sr-only">Redirecionando para a missa de hoje…</p>',
})
export class MissaHojeComponent implements OnInit {
  private _router = inject(Router);
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngOnInit(): void {
    if (!this._isBrowser) return;
    const slug = SLUG_POR_DIA[new Date().getDay()] ?? 'domingo';
    this._router.navigate(['/missa-' + slug], { replaceUrl: true });
  }
}
