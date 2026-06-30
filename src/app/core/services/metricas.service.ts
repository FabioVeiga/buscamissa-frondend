import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

const JANELA_VISUALIZACAO_MS = 30 * 60 * 1000; // 30 minutos

@Injectable({ providedIn: 'root' })
export class MetricasService {
  private http = inject(HttpClient);

  registrarVisualizacaoIgreja(igrejaId: number): void {
    const chave = `igreja_${igrejaId}_ultima_visualizacao`;
    const agora = Date.now();
    const ultimaVisualizacao = Number(localStorage.getItem(chave) ?? 0);

    if (agora - ultimaVisualizacao < JANELA_VISUALIZACAO_MS) return;

    this.http
      .post('v2/metricas/visualizacao-igreja', { entidadeId: igrejaId })
      .subscribe({ error: () => {} });

    localStorage.setItem(chave, String(agora));
  }

  registrarCliqueRota(igrejaId: number): void {
    this.http
      .post('v2/metricas/clique-rota', { entidadeId: igrejaId })
      .subscribe({ error: () => {} });
  }

  registrarFavorito(igrejaId: number): void {
    this.http
      .post('v2/metricas/favorito', { entidadeId: igrejaId })
      .subscribe({ error: () => {} });
  }

  registrarCompartilhamento(igrejaId: number): void {
    this.http
      .post('v2/metricas/compartilhamento', { entidadeId: igrejaId })
      .subscribe({ error: () => {} });
  }

  registrarCliqueTelefone(igrejaId: number): void {
    this.http
      .post('v2/metricas/clique-telefone', { entidadeId: igrejaId })
      .subscribe({ error: () => {} });
  }

  registrarCliqueInstagram(igrejaId: number): void {
    this.http
      .post('v2/metricas/clique-instagram', { entidadeId: igrejaId })
      .subscribe({ error: () => {} });
  }

  registrarSugestaoEdicao(igrejaId: number): void {
    this.http
      .post('v2/metricas/sugestao-edicao', { entidadeId: igrejaId })
      .subscribe({ error: () => {} });
  }
}
