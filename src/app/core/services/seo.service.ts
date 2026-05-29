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
}
