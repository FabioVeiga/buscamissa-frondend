import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { LoggerService } from './logger.service';

const JANELA_VISUALIZACAO_MS = 30 * 60 * 1000; // 30 minutos

@Injectable({ providedIn: 'root' })
export class MetricasService {
  private http = inject(HttpClient);
  private logger = inject(LoggerService);

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
    const chave = `igreja_${igrejaId}_ultima_visualizacao`;
    const agora = Date.now();
    const ultimaVisualizacao = Number(localStorage.getItem(chave) ?? 0);

    if (agora - ultimaVisualizacao < JANELA_VISUALIZACAO_MS) return;

    this.enviar('visualizacao-igreja', igrejaId);
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
