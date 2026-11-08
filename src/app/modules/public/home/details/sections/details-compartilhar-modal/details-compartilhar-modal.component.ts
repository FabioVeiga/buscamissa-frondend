import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { ShareMethod } from '../../../../../../core/services/analytics.service';

/**
 * Janela única de compartilhar (redesenho de 2026-11). Substitui os dois botões
 * que existiam ("Compartilhar" = link, "Enviar no WhatsApp" = horários): aqui a
 * pessoa escolhe COMO enviar, vendo antes a mensagem que vai junto.
 * O pai faz o tracking a partir de `compartilhado`.
 */
@Component({
  selector: 'app-details-compartilhar-modal',
  standalone: true,
  imports: [CommonModule, DialogModule],
  templateUrl: './details-compartilhar-modal.component.html',
  styleUrls: ['./details-compartilhar-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsCompartilharModalComponent {
  private _toast = inject(MessageService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();

  @Input() igrejaNome = '';
  /** Link canônico da página (sem UTM). */
  @Input() url = '';
  /** Mensagem com o resumo dos horários + link. */
  @Input() mensagem = '';
  /** Link `wa.me` com a mensagem pronta. */
  @Input() whatsappUrl = '';

  @Output() compartilhado = new EventEmitter<ShareMethod>();

  get temShareNativo(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as any).share;
  }

  fechar(): void {
    this.visibleChange.emit(false);
  }

  enviarWhatsapp(): void {
    this.compartilhado.emit('whatsapp');
    this.fechar();
  }

  copiarMensagem(): void {
    this._copiar(this.mensagem, 'Mensagem copiada', 'Cole no app que preferir.', 'copy_text');
  }

  copiarLink(): void {
    this._copiar(this.url, 'Link copiado', 'Cole onde quiser para compartilhar.', 'copy_link');
  }

  outrosApps(): void {
    this.compartilhado.emit('native');
    (navigator as any)
      .share({ title: this.igrejaNome, text: this.mensagem })
      .then(() => this.fechar())
      .catch(() => {}); // cancelado pela pessoa: o modal fica aberto
  }

  private _copiar(texto: string, ok: string, detalhe: string, metodo: ShareMethod): void {
    const falhou = () =>
      this._toast.add({ severity: 'warn', summary: 'Não foi possível copiar', detail: 'Selecione o texto e copie manualmente.' });
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) { falhou(); return; }
    navigator.clipboard.writeText(texto).then(
      () => {
        this.compartilhado.emit(metodo);
        this._toast.add({ severity: 'success', summary: ok, detail: detalhe });
        this.fechar();
      },
      falhou,
    );
  }
}
