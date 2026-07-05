import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Igreja salva como favorita pelo usuário (persistida em localStorage).
 * Formato único usado por todas as telas.
 */
export interface IgrejaFavorita {
  id: number;
  nome: string;
  uf?: string;
  cidadeSlug?: string;
  slug?: string;
  /** Fallback para a rota legada /igrejas/:nomeUnico quando `slug` não é confiável. */
  nomeUnico?: string;
  diaSemana?: number | null;
  horario?: string | null;
  proximaMissaLabel?: string;
}

/**
 * Fonte única de verdade para as igrejas favoritas.
 * Centraliza a leitura/gravação em localStorage (antes duplicada em 7 arquivos)
 * e expõe um Observable para manter as telas sincronizadas.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private static readonly KEY = 'buscamissa_favoritas';

  private readonly _favoritas$ = new BehaviorSubject<IgrejaFavorita[]>(this.ler());
  /** Emite a lista atual sempre que houver alteração. */
  readonly favoritas$ = this._favoritas$.asObservable();

  /** Lista atual de favoritas (cópia segura do localStorage). */
  listar(): IgrejaFavorita[] {
    return this.ler();
  }

  quantidade(): number {
    return this.ler().length;
  }

  isFavorita(id: number): boolean {
    return this.ler().some((f) => f.id === id);
  }

  adicionar(favorita: IgrejaFavorita): void {
    const favoritas = this.ler();
    if (favoritas.some((f) => f.id === favorita.id)) return;
    this.persistir([...favoritas, favorita]);
  }

  remover(id: number): void {
    this.persistir(this.ler().filter((f) => f.id !== id));
  }

  /** Alterna o estado da favorita e retorna o novo estado (true = agora é favorita). */
  alternar(favorita: IgrejaFavorita): boolean {
    if (this.isFavorita(favorita.id)) {
      this.remover(favorita.id);
      return false;
    }
    this.adicionar(favorita);
    return true;
  }

  private ler(): IgrejaFavorita[] {
    try {
      const bruto = JSON.parse(localStorage.getItem(FavoritesService.KEY) || '[]');
      return Array.isArray(bruto) ? bruto : [];
    } catch {
      return [];
    }
  }

  private persistir(favoritas: IgrejaFavorita[]): void {
    localStorage.setItem(FavoritesService.KEY, JSON.stringify(favoritas));
    this._favoritas$.next(favoritas);
  }
}
