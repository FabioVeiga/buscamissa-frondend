import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef,
  HostListener, OnDestroy, OnInit, PLATFORM_ID, ViewChild, inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MetricasService, PaginaMetrica } from '../../../core/services/metricas.service';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';
import { SeoService } from '../../../core/services/seo.service';
import { STATES } from '../../../core/constants/states';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { HubBreadcrumb } from '../../../shared/components/hub-lista/hub-lista.component';
import { HubPonteComponent } from '../../../shared/components/hub-ponte/hub-ponte.component';
import {
  BuscaLocalService, CidadeBusca, IgrejaBusca, ResultadoBusca,
} from '../../../core/services/busca-local.service';
import { cidades, estados, paroquias } from '../../../shared/utils/plural.utils';

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
  private _buscaLocal = inject(BuscaLocalService);
  private _router = inject(Router);
  private _ehBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  isLoading = true;
  estados: EstadoItem[] = [];

  // ── Busca do hero ────────────────────────────────────────────────────────
  // Autocomplete, NÃO filtro do índice lá embaixo. Antes, este mesmo campo
  // filtrava o acordeão que fica a duas telas de distância: no mobile, digitar
  // "Curitiba" não mudava nada dentro da viewport e a busca parecia quebrada.
  // Mesma gramática de `/missas/:uf`, que já resolveu isso.
  buscaHero = '';
  resultado: ResultadoBusca = { cidades: [], igrejas: [] };
  mostrarSugestoes = false;

  /** Caixa da busca — referência para detectar clique FORA dela. */
  @ViewChild('caixaBusca') private caixaBusca?: ElementRef<HTMLElement>;

  /** Cidades no formato da busca, montadas uma vez por carga. */
  private cidadesParaBusca: CidadeBusca[] = [];

  /** O índice já foi pedido? Guarda de "no máximo um fetch por sessão da página". */
  private indicePedido = false;

  /**
   * `carregarIndice()` já respondeu (com índice ou com falha). Antes disso, zero
   * resultado NÃO significa "não existe" — significa "as igrejas ainda não
   * chegaram", e anunciar "não encontramos nada" ali seria mentira por um instante.
   */
  private indiceResolvido = false;
  /** Vitrine acima do índice completo — capitais e cidades com mais paróquias. */
  principaisCidades: CidadeDestaque[] = [];

  readonly breadcrumb: HubBreadcrumb[] = [
    { label: 'Início', link: ['/home'] },
    { label: 'Cidades' },
  ];

  /** `\n` vira quebra de linha (o hero usa `white-space: pre-line`). */
  readonly TITULO_HERO = 'Horários de Missa\npor';

  /**
   * Prova de cobertura em uma linha. Eram três tiles numéricos logo abaixo da
   * busca: ~90px de altura, não acionáveis, e num índice NACIONAL os números são
   * abstratos ("1.026 cidades" não ajuda ninguém a decidir para onde ir). No
   * mobile eles empurravam a vitrine de cidades para fora da primeira dobra.
   * Vazio até a carga terminar — hero sem número é melhor que hero com zeros.
   */
  cobertura = '';

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
          this.cobertura = '';
          this._cdr.markForCheck();
        },
      });
  }

  private aplicar(lista: EstadoBulk[]): void {
    if (!lista.length) {
      this.isLoading = false;
      this.semDados = true;
      this.cobertura = '';
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

    // Cidades no formato da busca. Vêm do MESMO payload do índice acima — a busca
    // por cidade não depende do `busca-index.json` e responde já na primeira tecla.
    this.cidadesParaBusca = lista.flatMap((e) =>
      (e.cidades ?? []).map((c) => ({
        nome: c.cidade,
        uf: e.uf.toLowerCase(),
        cidadeSlug: c.cidadeSlug,
        totalParoquias: c.totalParoquias,
      })),
    );

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
    this.montarCobertura(lista.length);
    this.aplicarJsonLd();
    this._cdr.markForCheck();
  }

  /** "388 cidades · 2.143 paróquias · 12 estados" — separador de meio-ponto e
      milhar em pt-BR, para o número ser lido de relance e não soletrado. */
  private montarCobertura(totalEstados: number): void {
    const n = (v: number) => v.toLocaleString('pt-BR');
    this.cobertura =
      `${n(this.totalCidades)} ${cidades(this.totalCidades).split(' ')[1]} · ` +
      `${n(this.totalParoquias)} ${paroquias(this.totalParoquias).split(' ')[1]} · ` +
      `${n(totalEstados)} ${estados(totalEstados).split(' ')[1]}`;
  }

  // ============================ busca do hero ============================

  aoDigitar(): void {
    this.garantirIndice();
    this.recalcular();
    this.mostrarSugestoes = !!this.buscaHero.trim();
  }

  /**
   * O índice começa a baixar já no foco, antes da primeira tecla: são ~380 KB, e
   * pedi-los só na primeira tecla faria o grupo "Igrejas" aparecer com atraso
   * visível. `garantirIndice()` é idempotente, então foco + digitação continuam
   * sendo UM request.
   */
  aoFocar(): void {
    this.garantirIndice();
    if (this.buscaHero.trim()) {
      this.recalcular();
      this.mostrarSugestoes = true;
    }
  }

  /**
   * Fecha SEM limpar o texto: quem aperta Escape ou toca fora quer tirar a lista
   * da frente, não perder o que digitou. Focar de novo reabre (ver `aoFocar`).
   */
  fecharSugestoes(): void {
    this.mostrarSugestoes = false;
  }

  /** Enter vai para o primeiro resultado — e só existe quando há um. */
  aoConfirmar(): void {
    const cidade = this.resultado.cidades[0];
    if (cidade) {
      this.irPara(['/missas', cidade.uf, cidade.cidadeSlug]);
      return;
    }
    const igreja = this.resultado.igrejas[0];
    if (igreja) {
      this.irPara(['/paroquia', igreja.uf, igreja.cidadeSlug, igreja.slug]);
    }
  }

  /** "1 paróquia" / "14 paróquias" — ver shared/utils/plural.utils. */
  readonly rotuloParoquias = paroquias;

  linkCidade(c: CidadeBusca): string[] {
    return ['/missas', c.uf, c.cidadeSlug];
  }

  /** URL canônica da paróquia. Slugs sempre do backend — nunca gerados aqui. */
  linkIgreja(i: IgrejaBusca): string[] {
    return ['/paroquia', i.uf, i.cidadeSlug, i.slug];
  }

  get semResultados(): boolean {
    return (
      this.indiceResolvido &&
      !this.resultado.cidades.length &&
      !this.resultado.igrejas.length
    );
  }

  /**
   * Enquanto o índice não respondeu e nada casou, não há o que mostrar: o painel
   * fica fechado em vez de piscar "não encontramos nada" e se desdizer meio
   * segundo depois, quando as igrejas chegam.
   */
  get temAlgoParaMostrar(): boolean {
    return (
      this.resultado.cidades.length > 0 ||
      this.resultado.igrejas.length > 0 ||
      this.indiceResolvido
    );
  }

  /**
   * Clique fora fecha. `document:click` em vez de `blur` no input porque `blur`
   * dispara ANTES do clique numa sugestão e engoliria a navegação.
   */
  @HostListener('document:click', ['$event'])
  aoClicarNoDocumento(evento: MouseEvent): void {
    if (!this._ehBrowser || !this.mostrarSugestoes) return;
    const caixa = this.caixaBusca?.nativeElement;
    if (caixa && !caixa.contains(evento.target as Node)) {
      this.mostrarSugestoes = false;
      this._cdr.markForCheck();
    }
  }

  private irPara(rota: string[]): void {
    this.mostrarSugestoes = false;
    this._router.navigate(rota);
  }

  private recalcular(): void {
    this.resultado = this._buscaLocal.buscar(this.buscaHero, this.cidadesParaBusca);
  }

  /** Um download por sessão da página — ver `BuscaLocalService`. */
  private garantirIndice(): void {
    if (this.indicePedido || !this._ehBrowser) return;
    this.indicePedido = true;
    this._buscaLocal
      .carregarIndice()
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe(() => {
        this.indiceResolvido = true;
        // Recalcula porque o texto quase sempre já foi digitado enquanto o índice
        // vinha pela rede: sem isto o grupo "Igrejas" só apareceria na tecla seguinte.
        this.recalcular();
        this._cdr.markForCheck();
      });
  }

  // ============================ índice por estado ============================

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
