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
}
