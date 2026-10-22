import { HttpClient } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LoggerService } from './logger.service';

const JANELA_VISUALIZACAO_MS = 30 * 60 * 1000; // 30 minutos

// Crawlers que executam JavaScript (Googlebot, Bingbot, robôs de IA) e navegadores headless
// carregam as páginas com localStorage limpo e furariam o dedupe de 30 min, contando uma
// visualização por URL. O filtro é de higiene: a API repete a checagem de user-agent.
const UA_ROBO =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|perplexity|ccbot|bytespider|phantomjs|python-requests|scrapy/i;

// Sinais de presença humana. `scroll` fica de fora de propósito: o próprio roteador rola a
// página programaticamente ao navegar, o que simularia uma interação.
const EVENTOS_INTERACAO = ['pointerdown', 'touchstart', 'keydown', 'wheel'] as const;

function detectarRobo(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.webdriver === true || !navigator.userAgent || UA_ROBO.test(navigator.userAgent);
}

/**
 * Espelha Enums/TipoPaginaEnum.cs do backend (api-public). Valores numéricos —
 * o backend não usa JsonStringEnumConverter, então o enum é serializado como int.
 */
export enum PaginaMetrica {
  Cidades = 1,
  MissaAgora = 2,
  ComoFunciona = 3,
  MinhasIgrejas = 4,
  GuiaResponsavel = 5,
  Entrar = 6,
  Estado = 7,
  Cidade = 8,
  IntencaoDia = 9,
  Estados = 10,
  Dias = 11,
  MissaHoje = 12,
  NovaIgreja = 13,
  EditarIgreja = 14,
  CepRedirect = 15,
  EnviarCodigo = 16,
  ValidarCodigo = 17,
  Anuncios = 18,
  Contribuir = 19,
  Solicitar = 20,
  MeuPainel = 21,
  EditarIgrejaPainel = 22,
  Cookies = 23,
  Privacidade = 24,
  Termos = 25,
  NaoEncontrado = 26,
}

/**
 * Páginas folha de SEO (milhares de URLs no sitemap, abertas em massa por crawlers): a
 * visualização só conta depois de uma interação humana na página.
 */
const PAGINAS_COM_INTERACAO = new Set<PaginaMetrica>([
  PaginaMetrica.IntencaoDia,
  PaginaMetrica.Cidade,
  PaginaMetrica.Estado,
]);

/** Origem do clique em "Anuncie no BuscaMissa" (EntidadeId de TipoEntidade=Anuncio). */
export enum OrigemAnuncie {
  Rodape = 1,
  Home = 2,
  Cidade = 3,
  Estado = 4,
  Pagina = 5,
  Formulario = 6,
}

/** Espelha TipoMetricaEnum (10..12) no backend. */
export enum EventoAnuncio {
  CliqueAnuncie = 10,
  ImpressaoAnuncio = 11,
  CliqueAnuncio = 12,
}

@Injectable({ providedIn: 'root' })
export class MetricasService {
  private http = inject(HttpClient);
  private logger = inject(LoggerService);
  /** No prerender (Node) não registramos visualização: geraria views-fantasma além
   * de tocar `localStorage`. Métricas só valem após a hidratação, no browser. */
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** Só browser e só visitante não-robô registram métrica. */
  private readonly _podeRegistrar = this._isBrowser && !detectarRobo();
  /** Chaves aguardando a primeira interação humana (evita ouvintes duplicados). */
  private readonly _aguardandoInteracao = new Set<string>();

  // Métricas são fire-and-forget (não bloqueiam a UX), mas a falha é logada
  // no ponto central em vez de engolida silenciosamente.
  private enviar(rota: string, igrejaId: number): void {
    if (!this._podeRegistrar) return;
    this.http
      .post(`v2/metricas/${rota}`, { entidadeId: igrejaId })
      .subscribe({
        error: (err) => this.logger.logError(err, `metrica:${rota}`),
      });
  }

  // Sem dedupe de cliques (cada clique é uma intenção); a impressão de campanhas
  // deve ser deduplicada por sessão por quem a chama.
  registrarEventoAnuncio(evento: EventoAnuncio, entidadeId: number): void {
    if (!this._podeRegistrar) return;
    this.http
      .post('v2/metricas/evento-anuncio', { evento, entidadeId })
      .subscribe({
        error: (err) => this.logger.logError(err, 'metrica:evento-anuncio'),
      });
  }

  registrarCliqueAnuncie(origem: OrigemAnuncie): void {
    this.registrarEventoAnuncio(EventoAnuncio.CliqueAnuncie, origem);
  }

  /** Executa `acao` na primeira interação humana; ouvintes saem juntos ao disparar. */
  private aposInteracao(chave: string, acao: () => void): void {
    if (this._aguardandoInteracao.has(chave)) return;
    this._aguardandoInteracao.add(chave);
    const disparar = () => {
      EVENTOS_INTERACAO.forEach((e) => window.removeEventListener(e, disparar));
      this._aguardandoInteracao.delete(chave);
      acao();
    };
    EVENTOS_INTERACAO.forEach((e) => window.addEventListener(e, disparar, { passive: true }));
  }

  /**
   * Dedupe de 30 min por chave. Com `exigirInteracao`, o envio e a gravação da janela esperam
   * a primeira interação humana; a janela é conferida de novo na hora (outra aba pode ter contado).
   */
  private registrarComJanela(chave: string, exigirInteracao: boolean, enviarMetrica: () => void): void {
    const dentroDaJanela = () => Date.now() - Number(localStorage.getItem(chave) ?? 0) < JANELA_VISUALIZACAO_MS;
    if (dentroDaJanela()) return;

    const contar = () => {
      if (dentroDaJanela()) return;
      enviarMetrica();
      localStorage.setItem(chave, String(Date.now()));
    };
    if (exigirInteracao) this.aposInteracao(chave, contar);
    else contar();
  }

  registrarVisualizacaoIgreja(igrejaId: number): void {
    if (!this._podeRegistrar) return;
    const chave = `igreja_${igrejaId}_ultima_visualizacao`;
    const agora = Date.now();
    const ultimaVisualizacao = Number(localStorage.getItem(chave) ?? 0);

    if (agora - ultimaVisualizacao < JANELA_VISUALIZACAO_MS) return;

    this.enviar('visualizacao-igreja', igrejaId);
    localStorage.setItem(chave, String(agora));
  }

  // Home não tem EntidadeId — mesma janela de dedupe das demais métricas,
  // para não contar o mesmo visitante várias vezes em navegações rápidas (F5).
  registrarVisualizacaoHome(): void {
    if (!this._podeRegistrar) return;
    const chave = 'home_ultima_visualizacao';
    const agora = Date.now();
    const ultimaVisualizacao = Number(localStorage.getItem(chave) ?? 0);

    if (agora - ultimaVisualizacao < JANELA_VISUALIZACAO_MS) return;

    this.http
      .post('v2/metricas/visualizacao-home', {})
      .subscribe({
        error: (err) => this.logger.logError(err, 'metrica:visualizacao-home'),
      });
    localStorage.setItem(chave, String(agora));
  }

  // Mesma janela de dedupe das demais visualizações, uma chave por página.
  registrarVisualizacaoPagina(pagina: PaginaMetrica): void {
    if (!this._podeRegistrar) return;
    const chave = `pagina_${PaginaMetrica[pagina]}_ultima_visualizacao`;

    this.registrarComJanela(chave, PAGINAS_COM_INTERACAO.has(pagina), () => {
      this.http
        .post('v2/metricas/visualizacao-pagina', { pagina })
        .subscribe({
          error: (err) => this.logger.logError(err, 'metrica:visualizacao-pagina'),
        });
    });
  }

  // Dedupe por UF — cada estado conta independente (30 min de janela por sigla).
  registrarVisualizacaoEstado(uf: string): void {
    if (!this._podeRegistrar) return;
    const ufNormalizada = uf.toUpperCase();
    const chave = `estado_${ufNormalizada}_ultima_visualizacao`;

    this.registrarComJanela(chave, true, () => {
      this.http
        .post('v2/metricas/visualizacao-estado', { uf: ufNormalizada })
        .subscribe({
          error: (err) => this.logger.logError(err, 'metrica:visualizacao-estado'),
        });
    });
  }

  // Dedupe por UF+cidade — mesma janela de 30 min, chave própria por cidade.
  registrarVisualizacaoCidade(uf: string, cidadeSlug: string, cidadeNome?: string): void {
    if (!this._podeRegistrar) return;
    const ufNormalizada = uf.toUpperCase();
    const chave = `cidade_${ufNormalizada}_${cidadeSlug}_ultima_visualizacao`;

    this.registrarComJanela(chave, true, () => {
      this.http
        .post('v2/metricas/visualizacao-cidade', { uf: ufNormalizada, cidadeSlug, cidadeNome })
        .subscribe({
          error: (err) => this.logger.logError(err, 'metrica:visualizacao-cidade'),
        });
    });
  }

  registrarCliqueRota(igrejaId: number): void {
    this.enviar('clique-rota', igrejaId);
  }

  registrarFavorito(igrejaId: number): void {
    this.enviar('favorito', igrejaId);
  }

  registrarCompartilhamento(igrejaId: number): void {
    this.enviar('compartilhamento', igrejaId);
  }

  registrarCliqueTelefone(igrejaId: number): void {
    this.enviar('clique-telefone', igrejaId);
  }

  registrarCliqueInstagram(igrejaId: number): void {
    this.enviar('clique-instagram', igrejaId);
  }

  registrarSugestaoEdicao(igrejaId: number): void {
    this.enviar('sugestao-edicao', igrejaId);
  }
}
