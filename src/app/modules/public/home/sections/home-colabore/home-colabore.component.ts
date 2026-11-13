import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';

/**
 * Seção institucional "O Busca Missa é feito por todos nós" com o convite único
 * "Cadastrar ou atualizar igreja". Cadastro e atualização usam o mesmo fluxo (/nova),
 * então há um só botão. Markup estático: renderiza igual no prerender e no browser.
 */
@Component({
  selector: 'app-home-colabore',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './home-colabore.component.html',
  styleUrls: ['./home-colabore.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeColaboreComponent {}
