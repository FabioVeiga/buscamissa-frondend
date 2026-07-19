// Contratos do fluxo Responsável Verificado — espelham Dtos/ResponsavelDtos.cs
// do api-public.

export interface SolicitarResponsabilidadeRequest {
  cargoInformado?: string;
  observacao?: string;
}

export type StatusResponsavel =
  | 'PendenteVerificacao'
  | 'Aprovado'
  | 'Revogado'
  | 'Rejeitado';

export interface MinhaResponsabilidade {
  id: number;
  igrejaId: number;
  igrejaNome: string;
  igrejaSlug?: string | null;
  papel: string;
  status: StatusResponsavel;
  dataSolicitacao: string;
  dataAprovacao?: string | null;
  motivoRevisao?: string | null;
  /** True quando o acesso veio por herança da paróquia-pai (não é vínculo direto). */
  porHeranca: boolean;
  /** UF e CidadeSlug — para montar a URL canônica /paroquia/{uf}/{cidade}/{slug}. */
  igrejaUf?: string | null;
  igrejaCidadeSlug?: string | null;
}

// ---- Edição direta (Fase 8): contato + redes + horários ----

export interface ContatoEdicao {
  emailContato?: string | null;
  ddd?: string | null;
  telefone?: string | null;
  dddWhatsApp?: string | null;
  telefoneWhatsApp?: string | null;
  website?: string | null;
}

export interface RedeSocialEdicao {
  tipoRedeSocial: number; // 1=Facebook,2=Instagram,3=YouTube,4=TikTok,5=Twitter
  nomeDoPerfil: string;
}

export interface MissaEdicao {
  diaSemana: number; // 0=Domingo ... 6=Sábado
  horario: string; // "HH:mm"
  observacao?: string | null;
}

// ---- Fase 9: endereço + imagem ----

export interface EnderecoEdicao {
  cep: string;
  logradouro: string;
  complemento?: string | null;
  bairro?: string | null;
  localidade: string;
  uf: string;
  /** 0 = sem número. */
  numero: number;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ImagemEdicao {
  /** Base64 sem prefixo "data:image/...". */
  base64: string;
}

export interface DadosEdicao {
  igrejaId: number;
  igrejaNome: string;
  contato: ContatoEdicao;
  redesSociais: RedeSocialEdicao[];
  missas: MissaEdicao[];
  endereco: EnderecoEdicao;
  imagemUrl?: string | null;
}

export interface EditarDadosRequest {
  contato?: ContatoEdicao | null;
  redesSociais?: RedeSocialEdicao[] | null;
  missas?: MissaEdicao[] | null;
  endereco?: EnderecoEdicao | null;
  imagem?: ImagemEdicao | null;
}
