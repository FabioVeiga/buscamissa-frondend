import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';

/**
 * "Encontre do seu jeito" — os 3 caminhos de busca (cidade / estado / dia).
 *
 * Estático e SEM @defer de propósito: substitui os 27 chips de estado que saíram
 * da Home e precisa entrar no HTML prerenderizado para manter a linkagem interna
 * para os hubs (/cidades, /estados, /dias).
 */
@Component({
  selector: 'app-home-explorar',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './home-explorar.component.html',
  styleUrls: ['./home-explorar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeExplorarComponent {}
