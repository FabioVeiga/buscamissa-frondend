import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MetricasService, PaginaMetrica } from './metricas.service';

const UA_HUMANO =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('MetricasService (filtro de robôs)', () => {
  let http: HttpTestingController;

  // O Karma roda em ChromeHeadless, cujo user-agent já é de robô; cada teste fixa o seu.
  function criar(userAgent: string, webdriver = false): MetricasService {
    Object.defineProperty(navigator, 'userAgent', { get: () => userAgent, configurable: true });
    Object.defineProperty(navigator, 'webdriver', { get: () => webdriver, configurable: true });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(MetricasService);
  }

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    delete (navigator as any).userAgent;
    delete (navigator as any).webdriver;
    localStorage.clear();
  });

  it('visitante humano registra a visualização e respeita a janela de 30 min', () => {
    const service = criar(UA_HUMANO);
    service.registrarVisualizacaoPagina(PaginaMetrica.Dias);
    service.registrarVisualizacaoPagina(PaginaMetrica.Dias);

    expect(http.match('v2/metricas/visualizacao-pagina').length).toBe(1);
  });

  it('user-agent de robô não envia nenhuma métrica', () => {
    const service = criar('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
    service.registrarVisualizacaoPagina(PaginaMetrica.Dias);
    service.registrarVisualizacaoIgreja(1);
    service.registrarCliqueRota(1);
    service.registrarEventoAnuncio(11, 1);

    expect(http.match(() => true).length).toBe(0);
  });

  it('navigator.webdriver (automação) não envia nenhuma métrica', () => {
    const service = criar(UA_HUMANO, true);
    service.registrarVisualizacaoPagina(PaginaMetrica.Dias);
    service.registrarVisualizacaoCidade('SP', 'santos');

    expect(http.match(() => true).length).toBe(0);
  });

  it('página folha de SEO só conta depois de uma interação humana', () => {
    const service = criar(UA_HUMANO);
    service.registrarVisualizacaoPagina(PaginaMetrica.IntencaoDia);
    expect(http.match('v2/metricas/visualizacao-pagina').length).toBe(0);

    window.dispatchEvent(new Event('pointerdown'));
    expect(http.match('v2/metricas/visualizacao-pagina').length).toBe(1);

    window.dispatchEvent(new Event('pointerdown'));
    expect(http.match('v2/metricas/visualizacao-pagina').length).toBe(0);
  });

  it('rolagem programática (scroll) não conta como interação', () => {
    const service = criar(UA_HUMANO);
    service.registrarVisualizacaoCidade('SP', 'santos');

    window.dispatchEvent(new Event('scroll'));
    expect(http.match('v2/metricas/visualizacao-cidade').length).toBe(0);

    window.dispatchEvent(new Event('touchstart'));
    expect(http.match('v2/metricas/visualizacao-cidade').length).toBe(1);
  });

  it('várias chamadas antes da interação geram uma única visualização', () => {
    const service = criar(UA_HUMANO);
    service.registrarVisualizacaoEstado('SP');
    service.registrarVisualizacaoEstado('SP');

    window.dispatchEvent(new Event('keydown'));
    expect(http.match('v2/metricas/visualizacao-estado').length).toBe(1);
  });
});
