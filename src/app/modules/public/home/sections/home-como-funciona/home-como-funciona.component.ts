import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

/**
 * Seções estáticas "Como funciona" + "Não encontrou sua igreja?"
 * (extraídas do HomeComponent — auditoria 2.1).
 */
@Component({
  selector: 'app-home-como-funciona',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './home-como-funciona.component.html',
  styleUrls: ['./home-como-funciona.component.scss'],
})
export class HomeComoFuncionaComponent {}
