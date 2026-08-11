import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, inject, OnInit } from '@angular/core';
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
  private host = inject(ElementRef<HTMLElement>);
  menuAberto = false;
  explorarAberto = false;

  /** Clique fora do header fecha o dropdown "Explorar". */
  @HostListener('document:click', ['$event.target'])
  onDocumentClick(alvo: EventTarget | null): void {
    if (this.explorarAberto && !this.host.nativeElement.contains(alvo)) {
      this.explorarAberto = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.explorarAberto = false;
  }

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
