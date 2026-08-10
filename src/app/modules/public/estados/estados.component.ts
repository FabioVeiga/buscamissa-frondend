import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { STATES } from '../../../core/constants/states';
import { SeoService } from '../../../core/services/seo.service';
import { HubListaComponent, HubBreadcrumb, HubItem } from '../../../shared/components/hub-lista/hub-lista.component';

const SITE = 'https://buscamissa.com.br';

/**
 * Índice de ESTADOS (`/estados`) — paridade com `/cidades`. Lista os 26 estados +
 * DF e distribui autoridade para os hubs estaduais (`/missas/{uf}`). Estático
 * (constante STATES), prerenderizado. SEO + ItemList JSON-LD.
 */
@Component({
  selector: 'app-estados',
  standalone: true,
  imports: [CommonModule, HubListaComponent],
  template: `<app-hub-lista
    [breadcrumb]="breadcrumb"
    titulo="Missas por estado"
    subtitulo="Explore as igrejas e horários de missa em cada estado do Brasil."
    icone="pi pi-map-marker"
    [itens]="itens"
  />`,
})
export class EstadosComponent implements OnInit, OnDestroy {
  private _seo = inject(SeoService);

  readonly breadcrumb: HubBreadcrumb[] = [
    { label: 'Início', link: ['/home'] },
    { label: 'Estados' },
  ];

  readonly itens: HubItem[] = STATES.map((e) => ({
    nome: e.nome,
    link: ['/missas', e.sigla.toLowerCase()],
  }));

  ngOnInit(): void {
    this._seo.update({
      title: 'Missas por estado — horários de missa no Brasil | BuscaMissa',
      description: 'Encontre horários de missa por estado. Escolha a UF e veja as cidades e paróquias com missas cadastradas.',
      canonical: `${SITE}/estados`,
    });
    this._seo.setJsonLd('breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE}/home` },
        { '@type': 'ListItem', position: 2, name: 'Estados', item: `${SITE}/estados` },
      ],
    });
    this._seo.setJsonLd('itemlist', {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Estados do Brasil com missas',
      numberOfItems: this.itens.length,
      itemListElement: STATES.map((e, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: e.nome,
        item: `${SITE}/missas/${e.sigla.toLowerCase()}`,
      })),
    });
  }

  /**
   * Os ids do JSON-LD são um namespace global do documento — sem remover na saída,
   * o ItemList dos 27 estados sobrevive na próxima rota que não o sobrescreva.
   */
  ngOnDestroy(): void {
    this._seo.removeJsonLd('breadcrumb');
    this._seo.removeJsonLd('itemlist');
  }
}
