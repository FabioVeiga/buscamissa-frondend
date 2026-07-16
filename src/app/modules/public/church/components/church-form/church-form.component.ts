// src/app/features/church/components/church-form/church-form.component.ts
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  ReactiveFormsModule,
  ValidatorFn,
  AbstractControl,
  ValidationErrors,
} from "@angular/forms";
import { CommonModule, DatePipe } from "@angular/common";
import { PrimeNgModule } from "../../../../../shared/primeng.module";
import { ChurchFormData, Mass } from "../../models/church.model";
import { MessageService } from "primeng/api";
import { RedesSociaisService, TipoRedeSocial } from "../../../../../core/services/redes-sociais.service";
import { LoggerService } from "../../../../../core/services/logger.service";

interface TypeChurchOption {
  name: string;
  value: string;
}

@Component({
  selector: "app-church-form",
  standalone: true, // Considere usar standalone components
  imports: [CommonModule, ReactiveFormsModule, PrimeNgModule],
  providers: [DatePipe, MessageService], // DatePipe aqui se não for providedIn: 'root'
  templateUrl: "./church-form.component.html",
  styleUrls: ["./church-form.component.scss"],
})
export class ChurchFormComponent implements OnInit, OnChanges {
  private messageService = inject(MessageService);
  private redesSociaisService = inject(RedesSociaisService);
  private logger = inject(LoggerService);

  tiposRedeSocial: TipoRedeSocial[] = [];
  @Input() initialData: ChurchFormData | null = null;
  @Input() isSaving: boolean = false;
  @Input() isEditMode: boolean = false; // Para desabilitar CEP na edição
  // Trava o formulário inteiro (exceto o campo CEP) enquanto o usuário não confirma,
  // na tela pai, que nenhuma das igrejas já cadastradas nesse CEP é a dele.
  @Input() bloqueadoPorCep: boolean = false;
  @Output() formSubmit = new EventEmitter<ChurchFormData>();
  @Output() formCancel = new EventEmitter<void>(); // Opcional: Para botão Cancelar
  @Output() cepLookup = new EventEmitter<string>(); // Emitir evento para busca de CEP

  private fb = inject(FormBuilder);
  form!: FormGroup;
  imageName: string | null = null;
  showAddressFields = false;
  loading = false;
  imagePreview: string | null = null; // Só para exibir a imagem

  typeChurchOptions: TypeChurchOption[] = [
    { name: "Capela", value: "Capela" },
    { name: "Comunidade", value: "Comunidade" },
    { name: "Paróquia", value: "Paróquia" },
    { name: "Santuário", value: "Santuário" },
    { name: "Catedral", value: "Catedral" },
    { name: "Basílica Maior", value: "Basílica Maior" },
    { name: "Basílica Menor", value: "Basílica Menor" },
    { name: "Arquidiocese", value: "Arquidiocese" },
    { name: "Diocese", value: "Diocese" },
    { name: "Outro", value: "" },
  ];

  diasSemana = [
    { key: 0, label: "Domingo" },
    { key: 1, label: "Segunda-feira" },
    { key: 2, label: "Terça-feira" },
    { key: 3, label: "Quarta-feira" },
    { key: 4, label: "Quinta-feira" },
    { key: 5, label: "Sexta-feira" },
    { key: 6, label: "Sábado" },
  ];

  // UFs padronizadas — usadas quando o CEP não resolve cidade/estado, para o
  // usuário selecionar em vez de digitar livremente.
  ufs: { sigla: string; nome: string; regiao: string }[] = [
    { sigla: "AC", nome: "Acre", regiao: "Norte" },
    { sigla: "AL", nome: "Alagoas", regiao: "Nordeste" },
    { sigla: "AP", nome: "Amapá", regiao: "Norte" },
    { sigla: "AM", nome: "Amazonas", regiao: "Norte" },
    { sigla: "BA", nome: "Bahia", regiao: "Nordeste" },
    { sigla: "CE", nome: "Ceará", regiao: "Nordeste" },
    { sigla: "DF", nome: "Distrito Federal", regiao: "Centro-Oeste" },
    { sigla: "ES", nome: "Espírito Santo", regiao: "Sudeste" },
    { sigla: "GO", nome: "Goiás", regiao: "Centro-Oeste" },
    { sigla: "MA", nome: "Maranhão", regiao: "Nordeste" },
    { sigla: "MT", nome: "Mato Grosso", regiao: "Centro-Oeste" },
    { sigla: "MS", nome: "Mato Grosso do Sul", regiao: "Centro-Oeste" },
    { sigla: "MG", nome: "Minas Gerais", regiao: "Sudeste" },
    { sigla: "PA", nome: "Pará", regiao: "Norte" },
    { sigla: "PB", nome: "Paraíba", regiao: "Nordeste" },
    { sigla: "PR", nome: "Paraná", regiao: "Sul" },
    { sigla: "PE", nome: "Pernambuco", regiao: "Nordeste" },
    { sigla: "PI", nome: "Piauí", regiao: "Nordeste" },
    { sigla: "RJ", nome: "Rio de Janeiro", regiao: "Sudeste" },
    { sigla: "RN", nome: "Rio Grande do Norte", regiao: "Nordeste" },
    { sigla: "RS", nome: "Rio Grande do Sul", regiao: "Sul" },
    { sigla: "RO", nome: "Rondônia", regiao: "Norte" },
    { sigla: "RR", nome: "Roraima", regiao: "Norte" },
    { sigla: "SC", nome: "Santa Catarina", regiao: "Sul" },
    { sigla: "SP", nome: "São Paulo", regiao: "Sudeste" },
    { sigla: "SE", nome: "Sergipe", regiao: "Nordeste" },
    { sigla: "TO", nome: "Tocantins", regiao: "Norte" },
  ];

  // Estado da seleção padronizada de cidade/UF (quando o CEP não os resolve)
  ufSelecionavel = false;
  cidadeSelecionavel = false;
  cidades: string[] = [];
  carregandoCidades = false;

  ngOnInit(): void {
    this.initForm();

    this.redesSociaisService.obterTipos().subscribe((tipos) => {
      this.tiposRedeSocial = tipos;
      tipos.forEach((t) => {
        const key = t.nome.toLowerCase();
        if (!this.form.contains(key)) {
          this.form.addControl(key, this.fb.control(""));
        }
      });
      if (this.initialData) {
        this.populateForm(this.initialData);
      }
      // Controles de rede social são adicionados de forma assíncrona (depois do
      // disable-all abaixo); re-sincroniza para não deixá-los "escapar" do bloqueio.
      if (this.bloqueadoPorCep) {
        this.aplicarBloqueioPorCep();
      }
    });

    if (this.initialData) {
      this.populateForm(this.initialData);
    }

    if (this.isEditMode) {
      this.disableFields(); // Desabilita campos se necessário
      this.form.get("cep")?.disable(); // Desabilita CEP na edição
    }

    // Cobre o caso do componente já nascer bloqueado (o form ainda não existia
    // quando o primeiro ngOnChanges rodou com bloqueadoPorCep=true).
    if (this.bloqueadoPorCep) {
      this.aplicarBloqueioPorCep();
    }

    if (this.isEditMode && this.form.value.imagem) {
      const imagem = this.form.value.imagem;

      // Se já vem com prefixo base64, separa o prefixo
      if (imagem.startsWith("data:image")) {
        this.imagePreview = imagem; // mantemos a base64 para visualização
        this.form.get("imagem")?.setValue(imagem.split(",")[1]); // salva sem prefixo para envio
      } else {
        // Caso seja uma URL externa, mostramos diretamente
        this.imagePreview = imagem;
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Se initialData mudar DEPOIS de ngOnInit e o form existir
    if (
      changes["initialData"] &&
      !changes["initialData"].firstChange &&
      this.initialData &&
      this.form
    ) {
      this.populateForm(this.initialData);
    }
    // Se o modo de edição mudar (menos comum, mas para garantir)
    if (changes["isEditMode"] && this.form) {
      if (this.isEditMode) {
        this.form.get("cep")?.disable();
      } else {
        this.form.get("cep")?.enable();
      }
    }
    // Sem !firstChange aqui de propósito: a tela de cadastro esconde o
    // <app-church-form> com *ngIf durante o loading do CEP, o que destrói e
    // recria o componente a cada busca — então um bloqueio ativo pode chegar
    // já na criação (firstChange: true), não só numa mudança posterior.
    if (changes["bloqueadoPorCep"] && this.form) {
      this.aplicarBloqueioPorCep();
    }
  }

  // Trava/destrava o formulário inteiro (menos o CEP) quando a tela pai encontra
  // igreja(s) já cadastradas no CEP informado. Ao destravar, reaplica as regras de
  // edição (CEP sempre desabilitado); as regras de endereço (cidade/uf/etc.) voltam
  // a ser aplicadas pela própria applyCepAddress logo em seguida, no fluxo do pai.
  private aplicarBloqueioPorCep(): void {
    if (this.bloqueadoPorCep) {
      Object.keys(this.form.controls).forEach((key) => {
        if (key !== "cep") this.form.get(key)?.disable({ emitEvent: false });
      });
    } else {
      this.form.enable({ emitEvent: false });
      if (this.isEditMode) {
        this.disableFields();
        this.form.get("cep")?.disable({ emitEvent: false });
      }
    }
    this.cd.markForCheck();
  }

  constructor(private cd: ChangeDetectorRef) {}

  private initForm(): void {
    this.form = this.fb.group({
      id: [null], // Necessário para saber qual registro atualizar
      typeChurchValue: [null, this.isEditMode ? "" : Validators.required], // Campo separado para o tipo
      nomeIgreja: ["", [Validators.required, Validators.minLength(3), Validators.maxLength(150)]], // Apenas o nome
      nomeParoco: ["", Validators.maxLength(150)],
      cep: ["", [Validators.required, Validators.pattern(/^\d{5}-?\d{3}$/)]], // CEP é sempre obrigatório inicialmente
      endereco: [{ value: "", disabled: true }], // Habilitado por padrão
      numero: ["", [Validators.required, Validators.maxLength(20)]],
      complemento: ["", Validators.maxLength(100)],
      bairro: [{ value: "", disabled: true }],
      cidade: [{ value: "", disabled: true }],
      estado: [{ value: "", disabled: true }],
      uf: [{ value: "", disabled: true }], // Manter UF se a API precisar
      regiao: [{ value: "", disabled: true }], // Manter Região se a API precisar
      telefone: ["", Validators.pattern(/^[\d\s()+-]{8,20}$/)],
      whatsapp: ["", Validators.pattern(/^[\d\s()+-]{8,20}$/)],
      emailContato: ["", [Validators.email, Validators.maxLength(120)]],
      missas: this.fb.array([], Validators.required), // Pelo menos uma missa?
      imagem: [""], // Armazena base64
    });
  }

  private populateForm(data: ChurchFormData): void {
    this.form.patchValue(data); // patchValue ignora campos extras e não existentes no form
    // Limpar e popular FormArray de Missas
    this.horarios.clear();
    data.missas?.forEach((missa) => this.addMissaControl(missa));
    this.ordenarHorarios();

    // Resetar nome da imagem se não houver imagem nos dados iniciais
    this.imageName = data.imagem ? "imagem_carregada" : null; // Ou extrair nome se possível

    // Habilitar/Desabilitar campos de endereço baseado nos dados carregados
    this.updateAddressFieldsState(!!data.endereco); // Desabilita se endereço veio preenchido
  }

  updateAddressFieldsState(disable: boolean): void {
    const fields = ["endereco", "bairro", "cidade", "estado", "uf", "regiao"];
    fields.forEach((field) => {
      const control = this.form.get(field);
      if (control) {
        disable ? control.disable() : control.enable();
      }
    });
    // Número e Complemento geralmente ficam habilitados
    this.form.get("numero")?.enable();
    this.form.get("complemento")?.enable();
  }

  /**
   * Aplica o endereço retornado pela busca de CEP: campos que vieram
   * preenchidos ficam travados; campos vazios (ex: logradouro em CEP genérico
   * de cidade) ficam liberados para o usuário completar. Cidade/Estado nunca
   * são texto livre — quando ausentes, viram seleção padronizada (UF fixa +
   * municípios do IBGE).
   */
  applyCepAddress(address: any): void {
    this.form.patchValue({
      cep: address.cep,
      endereco: address.logradouro,
      complemento: address.complemento,
      bairro: address.bairro,
      cidade: address.localidade,
      estado: address.estado,
      uf: address.uf,
      regiao: address.regiao,
    });

    const travarSePreenchido = (campo: string, valor: any) => {
      const control = this.form.get(campo);
      if (!control) return;
      if (valor && String(valor).trim() !== "") control.disable({ emitEvent: false });
      else control.enable({ emitEvent: false });
    };

    travarSePreenchido("endereco", address.logradouro);
    travarSePreenchido("bairro", address.bairro);
    this.form.get("complemento")?.enable({ emitEvent: false });
    this.form.get("numero")?.enable({ emitEvent: false });

    // Estado e Região são sempre derivados (da UF) — nunca digitados.
    this.form.get("estado")?.disable({ emitEvent: false });
    this.form.get("regiao")?.disable({ emitEvent: false });

    if (address.uf && String(address.uf).trim() !== "") {
      this.ufSelecionavel = false;
      this.form.get("uf")?.disable({ emitEvent: false });

      if (address.localidade && String(address.localidade).trim() !== "") {
        this.cidadeSelecionavel = false;
        this.form.get("cidade")?.disable({ emitEvent: false });
      } else {
        // UF veio, cidade não: dropdown padronizado de municípios da UF
        this.habilitarSelecaoCidade(address.uf);
      }
    } else {
      // Nem UF veio: usuário seleciona a UF (dropdown fixo) e depois a cidade
      this.ufSelecionavel = true;
      this.cidadeSelecionavel = false;
      this.form.get("uf")?.enable({ emitEvent: false });
      this.form.get("cidade")?.disable({ emitEvent: false });
    }
    this.cd.markForCheck();
  }

  /** Usuário escolheu a UF no dropdown: deriva estado/região e carrega municípios. */
  onUfSelecionada(sigla: string): void {
    const uf = this.ufs.find((x) => x.sigla === sigla);
    if (!uf) return;
    this.form.patchValue({ estado: uf.nome, regiao: uf.regiao, cidade: "" });
    this.habilitarSelecaoCidade(sigla);
  }

  // Municípios padronizados do IBGE. fetch() direto de propósito: os
  // interceptors do HttpClient anexam Authorization/baseURL, que não se
  // aplicam a uma API externa.
  private habilitarSelecaoCidade(uf: string): void {
    this.cidadeSelecionavel = true;
    this.carregandoCidades = true;
    this.form.get("cidade")?.enable({ emitEvent: false });
    this.cd.markForCheck();

    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`IBGE ${r.status}`))))
      .then((municipios: { nome: string }[]) => {
        this.cidades = municipios.map((m) => m.nome);
      })
      .catch((err) => {
        this.logger.logWarning(`Falha ao carregar municípios do IBGE: ${err}`, "church-form");
        this.cidades = [];
      })
      .finally(() => {
        this.carregandoCidades = false;
        this.cd.markForCheck();
      });
  }

  get horarios(): FormArray {
    return this.form.get("missas") as FormArray;
  }

  // Estado do formulário de adição em lote (dias x horários)
  diasSemanaLote: number[] = [];
  horariosLote: Date[] = [];
  novoHorarioLote: Date | null = null;

  // Ajusta o horário digitado no seletor de lote para o passo de 15 min, igual à tabela principal
  setDefaultTimeIfNullLote(): void {
    const current = this.novoHorarioLote;
    const d = current ? new Date(current) : new Date();
    const snapped = Math.round(d.getMinutes() / 15) * 15;
    d.setMinutes(snapped % 60, 0, 0);
    if (snapped === 60) d.setHours(d.getHours() + 1);
    this.novoHorarioLote = d;
  }

  private mesmoHorario(a: Date, b: Date): boolean {
    return a.getHours() === b.getHours() && a.getMinutes() === b.getMinutes();
  }

  adicionarHorarioNaLista(): void {
    if (!this.novoHorarioLote) return;
    const jaExiste = this.horariosLote.some((h) => this.mesmoHorario(h, this.novoHorarioLote!));
    if (!jaExiste) {
      this.horariosLote.push(this.novoHorarioLote);
      this.horariosLote.sort((a, b) => a.getTime() - b.getTime());
    }
    this.novoHorarioLote = null;
  }

  removerHorarioDaLista(index: number): void {
    this.horariosLote.splice(index, 1);
  }

  // Gera o produto (dias selecionados x horários selecionados) e adiciona à tabela de horários,
  // reaproveitando o mesmo FormArray/validações usados na edição linha a linha.
  aplicarHorariosEmLote(): void {
    if (!this.diasSemanaLote.length || !this.horariosLote.length) {
      this.messageService.add({
        severity: "warn",
        summary: "Selecione os dados",
        detail: "Escolha ao menos um dia da semana e um horário para adicionar.",
      });
      return;
    }

    let adicionados = 0;
    this.diasSemanaLote.forEach((dia) => {
      this.horariosLote.forEach((horario) => {
        const jaExisteNoForm = this.horarios.controls.some((ctrl) => {
          const v = ctrl.value;
          return v.diaSemana === dia && v.horario instanceof Date && this.mesmoHorario(v.horario, horario);
        });
        if (!jaExisteNoForm) {
          this.horarios.push(
            this.fb.group({
              id: [null],
              diaSemana: [dia, Validators.required],
              horario: [new Date(horario), [Validators.required, this.minutosValidos()]],
              observacao: ["", Validators.maxLength(20)],
            })
          );
          adicionados++;
        }
      });
    });

    if (adicionados > 0) {
      this.messageService.add({
        severity: "success",
        summary: "Horários adicionados",
        detail: `${adicionados} horário(s) adicionado(s) à tabela abaixo.`,
      });
    }

    this.diasSemanaLote = [];
    this.horariosLote = [];
    this.novoHorarioLote = null;
    this.ordenarHorarios();
    this.cd.markForCheck();
  }

  // Reordena as linhas da tabela por dia da semana e depois por horário, sem recriar os
  // FormGroups (setControl preserva estado/valor de cada linha, só muda a posição no array).
  ordenarHorarios(): void {
    const controlsOrdenados = [...this.horarios.controls].sort((a, b) => {
      const va = a.value;
      const vb = b.value;
      const diaA = va.diaSemana ?? Number.MAX_SAFE_INTEGER;
      const diaB = vb.diaSemana ?? Number.MAX_SAFE_INTEGER;
      if (diaA !== diaB) return diaA - diaB;

      const horaA = va.horario instanceof Date ? va.horario.getTime() : Number.MAX_SAFE_INTEGER;
      const horaB = vb.horario instanceof Date ? vb.horario.getTime() : Number.MAX_SAFE_INTEGER;
      return horaA - horaB;
    });

    controlsOrdenados.forEach((ctrl, index) => this.horarios.setControl(index, ctrl));
    this.cd.markForCheck();
  }

  // Adiciona um controle de grupo para uma missa ao FormArray
  private addMissaControl(missa?: Mass): void {
    this.horarios.push(
      this.fb.group({
        id: [missa?.id],
        diaSemana: [missa?.diaSemana ?? null, Validators.required],
        horario: [
          missa?.horario ? this.stringParaDate(missa.horario as string) : null,
          [Validators.required, this.minutosValidos()],
        ],
        observacao: [missa?.observacao ?? "", Validators.maxLength(20)],
      })
    );
  }
  

  // Estado do formulário fixo de adição individual (dia + horário + observação).
  // Fica fora do FormArray/tabela de propósito: assim o usuário preenche os campos
  // com calma, sem a linha pular de posição a cada seleção, e só entra (já ordenada)
  // na tabela quando ele clicar em "Adicionar".
  diaUnico: number | null = null;
  horarioUnico: Date | null = null;
  observacaoUnica: string = "";

  setDefaultTimeIfNullUnico(): void {
    const current = this.horarioUnico;
    const d = current ? new Date(current) : new Date();
    const snapped = Math.round(d.getMinutes() / 15) * 15;
    d.setMinutes(snapped % 60, 0, 0);
    if (snapped === 60) d.setHours(d.getHours() + 1);
    this.horarioUnico = d;
  }

  adicionarHorarioUnico(): void {
    if (this.diaUnico === null || !this.horarioUnico) {
      this.messageService.add({
        severity: "warn",
        summary: "Selecione os dados",
        detail: "Escolha o dia da semana e o horário antes de adicionar.",
      });
      return;
    }

    this.horarios.push(
      this.fb.group({
        id: [null],
        diaSemana: [this.diaUnico, Validators.required],
        horario: [new Date(this.horarioUnico), [Validators.required, this.minutosValidos()]],
        observacao: [this.observacaoUnica ?? "", Validators.maxLength(20)],
      })
    );
    this.ordenarHorarios();

    this.diaUnico = null;
    this.horarioUnico = null;
    this.observacaoUnica = "";
    this.cd.markForCheck();
  }

  removerHorario(index: number): void {
    this.horarios.removeAt(index);
  }

  setDefaultTimeIfNull(control: AbstractControl | null): void {
    if (!control) return;
    const current = control.value;
    const d = current ? new Date(current) : new Date();
    const snapped = Math.round(d.getMinutes() / 15) * 15;
    d.setMinutes(snapped % 60, 0, 0);
    if (snapped === 60) d.setHours(d.getHours() + 1);
    control.setValue(d);
  }

  // Validador customizado para minutos
  private minutosValidos(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (control.value instanceof Date) {
        const minutes = control.value.getMinutes();
        if (![0, 15, 30, 45].includes(minutes)) {
          return { minutosInvalidos: true };
        }
      } else if (control.value) {
        // Se for string (menos provável com DatePicker, mas por segurança)
        try {
          const [, minutes] = (control.value as string).split(":").map(Number);
          if (![0, 15, 30, 45].includes(minutes)) {
            return { minutosInvalidos: true };
          }
        } catch (e) {
          return { formatoInvalido: true }; // Erro ao parsear
        }
      }
      return null;
    };
  }

  // Converte string 'HH:mm:ss' para objeto Date (usado ao popular o form)
  private stringParaDate(timeString: string): Date | null {
    if (!timeString || !timeString.includes(":")) return null;
    try {
      const [hours, minutes, seconds] = timeString.split(":").map(Number);
      const date = new Date();
      date.setHours(hours, minutes, seconds ?? 0, 0);
      return date;
    } catch (e) {
      this.logger.logError(e, `church-form:stringParaDate(${timeString})`);
      return null;
    }
  }

  // Manipulação da imagem
  onImageSelect(event: any): void {
    const file = event.files?.[0];
    if (file) {
      this.loading = true;

      const reader = new FileReader();

      reader.onload = () => {
        const base64: string = reader.result as string;
        const base64WithoutPrefix = base64.split(",")[1];

        this.imagePreview = reader.result as string; // com prefixo, pra mostrar no <img>
        this.form.get("imagem")?.setValue(base64WithoutPrefix); // sem prefixo, pro backend

        this.loading = false;

        // Força a detecção de mudanças para atualizar o estado do formulário
        this.cd.markForCheck();
      };

      reader.onerror = () => {
        this.loading = false;
      };

      reader.readAsDataURL(file);
    }
  }

  // Emite o evento de busca de CEP para o componente pai
  triggerCepLookup(): void {
    const cepValue = this.form.get("cep")?.value;
    if (cepValue && cepValue.length >= 8) {
      // Verifica se tem tamanho mínimo
      this.cepLookup.emit(cepValue.replace(/\D/g, "")); // Envia só números
    }
  }

  onSubmitInternal(): void {
    if (this.form.valid) {
      this.formSubmit.emit(this.form.getRawValue() as ChurchFormData);
    } else {
      this.form.markAllAsTouched();
      const invalidFields = this.findInvalidControls()
        .map((key) => this.mapKeyToLabel(key))
        .join(', ');
  
      this.messageService.add({
        severity: 'error',
        summary: 'Erro de Validação',
        detail: `Verifique os campos obrigatórios: ${invalidFields}`,
      });
    }
  }
  
  private mapKeyToLabel(key: string): string {
    const labels: Record<string, string> = {
      nomeIgreja: 'Nome da Igreja',
      cep: 'CEP',
      numero: 'Número',
      typeChurchValue: 'Tipo de Igreja',
      missas: 'Horário das Missas',
    };
  
    return labels[key] ?? key;
  }

  // Helper para debug: encontrar campos inválidos
  public findInvalidControls(): string[] {
    const invalid: string[] = [];
    const controls = this.form.controls;
    for (const name in controls) {
      if (controls[name].invalid) {
        invalid.push(name);
      }
    }
    const missasArray = this.form.get("missas") as FormArray;
    missasArray.controls.forEach((group, index) => {
      if (group.invalid) {
        invalid.push(`missas[${index}]`);
        // Pode detalhar mais os erros dentro do grupo
      }
    });
    return invalid;
  }

  onCancelInternal(): void {
    this.formCancel.emit();
  }

  private disableFields(): void {
    this.form.get("typeChurch")?.disable();
    this.form.get("endereco")?.disable();
    this.form.get("numero")?.disable();
    this.form.get("bairro")?.disable();
    this.form.get("cidade")?.disable();
    this.form.get("estado")?.disable();
    this.form.get("complemento")?.disable();
    this.form.get("nomeIgreja")?.disable();
  }
}
