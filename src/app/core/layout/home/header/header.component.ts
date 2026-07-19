import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FavoritesService } from '../../../services/favorites.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-header-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderHomeComponent {
  private favorites = inject(FavoritesService);
  private auth = inject(AuthService);
  menuAberto = false;

  get favoritosCount(): number {
    return this.favorites.quantidade();
  }

  get estaLogado(): boolean {
    return this.auth.estaLogado;
  }
}
