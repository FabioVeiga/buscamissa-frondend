import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Ponto único de log de erros da aplicação.
 * Hoje escreve no console; é o local para plugar um serviço externo
 * (Sentry, App Insights, etc.) na Etapa 6 da auditoria — sem espalhar
 * chamadas por todo o código.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  logError(erro: unknown, contexto?: string): void {
    // eslint-disable-next-line no-console
    console.error(`[BuscaMissa]${contexto ? ' ' + contexto : ''}`, erro);
    // TODO (Etapa 6): encaminhar para Sentry/App Insights em produção.
  }

  logWarning(mensagem: string, contexto?: string): void {
    if (!environment.config.production) {
      // eslint-disable-next-line no-console
      console.warn(`[BuscaMissa]${contexto ? ' ' + contexto : ''}`, mensagem);
    }
  }
}
