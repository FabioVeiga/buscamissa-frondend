import { Component } from '@angular/core';

/** Id do `<symbol>` da arte do placeholder (único por página). */
export const SPRITE_PLACEHOLDER_IGREJA = 'church-ph-art';

/**
 * Define a arte do ChurchPlaceholderComponent uma vez por página, para listas longas
 * usarem `<use>` em vez de repetir o SVG inteiro (A2, 03/11/2026: a página de SP
 * repetia a mesma arte 509 vezes, ~0,56 MB do HTML). Só a página de cidade usa —
 * inclua este componente UMA vez e passe `[spriteId]` aos placeholders dela.
 *
 * Fica fora do fluxo com tamanho zero (não `display: none`, que em alguns navegadores
 * impede o `<use>` de renderizar o símbolo).
 */
@Component({
  selector: 'app-church-placeholder-sprite',
  standalone: true,
  templateUrl: './church-placeholder-sprite.component.html',
  styles: [
    ':host, .church-ph-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }',
  ],
})
export class ChurchPlaceholderSpriteComponent {
  readonly id = SPRITE_PLACEHOLDER_IGREJA;
}
