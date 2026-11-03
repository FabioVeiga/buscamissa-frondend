import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Placeholder visual para igrejas sem foto cadastrada.
 * Ilustração leve de igreja sobre fundo suave — mesmas dimensões da foto real
 * (definidas pela classe do container), evitando layout shift.
 */
@Component({
  selector: 'app-church-placeholder',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './church-placeholder.component.html',
  styleUrl: './church-placeholder.component.scss',
})
export class ChurchPlaceholderComponent {
  /** Exibe o rótulo "Sem imagem cadastrada" (use em contextos grandes) */
  @Input() showLabel = false;

  /**
   * Id do `<symbol>` de app-church-placeholder-sprite. Com ele, a arte vira um `<use>`
   * (listas longas: página de cidade); sem ele, a arte vai inline (demais páginas).
   */
  @Input() spriteId: string | null = null;

  /**
   * `false` deixa o host VAZIO (sem a arte). A página de cidade passa `!temFoto`: a
   * maioria dos cards tem foto, e a arte escondida em cada um pesava no HTML. O host
   * fica sempre no DOM — quem esconde é o `[hidden]` do card, aplicado por binding —,
   * então um resto do render do servidor numa hidratação fora de ordem fica invisível
   * (ver o comentário do <img> em city-card.component.html).
   */
  @Input() conteudo = true;
}
