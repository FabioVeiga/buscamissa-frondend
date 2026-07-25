import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, PLATFORM_ID, SimpleChanges, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { ChurchesService } from '../../../../../../core/services/churches.service';
import { AnalyticsService } from '../../../../../../core/services/analytics.service';

/**
 * Bloco "Os horários estão corretos?" — dono do fluxo completo de confirmação
 * (resumo de prova social + envio), extraído do DetailsComponent (auditoria 2.x).
 * OnPush: estado atualizado em subscribe → sempre chamar markForCheck().
 */
@Component({
  selector: 'app-details-confirmar',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './details-confirmar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsConfirmarComponent implements OnChanges {
  private _church = inject(ChurchesService);
  private _toast = inject(MessageService);
  private _analytics = inject(AnalyticsService);
  private _cdr = inject(ChangeDetectorRef);
  /** No prerender (server) não há localStorage nem prova social — ver jaConfirmou/_carregarResumo. */
  private _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  @Input({ required: true }) igrejaId!: number;
  @Input() igrejaNome = '';

  confirmacaoEnviada = false;
  confirmandoHorarios = false;
  ultimaConfirmacao: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['igrejaId'] && this.igrejaId) {
      this.confirmacaoEnviada = false;
      this._carregarResumo();
    }
  }

  private get _localKey(): string {
    return `buscamissa_confirmacao_${this.igrejaId}`;
  }

  jaConfirmou(): boolean {
    // Chamado pelo template → roda no prerender (server), onde localStorage não
    // existe. No server retorna false; o estado real hidrata no cliente.
    if (!this._isBrowser || !this.igrejaId) return false;
    return !!localStorage.getItem(this._localKey);
  }

  /** "última confirmação há 3 dias" — formato relativo */
  get ultimaConfirmacaoLabel(): string {
    if (!this.ultimaConfirmacao) return '';
    const dias = Math.floor((Date.now() - new Date(this.ultimaConfirmacao).getTime()) / 86_400_000);
    if (dias <= 0) return 'hoje';
    if (dias === 1) return 'ontem';
    if (dias < 7) return `há ${dias} dias`;
    if (dias < 30) { const s = Math.floor(dias / 7); return `há ${s} ${s === 1 ? 'semana' : 'semanas'}`; }
    const m = Math.floor(dias / 30); return `há ${m} ${m === 1 ? 'mês' : 'meses'}`;
  }

  private _carregarResumo(): void {
    this.ultimaConfirmacao = null;
    // Prova social é browser-only: no prerender evita ~4.4k GETs a getResumoConfirmacoes
    // (risco de 429). Hidrata no cliente.
    if (!this._isBrowser) return;
    this._church.getResumoConfirmacoes(this.igrejaId).subscribe({
      next: (res: any) => {
        this.ultimaConfirmacao = res?.data?.ultimaConfirmacao ?? null;
        this._cdr.markForCheck();
      },
      error: () => { /* prova social é opcional — silencioso */ },
    });
  }

  confirmarHorarios(): void {
    if (!this.igrejaId) return;

    if (localStorage.getItem(this._localKey)) {
      this._toast.add({ severity: 'info', summary: 'Já confirmado', detail: 'Você já confirmou os horários desta paróquia.' });
      return;
    }

    this.confirmandoHorarios = true;
    this._church.confirmarHorarios(this.igrejaId).subscribe({
      next: () => {
        localStorage.setItem(this._localKey, '1');
        this.confirmacaoEnviada = true;
        this._analytics.userContribution('confirm', this.igrejaNome);
        this._toast.add({ severity: 'success', summary: 'Obrigado!', detail: 'Sua confirmação ajuda outras pessoas da comunidade.' });
        this._cdr.markForCheck();
      },
      error: (err) => {
        if (err.status === 409) {
          localStorage.setItem(this._localKey, '1');
          this.confirmacaoEnviada = true;
          this._toast.add({ severity: 'info', summary: 'Já registrado', detail: 'Você já confirmou os horários desta paróquia.' });
        } else {
          this._toast.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível enviar sua confirmação. Tente novamente.' });
        }
        this._cdr.markForCheck();
      },
      complete: () => {
        this.confirmandoHorarios = false;
        this._cdr.markForCheck();
      },
    });
  }
}
