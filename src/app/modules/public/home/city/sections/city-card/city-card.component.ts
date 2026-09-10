import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ConfidenceBadgeComponent } from '../../../../../../shared/components/confidence-badge/confidence-badge.component';
import { ChurchPlaceholderComponent } from '../../../../../../shared/components/church-placeholder/church-placeholder.component';
import { getNextOccurrenceMinutes, formatMassTime, getCountdownLabel, getDiaLabel } from '../../../../../../shared/utils/mass-time.utils';
import { distanciaMetrosAte } from '../../../../../../shared/utils/distance.utils';
import { linkParoquia as buildLinkParoquia } from '../../../../../../shared/utils/church-link.utils';

/** Card de igreja da lista da cidade (extraído do CityComponent — auditoria 2.x). */
@Component({
  selector: 'app-city-card',
  standalone: true,
  imports: [CommonModule, RouterLink, ConfidenceBadgeComponent, ChurchPlaceholderComponent],
  templateUrl: './city-card.component.html',
  styleUrls: ['./city-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CityCardComponent {
  @Input({ required: true }) igreja: any;
  /** Próxima missa considerando os filtros ativos — calculada pelo pai */
  @Input() proximaMissa: any | null = null;
  @Input() destaque = false;
  @Input() mostrarBadgeDestaque = false;
  @Input() favorita = false;
  @Input() cidadeNome = '';
  @Input() uf = '';
  @Input() cidadeSlug = '';
  @Input() userLat: number | null = null;
  @Input() userLng: number | null = null;

  @Output() churchClick = new EventEmitter<void>();
  @Output() favoritarClick = new EventEmitter<void>();
  @Output() comoChegarClick = new EventEmitter<void>();

  imagemQuebrada = false;

  /**
   * Falso no prerender. Separa a informação temporal ESTÁVEL (que o server assa e o
   * Google indexa) da RELATIVA (que só faz sentido contra o relógio de quem está
   * lendo). Ver getDiaLabel em mass-time.utils.ts.
   */
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  get linkParoquia(): string[] {
    // Rota canônica com fallback para /igrejas/:nomeUnico quando falta slug (fix da dev, PR #73)
    return buildLinkParoquia({
      ...this.igreja,
      endereco: { ...this.igreja?.endereco, uf: this.uf, cidadeSlug: this.cidadeSlug },
    });
  }

  get distanciaMetros(): number | null {
    return distanciaMetrosAte(
      this.userLat,
      this.userLng,
      this.igreja.endereco?.latitude,
      this.igreja.endereco?.longitude
    );
  }

  get diaMissa(): string {
    const pm = this.proximaMissa;
    if (!pm) return '';
    return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][pm.diaSemana] ?? '';
  }

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }

  /**
   * Sempre false no prerender: o chip de contagem regressiva é o conteúdo mais
   * perecível do card — "Começa em 2h30" gravado num arquivo estático está errado
   * um minuto depois. Já foi indexado assim (snippets de /missas/df/sao-sebastiao e
   * /missas/sp/votorantim exibiam "19h30 Hoje Começa em 2h30" em 2026-09-09).
   *
   * Aqui, diferente do rótulo do dia, o elemento realmente não existe no server e
   * nasce na hidratação. É seguro: a coluna de horário ocupa ~39 px num card de
   * ~345 px, então inserir o chip não muda a altura do card e não desloca layout.
   */
  ehUrgente(m: any): boolean {
    return this._isBrowser && getNextOccurrenceMinutes(m.diaSemana, m.horario) <= 180;
  }

  countdownLabel(m: any): string {
    return this._isBrowser ? getCountdownLabel(m.diaSemana, m.horario) : '';
  }

  /**
   * "Hoje"/"Amanhã" só no browser; no prerender, o nome do dia. O elemento
   * `.city-card__dia` do template é o MESMO nos dois casos — muda só o texto.
   */
  diaLabelRelativo(m: any): string {
    return getDiaLabel(m.diaSemana, m.horario, this._isBrowser);
  }

  onFavoritar(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.favoritarClick.emit();
  }
}
