import { Component, inject, OnInit, PLATFORM_ID } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { RouterOutlet, Router, NavigationEnd, NavigationStart, ActivatedRoute } from "@angular/router";
import { filter, map, pairwise, startWith } from "rxjs/operators";
import { SeoService } from "./core/services/seo.service";
import { AnalyticsService } from "./core/services/analytics.service";
import { ClarityService } from "./core/services/clarity.service";
import { NavigationHistoryService } from "./core/services/navigation-history.service";
import { ConsentService } from "./core/services/consent.service";

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
  private _navHistory = inject(NavigationHistoryService);
  private _consent = inject(ConsentService);
  private _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngOnInit(): void {
    const navEnd$ = this._router.events.pipe(filter(e => e instanceof NavigationEnd));

    // SEO deve rodar TAMBÉM no servidor (prerender) — é o que injeta title/meta/
    // canonical no HTML estático. Por isso fica fora da guarda de browser.
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
          // Sem canonical na rota = rota dinâmica (paróquia, cidade, estado...): a
          // canonical vem da API, pelo componente. Até lá a página fica SEM canonical,
          // em vez de ganhar a `document.URL` — que numa URL inexistente é ela mesma.
          canonical: data['canonical'] ?? null,
          noindex: data['noindex'],
        });
      }
      // A11y: move o foco para o <main> a cada navegação SPA. Só no browser
      // (o DOM do servidor não tem foco).
      if (this._isBrowser) {
        document.getElementById('conteudo')?.focus({ preventScroll: true });
      }
    });

    // Analytics/Clarity/histórico são exclusivamente de browser.
    if (!this._isBrowser) return;

    this._consent.iniciar();
    this._analytics.initPageTracking();
    this._initClarityGlobalTags();

    // Topo da página ao trocar de PÁGINA (path). Antes isso acontecia por acidente:
    // a rota nova nascia curta, o documento encolhia e o navegador cortava o scroll
    // para 0. Com o <main> em min-height (anti-CLS do footer, layout.component.ts),
    // o documento não encolhe mais, e a rota nova abriria na altura de scroll da
    // anterior — no meio de uma página ainda carregando, onde a chegada dos dados
    // empurra o que está na tela (medido: estado → cidade, CLS 1,44 no desktop).
    // Só o path conta: os filtros de cidade/busca reescrevem a query e não podem
    // jogar o usuário para o topo. Back/forward segue com a restauração nativa.
    let gatilho: NavigationStart['navigationTrigger'];
    this._router.events
      .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart))
      .subscribe(e => (gatilho = e.navigationTrigger));
    const caminho = (url: string) => url.split(/[?#]/)[0];
    navEnd$.pipe(
      map(e => (e as NavigationEnd).urlAfterRedirects),
      pairwise()
    ).subscribe(([anterior, atual]) => {
      if (gatilho !== 'popstate' && !atual.includes('#') && caminho(anterior) !== caminho(atual)) {
        window.scrollTo(0, 0);
      }
    });

    // Rastreia rota anterior para uso no ClarityService
    navEnd$.pipe(
      map(e => (e as NavigationEnd).urlAfterRedirects),
      startWith(''),
      pairwise()
    ).subscribe(([prev]) => {
      this._clarity.setPrevRoute(prev);
      this._navHistory.track(prev);
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
