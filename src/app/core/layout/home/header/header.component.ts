import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-header-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderHomeComponent {
  menuAberto = false;

  get favoritosCount(): number {
    try {
      const raw = localStorage.getItem('buscamissa_favoritas');
      const arr = JSON.parse(raw || '[]');
      return Array.isArray(arr) ? arr.length : 0;
    } catch {
      return 0;
    }
  }
}
