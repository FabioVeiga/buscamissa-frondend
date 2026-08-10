import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { SkeletonModule } from 'primeng/skeleton';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';
import { SeoService } from '../../../core/services/seo.service';
import { DIAS_INTENCAO } from '../../../core/constants/dias-intencao';

const SITE = 'https://buscamissa.com.br';

/** Alfabeto da faixa de atalho do índice de cidades. */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface CidadeResumo {
  cidadeSlug: string;
  cidade: string;
  totalParoquias: number;
}

/** Cidade com o nome já normalizado — evita renormalizar a cada tecla digitada. */
interface CidadeIndexada extends CidadeResumo {
  chave: string;
  letra: string;
}

interface GrupoAlfabetico {
  letra: string;
  cidades: CidadeIndexada[];
}

/** Dia da semana com página de intenção existente nesta UF. */
interface DiaLink {
  slug: string;
  rotulo: string;
}

/**
 * Hub de ESTADO (`/missas/:uf`) — ponte entre o eixo GEOGRÁFICO e o eixo de
 * INTENÇÃO. Linka para baixo (cidades da UF) e para o lado (`/missa-{dia}/{uf}`),
 * tirando as páginas de dia da semana da orfandade. Estado é hub, não etapa
 * obrigatória. Dados de /v2/seo/estado/{uf}; no prerender vêm do bulk (interceptor).
 */
@Component({
  selector: 'app-estado',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SkeletonModule],
  templateUrl: './estado.component.html',
  styleUrl: './estado.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstadoComponent implements OnInit, OnDestroy {
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _seo = inject(SeoService);
  private _api = inject(SeoPaginasService);
  private _destroyRef = inject(DestroyRef);
  private _cdr = inject(ChangeDetectorRef);
  private _doc = inject(DOCUMENT);
  private _ehBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  isLoading = false;
  erroCarregar = false;
  naoEncontrado = false;

  /** Quantas cidades entram no bloco de destaque (as com mais paróquias). */
  private static readonly TOP = 6;
  /** Grupos alfabéticos visíveis antes de "Ver mais cidades". */
  private static readonly GRUPOS_VISIVEIS = 2;
  /** Teto de sugestões do autocomplete do hero. */
  private static readonly MAX_SUGESTOES = 8;

  uf = '';
  estadoNome = '';
  totalCidades = 0;
  totalParoquias = 0;

  // --- Derivados calculados UMA vez ao carregar (não são getters de template:
  // com 100+ cidades, refazer filter/sort/groupBy a cada ciclo de change
  // detection custa caro e ainda pesa no prerender das 26 UFs). ---
  private cidades: CidadeIndexada[] = [];
  principaisCidades: CidadeResumo[] = [];
  private gruposCompletos: GrupoAlfabetico[] = [];
  grupos: GrupoAlfabetico[] = [];
  alfabeto: { letra: string; ativa: boolean }[] = [];
  dias: DiaLink[] = [];

  /** Filtro do índice A–Z (painel "Todas as cidades"). */
  busca = '';
  /** Autocomplete do hero — independente do filtro do painel. */
  buscaHero = '';
  sugestoes: CidadeResumo[] = [];
  mostrarTodas = false;

  get expandido(): boolean {
    return this.mostrarTodas || !!this.busca.trim();
  }

  /**
   * Oculta grupos além do limite via CSS (display:none) em vez de removê-los do
   * template: todos os <a> de cidade continuam no HTML prerenderizado, então a
   * linkagem interna Estado→Cidade segue rastreável sem JS.
   */
  grupoOculto(indice: number): boolean {
    return !this.expandido && indice >= EstadoComponent.GRUPOS_VISIVEIS;
  }

  get temMaisGrupos(): boolean {
    return !this.expandido && this.grupos.length > EstadoComponent.GRUPOS_VISIVEIS;
  }

  ngOnInit(): void {
    this._route.paramMap.pipe(takeUntilDestroyed(this._destroyRef)).subscribe((pm) => {
      this.uf = (pm.get('uf') ?? '').toLowerCase();
      this.carregar();
    });
  }

  /**
   * `SeoService.setJsonLd` usa o id como namespace GLOBAL do documento. Sem
   * remover na saída, o ItemList com as cidades desta UF sobrevive na próxima
   * rota (ex.: uma página de paróquia). Mesmo padrão de city.component.
   */
  ngOnDestroy(): void {
    this._seo.removeJsonLd('breadcrumb');
    this._seo.removeJsonLd('itemlist');
  }

  // ============================ carga ============================

  private carregar(): void {
    this.isLoading = true;
    this.erroCarregar = false;
    this.naoEncontrado = false;
    this.resetarBusca();

    this._api
      .getEstado(this.uf)
      .pipe(
        takeUntilDestroyed(this._destroyRef),
        finalize(() => {
          this.isLoading = false;
          this._cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (data: any) => {
          if (!data) {
            this.naoEncontrado = true;
            this.aplicarSeoNaoEncontrado();
            return;
          }
          this.estadoNome = data.estado ?? '';
          this.totalCidades = data.totalCidades ?? 0;
          this.totalParoquias = data.totalParoquias ?? 0;
          this.indexarCidades(data.cidades ?? []);
          this.dias = this.montarDias(data.dias);
          this.aplicarSeo(data.seo);
          this.aplicarJsonLd();
          this._cdr.markForCheck();
        },
        error: (err) => {
          if (err?.status === 404) {
            this.naoEncontrado = true;
            this.aplicarSeoNaoEncontrado();
          } else {
            // Falha transitória (rede/500) NÃO vira noindex: a página pode ser
            // válida e estar apenas indisponível no momento.
            this.erroCarregar = true;
          }
        },
      });
  }

  /**
   * UF inexistente (`/missas/xx`): a rota casa, mas não há hub prerenderizado, então
   * o SWA serve o shell (que carrega o title/canonical da HOME) e só depois a
   * hidratação mostra "Estado não encontrado" — uma página de "não encontrado"
   * marcada como indexável, ou seja um soft-404. Aqui damos identidade própria à
   * URL e a tiramos do índice.
   *
   * Só no 404 da API. No `erroCarregar` seria perigoso: uma indisponibilidade
   * momentânea marcaria noindex numa página válida.
   */
  private aplicarSeoNaoEncontrado(): void {
    this._seo.update({
      title: 'Estado não encontrado | BuscaMissa',
      description: 'Não encontramos paróquias cadastradas para esta UF.',
      canonical: `${SITE}/missas/${this.uf}`,
      noindex: true,
    });
  }

  tentarNovamente(): void {
    this.carregar();
  }

  private resetarBusca(): void {
    this.busca = '';
    this.buscaHero = '';
    this.sugestoes = [];
    this.mostrarTodas = false;
  }

  private static normalizar(s: string): string {
    return (s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  /**
   * Funde cidades que compartilham o mesmo slug.
   *
   * O nome de exibição vem de `Endereco.Localidade`, que tem variações de caixa no
   * banco ("Foz do Iguaçu" vs "Foz Do Iguaçu"), e por um tempo a API agrupou por
   * (slug, nome) — devolvendo a mesma cidade duas vezes, com o total de paróquias
   * dividido. A API já foi corrigida, mas o hub não controla quando ela sobe: sem
   * isto, duas entradas apontariam para a MESMA URL (chave duplicada no @for e
   * ItemList com itens repetidos). Depois do deploy este passo é inócuo.
   */
  private static fundirPorSlug(brutas: CidadeResumo[]): CidadeResumo[] {
    const porSlug = new Map<string, CidadeResumo>();
    for (const c of brutas) {
      const slug = (c.cidadeSlug ?? '').toLowerCase();
      const atual = porSlug.get(slug);
      if (!atual) {
        porSlug.set(slug, { ...c, cidadeSlug: slug });
        continue;
      }
      atual.totalParoquias += c.totalParoquias ?? 0;
      // mantém a grafia mais "cuidada": a que não é toda minúscula
      if (atual.cidade === atual.cidade.toLowerCase() && c.cidade !== c.cidade.toLowerCase()) {
        atual.cidade = c.cidade;
      }
    }
    return [...porSlug.values()];
  }

  /** Pré-computa chave de busca, letra, destaques, grupos A–Z e faixa de letras. */
  private indexarCidades(brutas: CidadeResumo[]): void {
    this.cidades = EstadoComponent.fundirPorSlug(brutas).map((c) => {
      const chave = EstadoComponent.normalizar(c.cidade);
      return { ...c, chave, letra: (chave.charAt(0) || '#').toUpperCase() };
    });

    // Destaque = cidades com MAIS paróquias cadastradas. Deliberadamente NÃO é
    // "mais procuradas": o endpoint não expõe métrica de acesso, e afirmar
    // popularidade sem o dado seria inventar informação.
    this.principaisCidades = [...this.cidades]
      .sort((a, b) => b.totalParoquias - a.totalParoquias || a.cidade.localeCompare(b.cidade, 'pt-BR'))
      .slice(0, EstadoComponent.TOP);

    // O tile conta o que a lista realmente mostra. `totalCidades` do payload podia
    // vir inflado pelos slugs duplicados descritos em fundirPorSlug().
    if (this.cidades.length) this.totalCidades = this.cidades.length;

    this.gruposCompletos = this.agrupar(this.cidades);
    this.grupos = this.gruposCompletos;

    const comCidade = new Set(this.gruposCompletos.map((g) => g.letra));
    this.alfabeto = ALFABETO.map((letra) => ({ letra, ativa: comCidade.has(letra) }));
  }

  private agrupar(cidades: CidadeIndexada[]): GrupoAlfabetico[] {
    const mapa = new Map<string, CidadeIndexada[]>();
    for (const c of cidades) {
      const atual = mapa.get(c.letra);
      if (atual) atual.push(c);
      else mapa.set(c.letra, [c]);
    }
    return [...mapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([letra, lista]) => ({
        letra,
        cidades: [...lista].sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR')),
      }));
  }

  /**
   * Dias com página de intenção nesta UF — regra ANTI-THIN.
   *
   * Só entram slugs que a API declarou E que existem em DIAS_INTENCAO (fonte única
   * de slug/rótulo, compartilhada com as rotas e com o DiaDaSemanaHelper do
   * backend). Se a API não mandar o campo (versão anterior ao deploy), devolve
   * lista vazia e o bloco não é renderizado — nunca os 7 dias fixos, senão
   * linkaríamos `/missa-{dia}/{uf}` que não foi prerenderizado e pode vir vazio.
   * A ordem é sempre a canônica da semana, não a que a API enviou.
   */
  private montarDias(slugs: unknown): DiaLink[] {
    if (!Array.isArray(slugs)) return [];
    const rotulos = new Map(DIAS_INTENCAO.map((d) => [d.slug, d.nome]));
    const ordem = DIAS_INTENCAO.map((d) => d.slug);
    const unicos = [...new Set(slugs.map((s) => String(s)))];
    return unicos
      .filter((s) => rotulos.has(s))
      .sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b))
      .map((slug) => ({ slug, rotulo: rotulos.get(slug)! }));
  }

  // ============================ busca ============================

  /** Filtro do painel: só aqui há recálculo, e apenas quando o texto muda. */
  aoFiltrar(): void {
    const q = EstadoComponent.normalizar(this.busca.trim());
    this.grupos = q
      ? this.agrupar(this.cidades.filter((c) => c.chave.includes(q)))
      : this.gruposCompletos;
  }

  /** Autocomplete do hero: sugere cidades, não filtra o índice lá embaixo. */
  aoDigitarNoHero(): void {
    const q = EstadoComponent.normalizar(this.buscaHero.trim());
    this.sugestoes = q
      ? this.cidades.filter((c) => c.chave.includes(q)).slice(0, EstadoComponent.MAX_SUGESTOES)
      : [];
  }

  irParaCidade(cidade: CidadeResumo): void {
    this.buscaHero = '';
    this.sugestoes = [];
    this._router.navigate(['/missas', this.uf, cidade.cidadeSlug]);
  }

  /** Enter no hero vai para a primeira sugestão válida. */
  aoConfirmarHero(): void {
    const primeira = this.sugestoes[0];
    if (primeira) this.irParaCidade(primeira);
  }

  // ============================ navegação ============================

  /**
   * `anchorScrolling` não está habilitado no router, então rolagem por fragmento
   * não funcionaria — e não vale ligar globalmente só para isto. Também evita um
   * link interno apontando para a própria URL (ruído de crawl).
   */
  verTodasAsCidades(): void {
    this.revelarERolar('todas-cidades');
  }

  irParaLetra(letra: string): void {
    this.revelarERolar(`grupo-${letra}`);
  }

  /**
   * Expande o índice e rola até o alvo.
   *
   * O `detectChanges()` é obrigatório: o alvo pode estar em um grupo ainda
   * `display:none`, e sem caixa de layout o `scrollIntoView` é silenciosamente
   * ignorado. Não dá para adiar com `requestAnimationFrame`/`setTimeout` — o
   * agendador de change detection do Angular também usa rAF, então o callback
   * corria ANTES do DOM ser atualizado. Flush síncrono remove a corrida.
   */
  private revelarERolar(id: string): void {
    this.mostrarTodas = true;
    if (!this._ehBrowser) return;
    this._cdr.detectChanges();
    this._doc.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ============================ SEO ============================

  private aplicarSeo(seo: any): void {
    if (!seo) return;
    this._seo.update({
      title: seo.title,
      description: seo.description,
      canonical: seo.canonicalUrl,
      image: seo.ogImage ?? undefined,
    });
  }

  private aplicarJsonLd(): void {
    this._seo.setJsonLd('breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE}/home` },
        { '@type': 'ListItem', position: 2, name: 'Estados', item: `${SITE}/estados` },
        {
          '@type': 'ListItem',
          position: 3,
          name: `Missas em ${this.estadoNome}`,
          item: `${SITE}/missas/${this.uf}`,
        },
      ],
    });

    this._seo.setJsonLd('itemlist', {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Cidades com missa em ${this.estadoNome}`,
      numberOfItems: this.cidades.length,
      itemListElement: this.cidades.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.cidade,
        item: `${SITE}/missas/${this.uf}/${c.cidadeSlug}`,
      })),
    });
  }
}
