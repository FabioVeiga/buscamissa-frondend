import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { HubBreadcrumb } from '../hub-lista/hub-lista.component';

/** Número em destaque do hero (ex.: "3 paróquias"). */
export interface HeroTile {
  /** Classe PrimeIcons (ex.: 'pi pi-building'). */
  icone: string;
  numero: string | number;
  rotulo: string;
}

/**
 * HERO de página reutilizável — a casca visual dos hubs de navegação (`/missas/:uf`,
 * `/estados`, `/dias`, `/cidades`). Extraído do hero de `/missas/:uf`, que continua
 * sendo a referência: faixa creme sangrando de borda a borda, breadcrumb, H1 com o
 * termo em destaque, subtítulo, tiles de números e os lugares da busca e da arte.
 *
 * É PRESENTACIONAL de propósito. A busca de cada página tem lógica própria
 * (autocomplete de cidade em `/missas/:uf`, filtro local em `/estados` e `/cidades`,
 * nenhuma em `/dias`) e entra por `ng-content`, não por input — o hero não pode virar
 * componente de negócio. SEO, JSON-LD e carga de dados também ficam na página.
 *
 * O full-bleed depende de `.layout-main > .card:has(.ph-hero)` em `styles.scss`:
 * o `.card` do layout limita as páginas a 640px, e a presença de `.ph-hero` é o
 * gatilho que libera a largura. Por isso a classe raiz não pode ser renomeada sem
 * atualizar aquela regra.
 */
@Component({
  selector: 'app-page-hero',
  standalone: true,
  imports: [CommonModule, RouterModule, SkeletonModule],
  templateUrl: './page-hero.component.html',
  styleUrls: ['./page-hero.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeroComponent {
  @Input() breadcrumb: HubBreadcrumb[] = [];

  /**
   * Texto do `<h1>`. Quebras de linha vão como `\n` (o título é renderizado com
   * `white-space: pre-line`) — preserva o `<br>` do layout original sem precisar
   * de innerHTML.
   */
  @Input({ required: true }) titulo = '';

  /** Trecho final do título pintado em laranja (ex.: o nome do estado). */
  @Input() tituloDestaque?: string;

  /** Também aceita `\n` para quebra de linha. */
  @Input() subtitulo?: string;

  /** Lista vazia remove a faixa de tiles inteira — sem reservar espaço. */
  @Input() tiles: HeroTile[] = [];

  /**
   * Troca SÓ os números por skeleton, preservando a altura do tile (anti-CLS).
   * Deliberadamente estreito: um `carregando` genérico convidaria a esconder
   * breadcrumb/título/subtítulo, que são estáticos e devem aparecer de imediato.
   */
  @Input() tilesCarregando = false;

  /** Linha de ajuda abaixo da busca. Só aparece se houver texto. */
  @Input() hint?: string;
}
