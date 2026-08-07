import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { SkeletonModule } from 'primeng/skeleton';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';
import { SeoService } from '../../../core/services/seo.service';
import { HubListaComponent, HubBreadcrumb, HubItem } from '../../../shared/components/hub-lista/hub-lista.component';

const SITE = 'https://buscamissa.com.br';

const DIAS: { slug: string; label: string }[] = [
  { slug: 'domingo', label: 'Domingo' },
  { slug: 'segunda-feira', label: 'Segunda-feira' },
  { slug: 'terca-feira', label: 'Terça-feira' },
  { slug: 'quarta-feira', label: 'Quarta-feira' },
  { slug: 'quinta-feira', label: 'Quinta-feira' },
  { slug: 'sexta-feira', label: 'Sexta-feira' },
  { slug: 'sabado', label: 'Sábado' },
];

/**
 * Hub de ESTADO (`/missas/:uf`) — Fase 3 SEO. Lista as cidades da UF com paróquias
 * e distribui autoridade para os níveis abaixo (cidade) e para a intenção por dia.
 * Dados por-item de /v2/seo/estado/{uf}; no prerender vêm do bulk (interceptor).
 */
@Component({
  selector: 'app-estado',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SkeletonModule, HubListaComponent],
  templateUrl: './estado.component.html',
  styleUrl: './estado.component.scss',
})
export class EstadoComponent implements OnInit {
  private _route = inject(ActivatedRoute);
  private _seo = inject(SeoService);
  private _api = inject(SeoPaginasService);
  private _destroyRef = inject(DestroyRef);

  readonly dias = DIAS;

  isLoading = false;
  erroCarregar = false;
  naoEncontrado = false;

  static readonly LIMITE = 12;

  uf = '';
  estadoNome = '';
  totalCidades = 0;
  totalParoquias = 0;
  cidades: { cidadeSlug: string; cidade: string; totalParoquias: number }[] = [];

  /** Busca client-side de cidade (CTA principal) e "ver todas". */
  busca = '';
  mostrarTodas = false;

  get faqs(): { pergunta: string; resposta: string }[] {
    const e = this.estadoNome || 'seu estado';
    return [
      {
        pergunta: `Como encontrar uma missa em uma cidade específica de ${e}?`,
        resposta: `Use a busca acima ou escolha a cidade na lista. Você verá as paróquias e os horários de missa cadastrados naquela cidade.`,
      },
      {
        pergunta: 'Os horários de missa estão sempre atualizados?',
        resposta: 'Os horários são atualizados pelas próprias paróquias e pela equipe do BuscaMissa. Cada horário mostra um sinal de confiança indicando o quão recente é a informação.',
      },
      {
        pergunta: 'Como solicitar a inclusão ou atualização de uma paróquia?',
        resposta: 'Você pode cadastrar uma nova paróquia ou sugerir correções pela opção "Cadastrar igreja" no menu.',
      },
    ];
  }

  get breadcrumb(): HubBreadcrumb[] {
    return [
      { label: 'Início', link: ['/home'] },
      { label: 'Estados', link: ['/estados'] },
      { label: this.estadoNome },
    ];
  }

  private norm(s: string): string {
    return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  get cidadesFiltradas() {
    const q = this.norm(this.busca.trim());
    return q ? this.cidades.filter((c) => this.norm(c.cidade).includes(q)) : this.cidades;
  }

  readonly limiteCidades = EstadoComponent.LIMITE;

  /** TODAS as cidades filtradas viram itens — o hub-lista só OCULTA (display:none,
   *  sem tirar do HTML) além do limite, preservando os links internos/SEO. */
  get itensCidades(): HubItem[] {
    return this.cidadesFiltradas.map((c) => ({
      nome: c.cidade,
      meta: `${c.totalParoquias} paróquia(s)`,
      link: ['/missas', this.uf, c.cidadeSlug],
    }));
  }

  /** Expande o grid quando "ver todas" foi clicado ou há busca ativa. */
  get expandido(): boolean {
    return this.mostrarTodas || !!this.busca.trim();
  }

  get temMaisCidades(): boolean {
    return !this.expandido && this.cidadesFiltradas.length > EstadoComponent.LIMITE;
  }

  get subtituloEstado(): string {
    return `Encontre horários de missa em ${this.totalParoquias} paróquias distribuídas por ${this.totalCidades} cidades.`;
  }

  ngOnInit(): void {
    this._route.paramMap.pipe(takeUntilDestroyed(this._destroyRef)).subscribe((pm) => {
      this.uf = (pm.get('uf') ?? '').toLowerCase();
      this.carregar();
    });
  }

  private carregar(): void {
    this.isLoading = true;
    this.erroCarregar = false;
    this.naoEncontrado = false;

    this._api
      .getEstado(this.uf)
      .pipe(
        takeUntilDestroyed(this._destroyRef),
        finalize(() => (this.isLoading = false)),
      )
      .subscribe({
        next: (data: any) => {
          if (!data) {
            this.naoEncontrado = true;
            return;
          }
          this.estadoNome = data.estado ?? '';
          this.totalCidades = data.totalCidades ?? 0;
          this.totalParoquias = data.totalParoquias ?? 0;
          this.cidades = data.cidades ?? [];
          this.aplicarSeo(data.seo);
          this.aplicarJsonLd();
        },
        error: (err) => {
          if (err?.status === 404) this.naoEncontrado = true;
          else this.erroCarregar = true;
        },
      });
  }

  tentarNovamente(): void {
    this.carregar();
  }

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
        { '@type': 'ListItem', position: 2, name: `Missas em ${this.estadoNome}`, item: `${SITE}/missas/${this.uf}` },
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
