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

  /** O campo em si — o botão "Buscar" devolve o foco a ele quando não há o que buscar. */
  @ViewChild('campoBusca') private campoBusca?: ElementRef<HTMLInputElement>;

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
    { label: 'Início', link: ['/'] },
    { label: 'Cidades' },
  ];

  /** `\n` vira quebra de linha (o hero usa `white-space: pre-line`). */
  readonly TITULO_HERO = 'Encontre a missa\nna sua';

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

  private totalParoquias = 0;

  /** Total de cidades do bulk — vai para a cobertura do hero e para o bloco de /estados. */
  totalCidades = 0;

  /** "2.188" — separador de milhar em pt-BR. */
  get totalCidadesFmt(): string {
    return this.totalCidades.toLocaleString('pt-BR');
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

    this.totalCidades = this.cidadesParaBusca.length;
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

  /**
   * Botão "Buscar". Com resultado, faz o mesmo que o Enter. Sem texto, leva o foco
   * ao campo; com texto que não casou, abre o painel — que é onde a mensagem de
   * "não encontramos" mora. Em nenhum caso o clique fica sem resposta.
   */
  aoBuscar(): void {
    if (!this.buscaHero.trim()) {
      this.campoBusca?.nativeElement.focus();
      return;
    }
    this.garantirIndice();
    this.recalcular();
    if (this.resultado.cidades.length || this.resultado.igrejas.length) {
      this.aoConfirmar();
      return;
    }
    this.mostrarSugestoes = true;
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
        { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Cidades', item: `${SITE}/cidades` },
      ],
    });

    this._seo.setJsonLd('itemlist', {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      // Só as cidades que a página LINKA: o ItemList descreve a lista visível,
      // e a lista completa saiu daqui para /estados → /missas/:uf.
      name: 'Principais cidades do Brasil com missas cadastradas',
      numberOfItems: this.principaisCidades.length,
      itemListElement: this.principaisCidades.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.nome,
        item: `${SITE}/missas/${c.uf}/${c.slug}`,
      })),
    });
  }
}
