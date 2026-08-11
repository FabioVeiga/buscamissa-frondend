import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

export interface HubBreadcrumb {
  label: string;
  /** routerLink; ausente = item atual (sem link). */
  link?: string[];
}

export interface HubItem {
  nome: string;
  /** Linha secundária (ex.: "12 paróquia(s)"). */
  meta?: string;
  link: string[];
}

/**
 * Hub de LISTAGEM reutilizável (Fase Final) — layout único para páginas que listam
 * "filhos" com cards: Estado (lista cidades), índice /estados (lista estados) e
 * hubs de intenção. Dá o mesmo acabamento da página de cidade sem duplicar markup.
 * É presentacional: SEO/JSON-LD e busca de dados ficam no componente da página.
 */
@Component({
  selector: 'app-hub-lista',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './hub-lista.component.html',
  styleUrls: ['./hub-lista.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubListaComponent {
  @Input() breadcrumb: HubBreadcrumb[] = [];
  /**
   * Opcional: nas páginas que abrem com `<app-page-hero>` o H1, o subtítulo e o
   * breadcrumb são do hero, e o hub-lista entra só como grade de cards.
   */
  @Input() titulo = '';
  @Input() subtitulo?: string;
  /** Ícone PrimeIcons dos cards (ex.: 'pi pi-map-marker'). */
  @Input() icone = 'pi pi-map-marker';
  @Input({ required: true }) itens: HubItem[] = [];
  /**
   * Cap visual: quando > 0 e não `expandido`, os itens além do limite ficam com
   * `display:none` — mas PERMANECEM no HTML (o `<a href>` segue crawlável, sem
   * perder linkagem interna/SEO). 0 = sem cap.
   */
  @Input() limite = 0;
  @Input() expandido = false;

  oculto(i: number): boolean {
    return this.limite > 0 && !this.expandido && i >= this.limite;
  }
}
