import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DIAS_INTENCAO } from '../../../core/constants/dias-intencao';
import { SeoService } from '../../../core/services/seo.service';
import { HubListaComponent, HubBreadcrumb, HubItem } from '../../../shared/components/hub-lista/hub-lista.component';

const SITE = 'https://buscamissa.com.br';

/**
 * Índice de DIAS DA SEMANA (`/dias`) — paridade com `/estados` e `/cidades`.
 * Fecha o eixo "dia": as 7 landings `/missa-{dia}` existiam sem página-mãe.
 *
 * Alimentado pela constante `DIAS_INTENCAO`, NÃO pela API: os 7 dias são fixos e
 * todas as landings correspondentes já são prerenderizadas, então não há risco de
 * linkar para página inexistente (o motivo pelo qual `/estados` precisa da API) e
 * o prerender desta rota não depende de rede.
 */
@Component({
  selector: 'app-dias',
  standalone: true,
  imports: [CommonModule, HubListaComponent],
  template: `<app-hub-lista
    [breadcrumb]="breadcrumb"
    titulo="Missas por dia da semana"
    subtitulo="Encontre horários de missa para qualquer dia da semana, em todo o Brasil."
    icone="pi pi-calendar"
    [itens]="itens"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiasComponent implements OnInit, OnDestroy {
  private _seo = inject(SeoService);

  readonly breadcrumb: HubBreadcrumb[] = [
    { label: 'Início', link: ['/home'] },
    { label: 'Dias da semana' },
  ];

  readonly itens: HubItem[] = DIAS_INTENCAO.map((d) => ({
    nome: d.nome,
    meta: `Missas de ${d.nome.toLowerCase()}`,
    link: ['/missa-' + d.slug],
  }));

  ngOnInit(): void {
    this.aplicarSeo();
    this.aplicarJsonLd();
  }

  private aplicarSeo(): void {
    this._seo.update({
      title: 'Missas por dia da semana — horários de missa | BuscaMissa',
      description:
        'Escolha o dia da semana e veja os horários de missa nas paróquias do Brasil. De domingo a sábado.',
      canonical: `${SITE}/dias`,
    });
  }

  private aplicarJsonLd(): void {
    this._seo.setJsonLd('breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE}/home` },
        { '@type': 'ListItem', position: 2, name: 'Dias da semana', item: `${SITE}/dias` },
      ],
    });

    this._seo.setJsonLd('itemlist', {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Missas por dia da semana',
      numberOfItems: DIAS_INTENCAO.length,
      itemListElement: DIAS_INTENCAO.map((d, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: d.nome,
        item: `${SITE}/missa-${d.slug}`,
      })),
    });
  }

  /**
   * Os ids do JSON-LD são um namespace global do documento — sem remover na saída,
   * o ItemList dos dias sobrevive na próxima rota que não o sobrescreva.
   */
  ngOnDestroy(): void {
    this._seo.removeJsonLd('breadcrumb');
    this._seo.removeJsonLd('itemlist');
  }
}
