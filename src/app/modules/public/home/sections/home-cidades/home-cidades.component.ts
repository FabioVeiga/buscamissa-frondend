import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CidadePopular } from '../../../../../core/constants/cidades-populares';

/** Seção "Explore por cidade" da home (extraída do HomeComponent — auditoria 2.1). */
@Component({
  selector: 'app-home-cidades',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home-cidades.component.html',
  styleUrls: ['./home-cidades.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeCidadesComponent {
  @Input({ required: true }) cidades: CidadePopular[] = [];
  @Input() cidadeDetectada: CidadePopular | null = null;
  /** true quando a geolocalização resolveu (mostra o destaque e pula a 1ª da lista) */
  @Input() geoEncontrada = false;
  /**
   * true quando a geolocalização já falhou (negada ou sem cidade resolvida). Só então
   * o slot do card "Sua cidade" colapsa: enquanto o pedido está PENDENTE a altura
   * segue reservada, senão o card empurraria os chips ao chegar — que é justamente
   * o CLS que a reserva existe para evitar.
   */
  @Input() geoFalhou = false;
}
