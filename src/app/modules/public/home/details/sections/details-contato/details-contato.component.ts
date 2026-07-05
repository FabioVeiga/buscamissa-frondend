import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TipoRedeSocial } from '../../../../../../core/services/redes-sociais.service';
import { getSocialIconFromTipos } from '../../../../../../shared/utils/social-icon.utils';

/** Sidebar "Informações da comunidade" (extraído do DetailsComponent — auditoria 2.x). */
@Component({
  selector: 'app-details-contato',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './details-contato.component.html',
  styleUrls: ['./details-contato.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsContatoComponent {
  @Input({ required: true }) igreja: any;
  @Input() tiposRedeSocial: TipoRedeSocial[] = [];

  /** Objetivo de negócio alcançado (whatsapp/ligar/site/rede social) — o pai faz o tracking */
  @Output() objetivoClick = new EventEmitter<string>();
  @Output() telefoneClick = new EventEmitter<void>();
  @Output() socialClick = new EventEmitter<string>();
  @Output() adicionarInformacoes = new EventEmitter<void>();

  get temContato(): boolean {
    const c = this.igreja?.contato;
    return !!(c?.telefone || c?.telefoneWhatsApp || c?.emailContato || c?.site || this.igreja?.redesSociais?.length);
  }

  getSocialIcon(url: string): string {
    return getSocialIconFromTipos(url, this.tiposRedeSocial);
  }
}
