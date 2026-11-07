import { ApplicationRef, Component, inject, OnInit } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Router, RouterOutlet } from '@angular/router';

import { AnalyticsService } from './analytics.service';

/**
 * O `index.html` desliga o page_view automático do gtag (`send_page_view: false`) e o
 * único page_view do site passa a ser o manual do `initPageTracking()`. Isso só é seguro
 * se a assinatura do router nascer ANTES do primeiro `NavigationEnd` — o `router.events`
 * é um Subject sem replay. Quem garante a ordem é o bootstrap do Angular (o componente
 * raiz faz o `ngOnInit` no `tick()`; a navegação inicial só começa no
 * APP_BOOTSTRAP_LISTENER). Este teste sobe um app de verdade com `bootstrapApplication`
 * e o mesmo padrão do AppComponent (`initPageTracking()` no `ngOnInit`), porque o
 * TestBed não passa por essa sequência.
 */
@Component({ selector: 'app-ga4-pagina', template: 'pagina' })
class PaginaComponent {}

@Component({
  selector: 'app-ga4-raiz',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class RaizComponent implements OnInit {
  private _analytics = inject(AnalyticsService);

  ngOnInit(): void {
    this._analytics.initPageTracking();
  }
}

describe('AnalyticsService — page_view no bootstrap', () => {
  const w = window as unknown as { gtag?: unknown };
  let gtagOriginal: unknown;
  let urlOriginal: string;
  let gtagSpy: jasmine.Spy;
  let host: HTMLElement;
  let appRef: ApplicationRef | null;

  const pageViews = () =>
    gtagSpy.calls.allArgs().filter((a) => a[0] === 'event' && a[1] === 'page_view');

  beforeEach(() => {
    gtagOriginal = w.gtag;
    urlOriginal = location.pathname + location.search + location.hash;
    gtagSpy = jasmine.createSpy('gtag');
    w.gtag = gtagSpy;
    host = document.createElement('app-ga4-raiz');
    document.body.appendChild(host);
    appRef = null;
  });

  afterEach(() => {
    appRef?.destroy();
    host.remove();
    history.replaceState(null, '', urlOriginal);
    if (gtagOriginal === undefined) delete w.gtag;
    else w.gtag = gtagOriginal;
  });

  async function subir(): Promise<Router> {
    appRef = await bootstrapApplication(RaizComponent, {
      providers: [provideRouter([{ path: '**', component: PaginaComponent }])],
    });
    await appRef.whenStable();
    return appRef.injector.get(Router);
  }

  it('primeiro carregamento gera exatamente um page_view', async () => {
    await subir();

    expect(pageViews().length).toBe(1);
    expect(pageViews()[0][2]).toEqual({ page_path: location.pathname });
  });

  it('cada navegação seguinte gera um page_view manual', async () => {
    const router = await subir();

    await router.navigateByUrl('/cidade-x');
    await router.navigateByUrl('/cidade-y');

    expect(pageViews().map((a) => a[2])).toEqual([
      { page_path: urlOriginal.split(/[?#]/)[0] },
      { page_path: '/cidade-x' },
      { page_path: '/cidade-y' },
    ]);
  });
});
