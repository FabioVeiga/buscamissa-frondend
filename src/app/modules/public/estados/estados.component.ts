import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { STATES } from '../../../core/constants/states';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';
import { SeoService } from '../../../core/services/seo.service';
import { HubListaComponent, HubBreadcrumb, HubItem } from '../../../shared/components/hub-lista/hub-lista.component';

const SITE = 'https://buscamissa.com.br';

interface EstadoResumo {
  uf: string;
  estado: string;
  totalCidades: number;
  totalParoquias: number;
}

/**
 * Índice de ESTADOS (`/estados`) — paridade com `/cidades`. Distribui autoridade
 * para os hubs estaduais (`/missas/{uf}`).
 *
 * Alimentado por `GET /v2/seo/estados`, NÃO pela constante STATES: aquela lista as
 * 27 UFs sempre, mas só as UFs com paróquia viram hub prerenderizado. As demais
 * caíam no catch-all do router e serviam a HOME — mesma página, URL diferente,
 * `canonical` apontando para `/home` e `robots: index, follow`. Ou seja, conteúdo
 * duplicado indexável gerado pelo próprio índice. Usando a API, o índice só lista
 * o que existe.
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstadosComponent implements OnInit, OnDestroy {
  private _seo = inject(SeoService);
  private _api = inject(SeoPaginasService);
  private _cdr = inject(ChangeDetectorRef);
  private _destroyRef = inject(DestroyRef);

  readonly breadcrumb: HubBreadcrumb[] = [
    { label: 'Início', link: ['/home'] },
    { label: 'Estados' },
  ];

  itens: HubItem[] = [];
  private estados: EstadoResumo[] = [];

  ngOnInit(): void {
    this.aplicarSeo();

    this._api
      .getEstados()
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (data: any) => {
          const lista: EstadoResumo[] = Array.isArray(data) ? data : (data?.data ?? []);
          this.aplicar(lista.filter((e) => e?.uf));
        },
        // Degrada para a lista estática: um índice vazio é pior que um índice com
        // um link a mais. O risco de link para hub sem página volta só neste caso.
        //
        // Só quando NUNCA houve dado. Com a página prerenderizada, o TransferState
        // já emitiu a lista real de forma síncrona; deixar um erro de revalidação
        // rebaixá-la para a lista estática trocaria dado bom (com as metas de cada
        // UF) por dado pior. O interceptor de leitura já engole esse erro, isto é
        // cinto de segurança para o caminho sem TransferState.
        error: () => {
          if (!this.itens.length) this.aplicarFallbackEstatico();
        },
      });
  }

  private aplicar(estados: EstadoResumo[]): void {
    if (!estados.length) {
      this.aplicarFallbackEstatico();
      return;
    }
    this.estados = estados;
    this.itens = estados.map((e) => ({
      nome: e.estado,
      meta: `${e.totalParoquias} paróquia(s) em ${e.totalCidades} cidade(s)`,
      link: ['/missas', e.uf.toLowerCase()],
    }));
    this.aplicarJsonLd();
    this._cdr.markForCheck();
  }

  private aplicarFallbackEstatico(): void {
    this.estados = STATES.map((e) => ({
      uf: e.sigla.toLowerCase(),
      estado: e.nome,
      totalCidades: 0,
      totalParoquias: 0,
    }));
    this.itens = this.estados.map((e) => ({ nome: e.estado, link: ['/missas', e.uf] }));
    this.aplicarJsonLd();
    this._cdr.markForCheck();
  }

  private aplicarSeo(): void {
    this._seo.update({
      title: 'Missas por estado — horários de missa no Brasil | BuscaMissa',
      description:
        'Encontre horários de missa por estado. Escolha a UF e veja as cidades e paróquias com missas cadastradas.',
      canonical: `${SITE}/estados`,
    });
  }

  private aplicarJsonLd(): void {
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
      numberOfItems: this.estados.length,
      itemListElement: this.estados.map((e, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: e.estado,
        item: `${SITE}/missas/${e.uf.toLowerCase()}`,
      })),
    });
  }

  /**
   * Os ids do JSON-LD são um namespace global do documento — sem remover na saída,
   * o ItemList dos estados sobrevive na próxima rota que não o sobrescreva.
   */
  ngOnDestroy(): void {
    this._seo.removeJsonLd('breadcrumb');
    this._seo.removeJsonLd('itemlist');
  }
}
