import { Injectable } from '@angular/core';

const STORAGE_KEY = 'bm_last_screen';

/** Guarda a última tela visitada antes da atual, para permitir "Voltar" mesmo após um reload. */
@Injectable({ providedIn: 'root' })
export class NavigationHistoryService {
  get previousUrl(): string | null {
    return sessionStorage.getItem(STORAGE_KEY);
  }

  /** Chamado pelo AppComponent a cada troca de rota, com a URL que está sendo deixada. */
  track(previousUrl: string): void {
    if (previousUrl) sessionStorage.setItem(STORAGE_KEY, previousUrl);
  }
}
