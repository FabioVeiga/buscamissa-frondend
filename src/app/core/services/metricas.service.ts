import { HttpClient } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LoggerService } from './logger.service';

const JANELA_VISUALIZACAO_MS = 30 * 60 * 1000; // 30 minutos

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

@Injectable({ providedIn: 'root' })
export class MetricasService {
  private http = inject(HttpClient);
  private logger = inject(LoggerService);
  /** No prerender (Node) não registramos visualização: geraria views-fantasma além
   * de tocar `localStorage`. Métricas só valem após a hidratação, no browser. */
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Métricas são fire-and-forget (não bloqueiam a UX), mas a falha é logada
  // no ponto central em vez de engolida silenciosamente.
  private enviar(rota: string, igrejaId: number): void {
    this.http
      .post(`v2/metricas/${rota}`, { entidadeId: igrejaId })
      .subscribe({
        error: (err) => this.logger.logError(err, `metrica:${rota}`),
      });
  }

  registrarVisualizacaoIgreja(igrejaId: number): void {
    if (!this._isBrowser) return;
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
    if (!this._isBrowser) return;
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
    if (!this._isBrowser) return;
    const chave = `pagina_${PaginaMetrica[pagina]}_ultima_visualizacao`;
    const agora = Date.now();
    const ultimaVisualizacao = Number(localStorage.getItem(chave) ?? 0);

    if (agora - ultimaVisualizacao < JANELA_VISUALIZACAO_MS) return;

    this.http
      .post('v2/metricas/visualizacao-pagina', { pagina })
      .subscribe({
        error: (err) => this.logger.logError(err, 'metrica:visualizacao-pagina'),
      });
    localStorage.setItem(chave, String(agora));
  }

  // Dedupe por UF — cada estado conta independente (30 min de janela por sigla).
  registrarVisualizacaoEstado(uf: string): void {
    if (!this._isBrowser) return;
    const ufNormalizada = uf.toUpperCase();
    const chave = `estado_${ufNormalizada}_ultima_visualizacao`;
    const agora = Date.now();
    const ultimaVisualizacao = Number(localStorage.getItem(chave) ?? 0);

    if (agora - ultimaVisualizacao < JANELA_VISUALIZACAO_MS) return;

    this.http
      .post('v2/metricas/visualizacao-estado', { uf: ufNormalizada })
      .subscribe({
        error: (err) => this.logger.logError(err, 'metrica:visualizacao-estado'),
      });
    localStorage.setItem(chave, String(agora));
  }

  // Dedupe por UF+cidade — mesma janela de 30 min, chave própria por cidade.
  registrarVisualizacaoCidade(uf: string, cidadeSlug: string, cidadeNome?: string): void {
    if (!this._isBrowser) return;
    const ufNormalizada = uf.toUpperCase();
    const chave = `cidade_${ufNormalizada}_${cidadeSlug}_ultima_visualizacao`;
    const agora = Date.now();
    const ultimaVisualizacao = Number(localStorage.getItem(chave) ?? 0);

    if (agora - ultimaVisualizacao < JANELA_VISUALIZACAO_MS) return;

    this.http
      .post('v2/metricas/visualizacao-cidade', { uf: ufNormalizada, cidadeSlug, cidadeNome })
      .subscribe({
        error: (err) => this.logger.logError(err, 'metrica:visualizacao-cidade'),
      });
    localStorage.setItem(chave, String(agora));
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
