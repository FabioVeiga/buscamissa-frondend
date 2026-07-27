import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { SkeletonModule } from 'primeng/skeleton';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';
import { SeoService } from '../../../core/services/seo.service';

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
  imports: [CommonModule, RouterLink, SkeletonModule],
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

  uf = '';
  estadoNome = '';
  totalCidades = 0;
  totalParoquias = 0;
  cidades: { cidadeSlug: string; cidade: string; totalParoquias: number }[] = [];

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
