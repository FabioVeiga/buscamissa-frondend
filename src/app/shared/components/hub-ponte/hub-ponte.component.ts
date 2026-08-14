import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

/** Um dos três eixos de descoberta do BuscaMissa. */
export type EixoDescoberta = 'cidades' | 'estados' | 'dias';

interface EixoItem {
  eixo: EixoDescoberta;
  icone: string;
  titulo: string;
  desc: string;
  link: string;
}

/**
 * Ponte entre os hubs de descoberta (`/cidades`, `/estados`, `/dias`) — resolve o
 * problema de arquitetura da auditoria do Explorar: os três eixos eram becos sem
 * saída, só conectados pelo menu do header. Sem `/explorar` como quarta página
 * (decisão consciente: seria um nível de navegação a mais, uma URL a mais para
 * indexar e uma duplicata da seção "Encontre do seu jeito" da home) — a ligação
 * cruzada acontece aqui, no fim de cada hub.
 *
 * É PRESENTACIONAL de propósito, como `PageHeroComponent`/`HubListaComponent`:
 * sem HTTP, sem lógica de página. O mapa dos 3 eixos é uma ÚNICA constante aqui
 * dentro — cada página só informa `eixoAtual`, que o componente esconde da lista.
 * Rótulos e ícones são os MESMOS do dropdown "Explorar" do header
 * (`header.component.html`) e da seção "Encontre do seu jeito" da home
 * (`home-explorar.component.html`): é o mesmo mapa mental em três lugares, não
 * uma quarta variação.
 */
@Component({
  selector: 'app-hub-ponte',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './hub-ponte.component.html',
  styleUrl: './hub-ponte.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubPonteComponent {
  @Input({ required: true }) eixoAtual!: EixoDescoberta;

  /** Fonte única dos 3 eixos — mesmos rótulos/ícones do header e da home. */
  private static readonly EIXOS: EixoItem[] = [
    { eixo: 'cidades', icone: 'pi pi-map-marker', titulo: 'Por cidade', desc: 'Encontre missas na sua cidade', link: '/cidades' },
    { eixo: 'estados', icone: 'pi pi-map', titulo: 'Por estado', desc: 'Explore igrejas por estado', link: '/estados' },
    { eixo: 'dias', icone: 'pi pi-calendar', titulo: 'Por dia da semana', desc: 'Encontre missas por dia', link: '/dias' },
  ];

  get outrosEixos(): EixoItem[] {
    return HubPonteComponent.EIXOS.filter((e) => e.eixo !== this.eixoAtual);
  }
}
