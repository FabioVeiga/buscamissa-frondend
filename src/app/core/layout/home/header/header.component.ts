import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FavoritesService } from '../../../services/favorites.service';
import { AuthService } from '../../../services/auth.service';
import { NotificacaoService } from '../../../services/notificacao.service';

@Component({
  selector: 'app-header-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderHomeComponent implements OnInit {
  private favorites = inject(FavoritesService);
  private auth = inject(AuthService);
  private notificacoes = inject(NotificacaoService);
  menuAberto = false;

  get favoritosCount(): number {
    return this.favorites.quantidade();
  }

  get estaLogado(): boolean {
    return this.auth.estaLogado;
  }

  get notificacoesNaoLidas(): number {
    return this.notificacoes.naoLidas;
  }

  ngOnInit(): void {
    if (this.estaLogado) {
      this.notificacoes.listar().subscribe({ error: () => {} });
    }
  }
}
