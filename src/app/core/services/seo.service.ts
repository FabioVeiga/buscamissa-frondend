import { Injectable, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';

export interface SeoData {
  title: string;
  description?: string;
  canonical?: string;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private _title = inject(Title);
  private _meta = inject(Meta);
  private _doc = inject(DOCUMENT);

  update(data: SeoData): void {
    this._title.setTitle(data.title);

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
