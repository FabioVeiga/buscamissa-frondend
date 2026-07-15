import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FavoritesService } from '../../../services/favorites.service';
import { FeatureToggleService } from '../../../services/feature-toggle.service';

@Component({
  selector: 'app-header-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderHomeComponent {
  private favorites = inject(FavoritesService);
  private featureToggleService = inject(FeatureToggleService);
  menuAberto = false;

  cadastroIgrejaHabilitado$ = this.featureToggleService.isEnabled('cadastro-igreja-site');

  get favoritosCount(): number {
    return this.favorites.quantidade();
  }
}
