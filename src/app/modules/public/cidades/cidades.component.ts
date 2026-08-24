import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MetricasService, PaginaMetrica } from '../../../core/services/metricas.service';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';
import { SeoService } from '../../../core/services/seo.service';
import { STATES } from '../../../core/constants/states';
import { PageHeroComponent, HeroTile } from '../../../shared/components/page-hero/page-hero.component';
import { HubBreadcrumb } from '../../../shared/components/hub-lista/hub-lista.component';
import { HubPonteComponent } from '../../../shared/components/hub-ponte/hub-ponte.component';
import { normalizarTexto } from '../../../shared/utils/busca.utils';

const SITE = 'https://buscamissa.com.br';
/** Cap do bloco "Capitais e principais cidades" — vitrine, não substitui o índice completo. */
const TOP_CIDADES = 8;
/**
 * Cap de cidades visíveis por estado ao abrir o acordeão — sem isso, um estado
 * como o Paraná (159 cidades) despeja uma grade enorme de uma vez, o tipo de
 * "parede de links" que lê mal principalmente no mobile. Mesmo padrão de
 * "ver mais" que `estado.component.ts` já usa no índice A–Z.
 */
const CAP_CIDADES_POR_ESTADO = 24;

interface CidadeItem { nome: string; slug: string; totalParoquias: number; }
interface EstadoItem { sigla: string; nome: string; cidades: CidadeItem[]; expandido: boolean; verTodas: boolean; }
interface CidadeDestaque { nome: string; slug: string; uf: string; totalParoquias: number; }

/** Formato de item de `/v2/seo/estados` — mesmo bulk que alimenta `/estados` e o prerender. */
interface EstadoBulk {
  uf: string;
  estado: string;
  totalCidades: number;
  totalParoquias: number;
  cidades?: Array<{ cidadeSlug: string; cidade: string; totalParoquias: number }>;
}

/**
 * Índice de CIDADES (`/cidades`) — antes CSR e alimentado por `v1/Igreja/v2/obter-enderecos`
 * + `v1/Igreja/infos`, dois endpoints independentes de `/estados`, que produziam totais
 * divergentes (2328×2090) e slugs gerados no cliente (`slugify()`) que podiam não bater
 * com o slug real do backend — ex.: "Itapejara d'Oeste" virava `itapejara-doeste` (404)
 * em vez de `itapejara-d-oeste`.
 *
 * Agora consome a MESMA fonte canônica que `/estados`: `GET /v2/seo/estados`
 * (`SeoPaginasService.getEstados()`), já com `cidadeSlug` do backend e já servida do
 * `.prerender-cache/estados.json` durante o build (via `PrerenderEstadosInterceptor`).
 * Nenhum hub geográfico deve mais buscar ou somar esses números por conta própria.
 */
@Component({
  selector: 'app-cidades',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, PageHeroComponent, HubPonteComponent],
  templateUrl: './cidades.component.html',
  styleUrl: './cidades.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CidadesComponent implements OnInit, OnDestroy {
  private _api = inject(SeoPaginasService);
  private _seo = inject(SeoService);
  private _metricas = inject(MetricasService);
  private _cdr = inject(ChangeDetectorRef);
  private _destroyRef = inject(DestroyRef);

  isLoading = true;
  busca = '';
  estados: EstadoItem[] = [];
  /** Vitrine acima do índice completo — capitais e cidades com mais paróquias. */
  principaisCidades: CidadeDestaque[] = [];

  readonly breadcrumb: HubBreadcrumb[] = [
    { label: 'Início', link: ['/home'] },
    { label: 'Cidades' },
  ];

  /** `\n` vira quebra de linha (o hero usa `white-space: pre-line`). */
  readonly TITULO_HERO = 'Horários de Missa\npor';

  /** Ordem e ícone únicos entre os hubs: cidades → paróquias → estados. */
  tiles: HeroTile[] = [
    { icone: 'pi pi-map-marker', numero: 0, rotulo: 'cidades' },
    { icone: 'pi pi-building', numero: 0, rotulo: 'paróquias' },
    { icone: 'pi pi-map', numero: 0, rotulo: 'estados' },
  ];

  /**
   * `getEstados()` falhou. Distingue "não carregou" de "a busca não achou": sem isso a
   * página exibia "Nenhuma cidade encontrada" com aspas vazias em cima de um erro de
   * rede. Também zera os tiles — hero sem número é melhor que zeros.
   */
  semDados = false;

  // Cores por estado (sigla → classe CSS)
  readonly estadoCores: Record<string, string> = {
    SP: 'badge--sp', MG: 'badge--mg', RJ: 'badge--rj', PR: 'badge--pr',
    RS: 'badge--rs', SC: 'badge--sc', DF: 'badge--df', GO: 'badge--go',
    BA: 'badge--ba', CE: 'badge--ce', PE: 'badge--pe', PA: 'badge--pa',
  };

  private totalParoquias = 0;

  get totalCidades(): number {
    return this.estados.reduce((s, e) => s + e.cidades.length, 0);
  }

  get estadosFiltrados(): EstadoItem[] {
    const q = normalizarTexto(this.busca);
    if (!q) return this.estados;
    return this.estados
      .map(e => ({
        ...e,
        expandido: true,
        // Busca já é uma lista curta e intencional — o cap de "ver mais" não
        // deveria esconder o resultado que a pessoa acabou de procurar.
        verTodas: true,
        cidades: e.cidades.filter(c => normalizarTexto(c.nome).includes(q)),
      }))
      .filter(e => normalizarTexto(e.nome).includes(q) || e.cidades.length > 0);
  }

  ngOnInit(): void {
    this._metricas.registrarVisualizacaoPagina(PaginaMetrica.Cidades);
    this.aplicarSeo();
    this.carregar();
  }

  ngOnDestroy(): void {
    this._seo.removeJsonLd('breadcrumb');
    this._seo.removeJsonLd('itemlist');
  }

  /** Refaz a carga depois de uma falha (o GET não tem cache local para descartar). */
  recarregar(): void {
    if (!this.isLoading) {
      this.isLoading = true;
      this.semDados = false;
      this._cdr.markForCheck();
      this.carregar();
    }
  }

  private carregar(): void {
    this._api
      .getEstados()
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (data: unknown) => {
          const lista: EstadoBulk[] = Array.isArray(data) ? data : ((data as any)?.data ?? []);
          this.aplicar(lista.filter((e) => e?.uf));
        },
        error: () => {
          this.isLoading = false;
          this.semDados = true;
          this.tiles = [];
          this._cdr.markForCheck();
        },
      });
  }

  private aplicar(lista: EstadoBulk[]): void {
    if (!lista.length) {
      this.isLoading = false;
      this.semDados = true;
      this.tiles = [];
      this._cdr.markForCheck();
      return;
    }

    // Ordem alfabética: isto é um índice para consultar, não um ranking — a vitrine
    // de "principais cidades" abaixo já cobre o volume. Nenhum estado abre sozinho
    // por padrão (antes o PR, o maior, abria com 161 cidades na cara de quem procura SP).
    this.estados = lista
      .map((e) => ({
        sigla: e.uf.toUpperCase(),
        nome: STATES.find((s) => s.sigla === e.uf.toUpperCase())?.nome ?? e.estado,
        cidades: (e.cidades ?? [])
          .map((c) => ({ nome: c.cidade, slug: c.cidadeSlug, totalParoquias: c.totalParoquias }))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        expandido: false,
        verTodas: false,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    this.principaisCidades = lista
      .flatMap((e) => (e.cidades ?? []).map((c) => ({
        nome: c.cidade,
        slug: c.cidadeSlug,
        uf: e.uf.toLowerCase(),
        totalParoquias: c.totalParoquias,
      })))
      .sort((a, b) => b.totalParoquias - a.totalParoquias)
      .slice(0, TOP_CIDADES);

    this.totalParoquias = lista.reduce((s, e) => s + (e.totalParoquias ?? 0), 0);
    this.isLoading = false;
    this.semDados = false;
    this.montarTiles(lista.length);
    this.aplicarJsonLd();
    this._cdr.markForCheck();
  }

  /**
   * Sempre um ARRAY NOVO: `PageHeroComponent` é OnPush e só re-renderiza quando a
   * referência do input muda — mutar `tiles` no lugar não repintaria nada.
   */
  private montarTiles(totalEstados: number): void {
    this.tiles = [
      { icone: 'pi pi-map-marker', numero: this.totalCidades, rotulo: 'cidades' },
      { icone: 'pi pi-building', numero: this.totalParoquias, rotulo: 'paróquias' },
      { icone: 'pi pi-map', numero: totalEstados, rotulo: 'estados' },
    ];
  }

  toggleEstado(e: EstadoItem): void { e.expandido = !e.expandido; }

  toggleVerTodas(e: EstadoItem): void { e.verTodas = !e.verTodas; }

  /** Cap de exibição por estado — ver `CAP_CIDADES_POR_ESTADO`. */
  cidadeOculta(e: EstadoItem, indice: number): boolean {
    return !e.verTodas && indice >= CAP_CIDADES_POR_ESTADO && e.cidades.length > CAP_CIDADES_POR_ESTADO;
  }

  temMaisCidades(e: EstadoItem): boolean {
    return !e.verTodas && e.cidades.length > CAP_CIDADES_POR_ESTADO;
  }

  cidadesOcultasCount(e: EstadoItem): number {
    return e.cidades.length - CAP_CIDADES_POR_ESTADO;
  }

  badgeClass(sigla: string): string {
    return this.estadoCores[sigla] ?? 'badge--default';
  }


  private aplicarSeo(): void {
    this._seo.update({
      title: 'Cidades com missas cadastradas — horários por cidade | BuscaMissa',
      description: 'Encontre horários de missa em qualquer cidade do Brasil. Escolha o estado e veja as paróquias e comunidades católicas cadastradas.',
      canonical: `${SITE}/cidades`,
    });
  }

  private aplicarJsonLd(): void {
    this._seo.setJsonLd('breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE}/home` },
        { '@type': 'ListItem', position: 2, name: 'Cidades', item: `${SITE}/cidades` },
      ],
    });

    this._seo.setJsonLd('itemlist', {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Cidades do Brasil com missas cadastradas',
      numberOfItems: this.totalCidades,
      itemListElement: this.estados.flatMap((e) =>
        e.cidades.map((c) => ({ name: c.nome, item: `${SITE}/missas/${e.sigla.toLowerCase()}/${c.slug}` })),
      ).map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.item })),
    });
  }
}
