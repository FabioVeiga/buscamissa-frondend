import { HttpClient } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LoggerService } from './logger.service';

const JANELA_VISUALIZACAO_MS = 30 * 60 * 1000; // 30 minutos

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
