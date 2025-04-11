// src/app/features/church/models/church.model.ts

export interface Mass {
  id?: number;
  diaSemana?: number;
  horario: string;
  observacao?: string;
}

export interface Address {
  cep: string;
  logradouro?: string;
  numero: string;
  complemento?: string;
  bairro?: string;
  localidade?: string; // Cidade
  uf?: string;
  estado?: string;
  regiao?: string;
}

export interface Contact {
  ddd?: string;
  telefone?: string;
  dddWhatsApp?: string;
  telefoneWhatsApp?: string;
  emailContato?: string;
}

export interface SocialMedia {
  id?: number;
  tipoRedeSocial?: number;
  nomeDoPerfil?: string;
  nomeRedeSocial?: string; // adicione isso se não tiver
  url?: string;
}

// Modelo principal da Igreja para a API
export interface ChurchApiData {
  id?: number;
  cep?: string;
  nome: string; // Inclui o tipo? ex: "Paróquia Santa Rita"
  paroco: string;
  imagem?: string; // Base64 ou URL? Ajuste conforme necessário
  imagemUrl?: string; // URL da imagem
  missas?: Omit<Mass, "horario"> & { horario: string }[]; // API espera string 'HH:mm:ss'
  missasTemporaria?: Omit<Mass, "horario"> & { horario: string }[]; // API espera string 'HH:mm:ss'
  endereco: Address;
  contato?: Contact;
  redesSociais?: SocialMedia[];
}

// Modelo da Igreja para o Formulário (pode ter tipos diferentes, ex: Date para horário)
export interface ChurchFormData {
  id?: number;
  typeChurchValue?: string | null; // Campo separado para o tipo no form
  nomeIgreja: string; // Apenas o nome, sem o tipo
  nomeParoco: string;
  cep: string;
  endereco?: string;
  numero: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  uf?: string;
  regiao?: string;
  telefone?: string; // Com máscara
  whatsapp?: string; // Com máscara
  emailContato?: string;
  missas?: Mass[]; // Form usa Date para horário
  missasTemporaria?: Mass[]; // Form usa Date para horário
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  imagem?: string; // Base64 string
  imagemUrl?: string; // URL da imagem
}
