import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Convite discreto para a página /anuncie. Não é anúncio (sem selo "Patrocinado"):
 * texto estático, altura reservada e nunca no topo da busca nem em pop-up.
 */
@Component({
  selector: 'app-convite-anuncie',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="convite">
      <i class="pi pi-megaphone" aria-hidden="true"></i>
      <span>Tem um negócio ou projeto para divulgar?</span>
      <a routerLink="/anuncie" [queryParams]="{ origem }">Anuncie no BuscaMissa</a>
    </p>
  `,
  styles: [`
    .convite {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 0.4rem;
      min-height: 56px;
      margin: 1rem 0;
      font-size: 0.85rem;
      color: #6b7280;
      text-align: center;
    }
    .convite a { color: inherit; font-weight: 600; text-decoration: underline; }
  `],
})
export class ConviteAnuncieComponent {
  @Input() origem = '';
}
