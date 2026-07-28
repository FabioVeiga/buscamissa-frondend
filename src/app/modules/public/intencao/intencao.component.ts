import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { SkeletonModule } from 'primeng/skeleton';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';
import { SeoService } from '../../../core/services/seo.service';
import { DIAS_INTENCAO } from '../../../core/constants/dias-intencao';

const SITE = 'https://buscamissa.com.br';

const ROTULO: Record<string, string> = {
  domingo: 'domingo',
  'segunda-feira': 'segunda-feira',
  'terca-feira': 'terça-feira',
  'quarta-feira': 'quarta-feira',
  'quinta-feira': 'quinta-feira',
  'sexta-feira': 'sexta-feira',
  sabado: 'sábado',
};

type Nivel = 'nacional' | 'uf' | 'cidade';

/**
 * Árvore de INTENÇÃO (`/missa-{dia}[/:uf[/:cidade]]`) — Fase 3 SEO. Um componente,
 * três níveis (via `data.dia` + params): nacional (lista UFs), UF (lista cidades)
 * e cidade (folha: paróquias com os horários do dia). O dia vem de `route.data.dia`
 * porque o slug (`missa-domingo`) é literal na rota, não um :param.
 */
@Component({
  selector: 'app-intencao',
  standalone: true,
  imports: [CommonModule, RouterLink, SkeletonModule],
  templateUrl: './intencao.component.html',
  styleUrl: './intencao.component.scss',
})
export class IntencaoComponent implements OnInit {
  private _route = inject(ActivatedRoute);
  private _seo = inject(SeoService);
  private _api = inject(SeoPaginasService);
  private _destroyRef = inject(DestroyRef);

  isLoading = false;
  erroCarregar = false;
  naoEncontrado = false;

  dia = '';
  uf = '';
  cidadeSlug = '';
  nivel: Nivel = 'nacional';

  get rotulo(): string {
    return ROTULO[this.dia] ?? this.dia;
  }

  /** Demais dias (para linkagem "outros dias" na mesma cidade). */
  get outrosDias() {
    return DIAS_INTENCAO.filter((d) => d.slug !== this.dia);
  }

  // Dados por nível.
  estados: { uf: string; estado: string }[] = [];
  estadoNome = '';
  cidades: { cidadeSlug: string; cidade: string; paroquias?: unknown[] }[] = [];
  cidadeNome = '';
  paroquias: any[] = [];

  ngOnInit(): void {
    combineLatest([this._route.data, this._route.paramMap])
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe(([data, pm]) => {
        this.dia = (data['dia'] as string) ?? '';
        this.uf = (pm.get('uf') ?? '').toLowerCase();
        this.cidadeSlug = (pm.get('cidade') ?? '').toLowerCase();
        this.nivel = this.cidadeSlug ? 'cidade' : this.uf ? 'uf' : 'nacional';
        this.carregar();
      });
  }

  carregar(): void {
    this.isLoading = true;
    this.erroCarregar = false;
    this.naoEncontrado = false;

    if (this.nivel === 'cidade') this.carregarCidade();
    else this.carregarHub();
  }

  private carregarCidade(): void {
    this._api
      .getIntencaoCidade(this.dia, this.uf, this.cidadeSlug)
      .pipe(takeUntilDestroyed(this._destroyRef), finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (data: any) => {
          if (!data) return void (this.naoEncontrado = true);
          this.cidadeNome = data.cidade ?? '';
          this.paroquias = data.paroquias ?? [];
          this.aplicarSeo(data.seo);
          this.jsonLdBreadcrumb();
          this.jsonLdItemList(
            this.paroquias.map((p) => ({ nome: p.nome, url: this.urlParoquia(p) })),
            `Paróquias com missa de ${this.rotulo} em ${this.cidadeNome}`,
          );
        },
        error: (err) => this.tratarErro(err),
      });
  }

  private carregarHub(): void {
    this._api
      .getArvoreDia(this.dia, this.nivel === 'uf' ? this.uf : undefined)
      .pipe(takeUntilDestroyed(this._destroyRef), finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (arvore: any) => {
          if (!arvore?.estados) return void (this.naoEncontrado = true);
          if (this.nivel === 'nacional') {
            this.estados = arvore.estados.map((e: any) => ({ uf: e.uf, estado: e.estado }));
            this.aplicarSeo(arvore.seo);
            this.jsonLdBreadcrumb();
            this.jsonLdItemList(
              this.estados.map((e) => ({ nome: e.estado, url: `${SITE}/missa-${this.dia}/${e.uf}` })),
              `Estados com missa de ${this.rotulo}`,
            );
          } else {
            const estado = arvore.estados.find((e: any) => e.uf?.toLowerCase() === this.uf);
            if (!estado) return void (this.naoEncontrado = true);
            this.estadoNome = estado.estado ?? '';
            this.cidades = estado.cidades ?? [];
            this.aplicarSeo(estado.seo);
            this.jsonLdBreadcrumb();
            this.jsonLdItemList(
              this.cidades.map((c) => ({ nome: c.cidade, url: `${SITE}/missa-${this.dia}/${this.uf}/${c.cidadeSlug}` })),
              `Cidades com missa de ${this.rotulo} em ${this.estadoNome}`,
            );
          }
        },
        error: (err) => this.tratarErro(err),
      });
  }

  private tratarErro(err: any): void {
    if (err?.status === 404) this.naoEncontrado = true;
    else this.erroCarregar = true;
  }

  tentarNovamente(): void {
    this.carregar();
  }

  urlParoquia(p: any): string {
    const uf = p?.endereco?.uf?.toLowerCase() ?? this.uf;
    const cidade = p?.endereco?.cidadeSlug ?? this.cidadeSlug;
    return p?.slug ? `/paroquia/${uf}/${cidade}/${p.slug}` : `/igrejas/${p?.nomeUnico}`;
  }

  horariosDoDia(p: any): string {
    return (p?.missas ?? [])
      .map((m: any) => (m?.horario ?? '').slice(0, 5))
      .filter(Boolean)
      .join(', ');
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

  private jsonLdBreadcrumb(): void {
    const itens: any[] = [
      { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE}/home` },
      { '@type': 'ListItem', position: 2, name: `Missa de ${this.rotulo}`, item: `${SITE}/missa-${this.dia}` },
    ];
    if (this.nivel !== 'nacional') {
      itens.push({
        '@type': 'ListItem',
        position: 3,
        name: this.estadoNome || this.uf.toUpperCase(),
        item: `${SITE}/missa-${this.dia}/${this.uf}`,
      });
    }
    if (this.nivel === 'cidade') {
      itens.push({ '@type': 'ListItem', position: 4, name: this.cidadeNome });
    }
    this._seo.setJsonLd('breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: itens,
    });
  }

  private jsonLdItemList(itens: { nome: string; url?: string }[], nome: string): void {
    this._seo.setJsonLd('itemlist', {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: nome,
      numberOfItems: itens.length,
      itemListElement: itens.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: it.nome,
        ...(it.url ? { item: it.url } : {}),
      })),
    });
  }
}
