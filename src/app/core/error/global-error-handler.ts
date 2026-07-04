import { ErrorHandler, inject, Injectable } from '@angular/core';
import { LoggerService } from '../services/logger.service';

/**
 * Captura erros não tratados em toda a aplicação (exceções em componentes,
 * rejeições de Promise, etc.) e os encaminha ao LoggerService — evitando que
 * falhas passem despercebidas (item 1.12 da auditoria).
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private logger = inject(LoggerService);

  handleError(error: unknown): void {
    this.logger.logError(error, 'Erro não tratado');
  }
}
