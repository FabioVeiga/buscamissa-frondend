import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CampanhaAtiva, CampanhaService, PosicaoAnuncio } from '../../../core/services/campanha.service';
import { EventoAnuncio, MetricasService } from '../../../core/services/metricas.service';

/**
 * Anúncio rotulado (selo "BuscaMissa" ou "Patrocinado"). Só existe no browser: no
 * prerender não renderiza nada, então o HTML estático fica intacto. Sem campanha
 * ativa não renderiza nada (sem espaço vazio nem "Anuncie aqui"). Impressão contada
 * 1x por sessão quando 50% do bloco fica visível.
 */
@Component({
  selector: 'app-anuncio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (campanha; as c) {
      <aside class="anuncio" [class.anuncio--compacto]="posicao === 'detalhe_igreja'" [attr.aria-label]="c.selo + ': ' + c.titulo">
        <span class="anuncio__selo">{{ c.selo }}</span>
        <a class="anuncio__link"
           [href]="c.linkDestino"
           target="_blank"
           rel="sponsored noopener noreferrer"
           (click)="aoClicar(c)">
          <img class="anuncio__img" [src]="c.imagemUrl" [alt]="c.titulo" width="1200" height="300" loading="lazy" />
          <strong class="anuncio__titulo">{{ c.titulo }}</strong>
          @if (c.textoCurto) {
            <span class="anuncio__texto">{{ c.textoCurto }}</span>
          }
        </a>
        @if (posicao === 'detalhe_igreja') {
          <small class="anuncio__isencao">
            Conteúdo patrocinado. A exibição deste anúncio não representa apoio ou recomendação da paróquia nem da Igreja.
          </small>
        }
      </aside>
    }
  `,
  styles: [`
    .anuncio {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      margin: 1rem 0;
      padding: 0.6rem;
      border: 1px solid rgba(128, 128, 128, 0.3);
      border-radius: 10px;
      font-size: 0.85rem;
    }
    .anuncio__selo {
      align-self: flex-start;
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.05rem 0.45rem;
      border-radius: 4px;
      background: rgba(128, 128, 128, 0.2);
    }
    .anuncio__link { display: flex; flex-direction: column; gap: 0.25rem; color: inherit; text-decoration: none; }
    .anuncio__img { width: 100%; height: auto; aspect-ratio: 4 / 1; object-fit: cover; border-radius: 8px; }
    .anuncio__titulo { font-weight: 600; }
    .anuncio__texto { opacity: 0.8; }
    .anuncio__isencao { font-size: 0.7rem; opacity: 0.7; }

    /* Página da paróquia: banner proporcional aos demais blocos. A imagem traz texto e
       botão desenhados, então mantém o 4:1 e só diminui. */
    .anuncio--compacto { margin: 0; padding: 0.5rem; gap: 0.2rem; font-size: 0.8125rem; }
    .anuncio--compacto .anuncio__selo { margin-bottom: 0.1rem; }
    @media (min-width: 640px) {
      .anuncio--compacto {
        display: grid;
        grid-template-columns: minmax(0, 27rem) minmax(0, 1fr);
        column-gap: 0.875rem;
        align-content: center;
      }
      .anuncio--compacto .anuncio__link { display: contents; }
      .anuncio--compacto .anuncio__img { grid-column: 1; grid-row: 1 / span 4; }
      .anuncio--compacto .anuncio__selo,
      .anuncio--compacto .anuncio__titulo,
      .anuncio--compacto .anuncio__texto,
      .anuncio--compacto .anuncio__isencao { grid-column: 2; }
      .anuncio--compacto .anuncio__selo { justify-self: start; }
    }
  `],
})
export class AnuncioComponent implements OnInit, OnDestroy {
  @Input({ required: true }) posicao!: PosicaoAnuncio;

  private readonly _campanhas = inject(CampanhaService);
  private readonly _metricas = inject(MetricasService);
  private readonly _el = inject(ElementRef<HTMLElement>);
  private readonly _cdr = inject(ChangeDetectorRef);
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private _observer?: IntersectionObserver;

  campanha: CampanhaAtiva | null = null;

  ngOnInit(): void {
    if (!this._isBrowser) return;
    this._campanhas.obterAtiva(this.posicao).subscribe((c) => {
      this.campanha = c;
      this._cdr.markForCheck();
      // O elemento só existe após o próximo ciclo de renderização.
      if (c) setTimeout(() => this.observar(c));
    });
  }

  ngOnDestroy(): void {
    this._observer?.disconnect();
  }

  aoClicar(c: CampanhaAtiva): void {
    // Disparado antes da navegação; a aba nova mantém a página viva para o envio.
    this._metricas.registrarEventoAnuncio(EventoAnuncio.CliqueAnuncio, c.metricaId);
  }

  private observar(c: CampanhaAtiva): void {
    const alvo = (this._el.nativeElement as HTMLElement).querySelector('.anuncio');
    if (!alvo || typeof IntersectionObserver === 'undefined') return;
    this._observer = new IntersectionObserver((entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      this._observer?.disconnect();
      if (this.jaContouNaSessao(c.metricaId)) return;
      this._metricas.registrarEventoAnuncio(EventoAnuncio.ImpressaoAnuncio, c.metricaId);
    }, { threshold: 0.5 });
    this._observer.observe(alvo);
  }

  // Dedupe por sessão do navegador; sem sessionStorage, conta a cada exibição.
  private jaContouNaSessao(metricaId: number): boolean {
    const chave = `anuncio_imp_${metricaId}`;
    try {
      if (sessionStorage.getItem(chave)) return true;
      sessionStorage.setItem(chave, '1');
    } catch { /* storage indisponível */ }
    return false;
  }
}
