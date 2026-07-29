import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

export interface ChipLink {
  label: string;
  /** routerLink em forma de array (ex.: ['/missa-domingo'] ou ['/missas', 'sp']). */
  link: string[];
}

/**
 * Seção genérica de "chips" de navegação da Home — reusa EXATAMENTE o visual da
 * seção "Explore por cidade" (mesmas classes .cidades-chips/.sec-header/.cidade-chip,
 * via styleUrls compartilhado). Usada para os pontos de entrada "Missas por dia da
 * semana" e "Missas por estado" (Fase Final — descoberta/linkagem interna).
 */
@Component({
  selector: 'app-home-chips',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home-chips.component.html',
  styleUrls: ['../home-cidades/home-cidades.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeChipsComponent {
  @Input({ required: true }) titulo = '';
  @Input() subtitulo?: string;
  /** Classe do ícone PrimeIcons (ex.: 'pi pi-calendar'). */
  @Input() icone = 'pi pi-map-marker';
  @Input({ required: true }) itens: ChipLink[] = [];
}
