import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { STATES } from '../../../core/constants/states';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';
import { SeoService } from '../../../core/services/seo.service';
import { HubListaComponent, HubBreadcrumb, HubItem } from '../../../shared/components/hub-lista/hub-lista.component';
import { PageHeroComponent, HeroTile } from '../../../shared/components/page-hero/page-hero.component';
import { metaParoquiasCidades } from '../../../shared/utils/plural.utils';

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
  imports: [CommonModule, FormsModule, HubListaComponent, PageHeroComponent],
  templateUrl: './estados.component.html',
  styleUrl: './estados.component.scss',
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

  /** `\n` vira quebra de linha (o hero usa `white-space: pre-line`). */
  readonly TITULO_HERO = 'Horários de Missa\npor';

  itens: HubItem[] = [];
  /** O que o hub-lista renderiza — igual a `itens` enquanto não há filtro. */
  itensVisiveis: HubItem[] = [];
  tiles: HeroTile[] = [];
  carregando = true;
  busca = '';
  private estados: EstadoResumo[] = [];

  /**
   * Filtro LOCAL sobre os 27 itens já carregados — não vai à API. No prerender a
   * busca está vazia, então o HTML assado continua com todos os `<a href>` de UF.
   */
  aoFiltrar(): void {
    const q = this.normalizar(this.busca);
    this.itensVisiveis = q
      ? this.itens.filter((i) => this.normalizar(i.nome).includes(q))
      : this.itens;
  }

  private normalizar(v: string): string {
    return v
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

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
      meta: metaParoquiasCidades(e.totalParoquias, e.totalCidades),
      link: ['/missas', e.uf.toLowerCase()],
    }));
    this.itensVisiveis = this.itens;

    // Somas do payload que já foi carregado — nenhuma requisição a mais.
    const paroquias = estados.reduce((s, e) => s + (e.totalParoquias ?? 0), 0);
    const cidades = estados.reduce((s, e) => s + (e.totalCidades ?? 0), 0);
    this.tiles = [
      // Ordem e ícone únicos entre os hubs: cidades → paróquias → estados.
      { icone: 'pi pi-map-marker', numero: cidades, rotulo: 'cidades' },
      { icone: 'pi pi-building', numero: paroquias, rotulo: 'paróquias' },
      { icone: 'pi pi-map', numero: estados.length, rotulo: 'estados' },
    ];
    this.carregando = false;

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
    this.itensVisiveis = this.itens;
    // Sem tiles: neste caminho os totais são 0 (a lista estática não os tem), e
    // "0 paróquias" numa página indexada é pior que não mostrar número nenhum.
    this.tiles = [];
    this.carregando = false;
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
