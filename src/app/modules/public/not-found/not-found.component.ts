import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

/**
 * Página 404 dedicada. Substitui o antigo wildcard `** -> /home`, que gerava
 * soft-404 (Google via conteúdo da home em URLs inexistentes). A rota marca
 * `noindex` no `data`, então o SeoService injeta `robots: noindex,nofollow`.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterModule],
  template: `
    <section class="not-found">
      <p class="codigo">404</p>
      <h1>Página não encontrada</h1>
      <p class="msg">
        A página que você procura não existe ou foi movida. Que tal buscar uma
        missa perto de você?
      </p>
      <div class="acoes">
        <a routerLink="/home" class="btn-primario">Ir para a página inicial</a>
        <a routerLink="/cidades" class="btn-secundario">Ver todas as cidades</a>
      </div>
    </section>
  `,
  styles: [`
    .not-found {
      max-width: 40rem;
      margin: 0 auto;
      padding: 4rem 1.5rem;
      text-align: center;
    }
    .codigo {
      font-size: 4rem;
      font-weight: 800;
      color: var(--p-primary-color, #7c3aed);
      margin: 0;
      line-height: 1;
    }
    h1 { font-size: 1.5rem; margin: 0.5rem 0 1rem; }
    .msg { color: #555; margin-bottom: 2rem; }
    .acoes { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
    .btn-primario, .btn-secundario {
      padding: 0.65rem 1.25rem;
      border-radius: 0.5rem;
      text-decoration: none;
      font-weight: 600;
    }
    .btn-primario { background: var(--p-primary-color, #7c3aed); color: #fff; }
    .btn-secundario { border: 1px solid #ccc; color: #333; }
  `],
})
export class NotFoundComponent {}
