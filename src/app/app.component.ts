import { Component, inject, OnInit } from "@angular/core";
import { RouterOutlet, Router, NavigationEnd, ActivatedRoute } from "@angular/router";
import { filter, map, pairwise, startWith } from "rxjs/operators";
import { SeoService } from "./core/services/seo.service";
import { AnalyticsService } from "./core/services/analytics.service";
import { ClarityService } from "./core/services/clarity.service";

@Component({
  selector: "app-root",
  imports: [RouterOutlet],
  template: "<router-outlet>",
})
export class AppComponent implements OnInit {
  private _router = inject(Router);
  private _activatedRoute = inject(ActivatedRoute);
  private _seo = inject(SeoService);
  private _analytics = inject(AnalyticsService);
  private _clarity = inject(ClarityService);

  ngOnInit(): void {
    this._analytics.initPageTracking();
    this._initClarityGlobalTags();

    const navEnd$ = this._router.events.pipe(filter(e => e instanceof NavigationEnd));

    // Rastreia rota anterior para uso no ClarityService
    navEnd$.pipe(
      map(e => (e as NavigationEnd).urlAfterRedirects),
      startWith(''),
      pairwise()
    ).subscribe(([prev]) => this._clarity.setPrevRoute(prev));

    navEnd$.pipe(
      map(() => {
        let route = this._activatedRoute;
        while (route.firstChild) route = route.firstChild;
        return route.snapshot.data;
      })
    ).subscribe(data => {
      if (data['title']) {
        this._seo.update({
          title: data['title'],
          description: data['description'],
          canonical: data['canonical'],
        });
      }
    });
  }

  private _initClarityGlobalTags(): void {
    // Aguarda o script do Clarity carregar (é async)
    const apply = () => {
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      this._clarity.tag('dispositivo', isMobile ? 'mobile' : 'desktop');
      this._clarity.tag('idioma', navigator.language);

      const isNew = !localStorage.getItem('bm_visited');
      this._clarity.tag('novo_usuario', isNew ? 'sim' : 'nao');
      if (isNew) localStorage.setItem('bm_visited', '1');

      this._clarity.tag('origem_sessao', this._clarity.detectSessionOrigin());
    };

    if ((window as any).clarity) {
      apply();
    } else {
      setTimeout(apply, 2000);
    }
  }
}
