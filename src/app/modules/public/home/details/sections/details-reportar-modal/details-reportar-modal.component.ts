import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { PrimeNgModule } from '../../../../../../shared/primeng.module';
import { ModalComponent } from '../../../../../../core/components/modal/modal.component';
import { ChurchesService } from '../../../../../../core/services/churches.service';
import { AnalyticsService } from '../../../../../../core/services/analytics.service';

interface ItemReportarProblema {
  key: string;
  label: string;
  icon: string;
  emoji: string;
  subtitle?: string;
  placeholder?: string;
  especial?: boolean;
  marcado: boolean;
  texto: string;
}

function criarItensReportarProblema(): ItemReportarProblema[] {
  return [
    { key: "endereco", label: "Endereço", icon: "pi-map-marker", emoji: "📍", placeholder: "Descreva o que está incorreto ou informe o endereço correto.", marcado: false, texto: "" },
    { key: "contato", label: "Dados de contato", icon: "pi-phone", emoji: "☎️", subtitle: "Telefone, e-mail, Instagram, Facebook ou outras redes sociais.", placeholder: "Informe quais dados estão incorretos ou quais são os dados corretos.", marcado: false, texto: "" },
    { key: "nomeIgreja", label: "Nome da igreja", icon: "pi-building", emoji: "⛪", placeholder: "Informe o nome correto da igreja, comunidade ou paróquia.", marcado: false, texto: "" },
    { key: "incompleta", label: "Página incompleta", icon: "pi-file", emoji: "📄", placeholder: "Quais informações você acredita que estão faltando?", marcado: false, texto: "" },
    { key: "horarios", label: "Horários de Missa", icon: "pi-clock", emoji: "🕐", especial: true, marcado: false, texto: "" },
    { key: "outro", label: "Outro", icon: "pi-comment", emoji: "💬", placeholder: "Descreva o que deseja informar.", marcado: false, texto: "" },
  ];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Modal "Reportar problema" — dono do fluxo completo (itens, validação e envio),
 * extraído do DetailsComponent (auditoria 2.x).
 */
@Component({
  selector: 'app-details-reportar-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, PrimeNgModule, ModalComponent],
  templateUrl: './details-reportar-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsReportarModalComponent implements OnChanges {
  private _church = inject(ChurchesService);
  private _toast = inject(MessageService);
  private _analytics = inject(AnalyticsService);
  private _cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) igrejaId!: number;
  @Input() igrejaNome = '';
  @Input() visible = false;

  @Output() visibleChange = new EventEmitter<boolean>();
  /** Usuário pediu para ir ao fluxo de alteração (após enviar a sugestão pendente, se houver) */
  @Output() irParaAlterar = new EventEmitter<void>();

  enviando = false;
  itensReportar: ItemReportarProblema[] = criarItensReportarProblema();
  reportarNome = '';
  reportarEmail = '';

  ngOnChanges(changes: SimpleChanges): void {
    // Reset do formulário a cada abertura
    if (changes['visible'] && this.visible) {
      this.itensReportar = criarItensReportarProblema();
      this.reportarNome = '';
      this.reportarEmail = '';
    }
  }

  fechar(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  get valido(): boolean {
    const temNomeEEmail = !!this.reportarNome.trim() && EMAIL_REGEX.test(this.reportarEmail.trim());
    const temItemPreenchido = this.itensReportar.some((item) => !item.especial && item.marcado && item.texto.trim());
    return temNomeEEmail && temItemPreenchido;
  }

  /**
   * Fecha o modal e leva o usuário para o fluxo de alteração. Se algum outro item já foi
   * preenchido, envia essa sugestão antes de redirecionar; caso contrário, redireciona direto.
   */
  irParaAlterarInformacoes(): void {
    const temItemPreenchido = this.itensReportar.some((item) => !item.especial && item.marcado && item.texto.trim());

    if (!temItemPreenchido) {
      this.fechar();
      this.irParaAlterar.emit();
      return;
    }

    if (!this.valido) {
      this._toast.add({
        severity: 'warn',
        summary: 'Preencha seus dados',
        detail: 'Informe nome e e-mail para enviar sua sugestão antes de continuar.',
      });
      return;
    }

    this.enviar(() => this.irParaAlterar.emit());
  }

  private montarDescricao(): string {
    const secoes = this.itensReportar
      .filter((item) => !item.especial && item.marcado && item.texto.trim())
      .map((item) => `${item.emoji} ${item.label}\n${item.texto.trim()}`);
    return `Correções sugeridas\n\n${secoes.join("\n\n")}`;
  }

  /** Envia a sugestão. Se `aoConcluir` for informado (fluxo "Ir para alterar"), não mostra toast de sucesso — quem chamou decide o próximo passo. */
  enviar(aoConcluir?: () => void): void {
    if (!this.valido || !this.igrejaId) return;

    this.enviando = true;
    const body = {
      nome: this.reportarNome.trim(),
      email: this.reportarEmail.trim(),
      descricao: this.montarDescricao(),
    };
    this._church.reportarProblema(this.igrejaId, body)
      .pipe(finalize(() => { this.enviando = false; this._cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this._analytics.userContribution('report', this.igrejaNome);
          this.fechar();
          if (aoConcluir) {
            aoConcluir();
            return;
          }
          this._toast.add({
            severity: 'success',
            summary: 'Obrigado!',
            detail: 'Sugestão enviada com sucesso. Nossa equipe vai analisar.',
          });
        },
        error: () => {
          this._toast.add({
            severity: 'error',
            summary: 'Erro',
            detail: 'Não foi possível enviar sua sugestão. Tente novamente.',
          });
        },
      });
  }
}
