import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Mass } from '../../../../church/models/church.model';
import { ConfidenceBadgeComponent } from '../../../../../../shared/components/confidence-badge/confidence-badge.component';
import { ChurchPlaceholderComponent } from '../../../../../../shared/components/church-placeholder/church-placeholder.component';
import { TipoRedeSocial } from '../../../../../../core/services/redes-sociais.service';
import { getSocialIconFromTipos } from '../../../../../../shared/utils/social-icon.utils';

/**
 * Header da página da paróquia: foto, endereço, contato e ações.
 * Concentra o que antes ficava espalhado em "Como chegar" e "Informações da
 * comunidade" (redesenho de 2026-11): rota e contato são as ações nº 1 e 2.
 */
@Component({
  selector: 'app-details-header',
  standalone: true,
  imports: [CommonModule, ConfidenceBadgeComponent, ChurchPlaceholderComponent],
  templateUrl: './details-header.component.html',
  styleUrls: ['./details-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsHeaderComponent {
  @Input({ required: true }) igreja: any;
  @Input() proximaMissa: Mass | null = null;
  @Input() isFavorita = false;
  /** Selo "Responsável Verificado" (status público vindo do ResponsavelService). */
  @Input() verificada = false;
  @Input() tiposRedeSocial: TipoRedeSocial[] = [];
  /** Sem horários não há o que pôr na agenda: o botão some. */
  @Input() temMissas = false;

  /** Abre a janela única de compartilhar (link ou mensagem com horários). */
  @Output() compartilharClick = new EventEmitter<void>();
  @Output() agendaClick = new EventEmitter<void>();
  @Output() favoritarClick = new EventEmitter<void>();
  @Output() direcoesClick = new EventEmitter<void>();
  /** Objetivo de negócio alcançado (whatsapp/ligar/site) — o pai faz o tracking */
  @Output() objetivoClick = new EventEmitter<string>();
  @Output() telefoneClick = new EventEmitter<void>();
  @Output() socialClick = new EventEmitter<string>();
  @Output() adicionarContato = new EventEmitter<void>();

  fotoQuebrou = false;

  /** "Praça X, 50 — fundos · Bairro" (logradouro chega do banco com espaço sobrando). */
  get linhaRua(): string {
    const e = this.igreja?.endereco ?? {};
    const rua = (e.logradouro ?? '').trim();
    if (!rua) return (e.bairro ?? '').trim();
    let linha = rua;
    if (e.numero === 0) linha += ', S/N';
    else if (e.numero) linha += `, ${e.numero}`;
    if (e.complemento?.trim()) linha += ` — ${e.complemento.trim()}`;
    if (e.bairro?.trim()) linha += ` · ${e.bairro.trim()}`;
    return linha;
  }

  /** "São José dos Campos/SP · CEP 12212-510" */
  get linhaCidade(): string {
    const e = this.igreja?.endereco ?? {};
    let linha = [e.localidade, e.uf].filter(Boolean).join('/');
    const cep = (e.cep ?? '').replace(/\D/g, '');
    if (cep.length === 8 && cep !== '00000000') linha += ` · CEP ${cep.slice(0, 5)}-${cep.slice(5)}`;
    return linha;
  }

  get dioceseNome(): string {
    const c = this.igreja?.circunscricao;
    return c?.dioceseNome || c?.arquidioceseNome || '';
  }

  get temContato(): boolean {
    const c = this.igreja?.contato;
    return !!(c?.telefone || c?.telefoneWhatsApp || c?.emailContato || c?.website || this.igreja?.redesSociais?.length);
  }

  /** Website cadastrado pronto para link: aceita valor salvo sem protocolo ("www.paroquia.org"). */
  get siteUrl(): string | null {
    const site = this.igreja?.contato?.website?.trim();
    if (!site) return null;
    return /^https?:\/\//i.test(site) ? site : `https://${site}`;
  }

  get siteLabel(): string {
    const url = this.siteUrl;
    if (!url) return '';
    try {
      return new URL(url).hostname.replace(/^www\./i, '');
    } catch {
      return 'site da igreja';
    }
  }

  getSocialIcon(url: string): string {
    return getSocialIconFromTipos(url, this.tiposRedeSocial);
  }

  get linkGoogleMaps(): string {
    const e = this.igreja?.endereco;
    if (!e) return '#';
    if (e.latitude && e.longitude)
      return `https://www.google.com/maps/search/?api=1&query=${e.latitude},${e.longitude}`;
    const q = encodeURIComponent(`${this.igreja.nome}, ${e.logradouro}, ${e.localidade} ${e.uf}`);
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  get linkWaze(): string {
    const e = this.igreja?.endereco;
    if (!e) return '#';
    if (e.latitude && e.longitude)
      return `https://waze.com/ul?ll=${e.latitude},${e.longitude}&navigate=yes`;
    const q = encodeURIComponent(`${this.igreja.nome}, ${e.logradouro}, ${e.localidade}`);
    return `https://waze.com/ul?q=${q}&navigate=yes`;
  }
}
