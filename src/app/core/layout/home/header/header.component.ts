import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FavoritesService } from '../../../services/favorites.service';

@Component({
  selector: 'app-header-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderHomeComponent {
  private favorites = inject(FavoritesService);
  menuAberto = false;

  get favoritosCount(): number {
    return this.favorites.quantidade();
  }
}
