import { Injectable, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';

export interface SeoData {
  title: string;
  description?: string;
  canonical?: string;
  /** Imagem de compartilhamento específica da rota (og:image / twitter:image). */
  image?: string;
  /** true = página privada/transacional (login, painel...): não deve ser indexada. */
  noindex?: boolean;
  /**
   * Só tem efeito junto com `noindex`. Default `false` = `noindex, nofollow`, que é o
   * certo para página privada ou inexistente (não há para onde mandar o robô).
   *
   * `true` emite `noindex, follow`, para a página que EXISTE e é linkada mas não deve
   * ser indexada agora — caso da paróquia real ainda sem horários. Ali o `nofollow`
   * seria errado: a página tem breadcrumb e links de hub legítimos, e não queremos
   * cortar esses caminhos de rastreamento só porque o conteúdo ainda está incompleto.
   */
  seguirLinks?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private _title = inject(Title);
  private _meta = inject(Meta);
  private _doc = inject(DOCUMENT);

  update(data: SeoData): void {
    this._title.setTitle(data.title);

    // Páginas privadas/transacionais (login, painel do responsável) nunca
    // devem ser indexadas nem seguidas pelo Google.
    const robots = data.noindex
      ? (data.seguirLinks ? 'noindex, follow' : 'noindex, nofollow')
      : 'index, follow';
    this._meta.updateTag({ name: 'robots', content: robots });

    if (data.description) {
      this._meta.updateTag({ name: 'description', content: data.description });
      this._meta.updateTag({ property: 'og:description', content: data.description });
      this._meta.updateTag({ name: 'twitter:description', content: data.description });
    }

    this._meta.updateTag({ property: 'og:title', content: data.title });
    this._meta.updateTag({ name: 'twitter:title', content: data.title });

    const canonicalUrl = data.canonical ?? this._doc.URL.split('?')[0];
    let link: HTMLLinkElement | null = this._doc.querySelector('link[rel="canonical"]');
    if (!link) {
      link = this._doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this._doc.head.appendChild(link);
    }
    link.setAttribute('href', canonicalUrl);

    // og:url acompanha a URL canônica da rota (evita ficar preso na home).
    this._meta.updateTag({ property: 'og:url', content: canonicalUrl });

    // og:image/twitter:image específicos da rota, quando informados.
    //
    // O `else` é essencial na navegação SPA: sem ele a imagem da rota ANTERIOR
    // sobrevive. Como vários payloads de SEO trazem ogImage nulo (hubs de estado,
    // cidade, intenção), uma paróquia visitada antes emprestava a própria foto ao
    // compartilhamento da página seguinte. No prerender o bug não aparece — cada
    // página é um documento novo —, só na navegação client-side.
    if (data.image) {
      this._meta.updateTag({ property: 'og:image', content: data.image });
      this._meta.updateTag({ name: 'twitter:image', content: data.image });
    } else {
      this._meta.removeTag("property='og:image'");
      this._meta.removeTag("name='twitter:image'");
    }
  }

  /**
   * Injeta (ou substitui) um bloco de dados estruturados Schema.org (JSON-LD).
   * O `id` identifica o bloco para permitir atualização/remoção entre navegações.
   */
  setJsonLd(id: string, data: unknown): void {
    const elId = `ld-${id}`;
    let script = this._doc.getElementById(elId) as HTMLScriptElement | null;
    if (!script) {
      script = this._doc.createElement('script');
      script.id = elId;
      script.type = 'application/ld+json';
      this._doc.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
  }

  removeJsonLd(id: string): void {
    const el = this._doc.getElementById(`ld-${id}`);
    if (el) el.remove();
  }
}
