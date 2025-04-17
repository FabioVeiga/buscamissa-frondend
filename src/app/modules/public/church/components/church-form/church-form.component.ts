// src/app/features/church/components/church-form/church-form.component.ts
import {
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

interface TypeChurchOption {
  name: string;
  value: string;
}

@Component({
  selector: "app-church-form",
  standalone: true, // Considere usar standalone components
  imports: [CommonModule, ReactiveFormsModule, PrimeNgModule],
  providers: [DatePipe], // DatePipe aqui se não for providedIn: 'root'
  templateUrl: "./church-form.component.html",
  styleUrls: ["./church-form.component.scss"],
})
export class ChurchFormComponent implements OnInit, OnChanges {
  @Input() initialData: ChurchFormData | null = null;
  @Input() isSaving: boolean = false;
  @Input() isEditMode: boolean = false; // Para desabilitar CEP na edição
  @Output() formSubmit = new EventEmitter<ChurchFormData>();
  @Output() formCancel = new EventEmitter<void>(); // Opcional: Para botão Cancelar
  @Output() cepLookup = new EventEmitter<string>(); // Emitir evento para busca de CEP

  private fb = inject(FormBuilder);
  form!: FormGroup;
  imageName: string | null = null;
  showAddressFields = false;

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
    { name: "Outro", value: "Outro" },
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

  ngOnInit(): void {
    this.initForm();

    if (this.initialData) {
      this.populateForm(this.initialData);
    }

    if (this.isEditMode) {
      this.disableFields(); // Desabilita campos se necessário
      this.form.get("cep")?.disable(); // Desabilita CEP na edição
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
  }

  private initForm(): void {
    this.form = this.fb.group({
      id: [null], // Necessário para saber qual registro atualizar
      typeChurchValue: [null, this.isEditMode ? '' : Validators.required], // Campo separado para o tipo
      nomeIgreja: ["", Validators.required], // Apenas o nome
      nomeParoco: ["", Validators.required],
      cep: ["", Validators.required], // CEP é sempre obrigatório inicialmente
      endereco: [{ value: "", disabled: true }], // Habilitado por padrão
      numero: ["", Validators.required],
      complemento: [""],
      bairro: [{ value: "", disabled: true }],
      cidade: [{ value: "", disabled: true }],
      estado: [{ value: "", disabled: true }],
      uf: [{ value: "", disabled: true }], // Manter UF se a API precisar
      regiao: [{ value: "", disabled: true }], // Manter Região se a API precisar
      telefone: [""],
      whatsapp: [""],
      emailContato: ["", Validators.email],
      missas: this.fb.array([], Validators.required), // Pelo menos uma missa?
      facebook: [""],
      instagram: [""],
      tiktok: [""],
      youtube: [""],
      imagem: [null], // Armazena base64
    });
  }

  private populateForm(data: ChurchFormData): void {
    this.form.patchValue(data); // patchValue ignora campos extras e não existentes no form
    // Limpar e popular FormArray de Missas
    this.horarios.clear();
    data.missas?.forEach((missa) => this.addMissaControl(missa));

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

  get horarios(): FormArray {
    return this.form.get("missas") as FormArray;
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
        observacao: [missa?.observacao ?? ""],
      })
    );
  }

  // Adiciona um novo grupo de missa vazio
  adicionarHorario(): void {
    this.addMissaControl();
  }

  removerHorario(index: number): void {
    this.horarios.removeAt(index);
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
      console.error("Erro ao converter string para Date:", timeString, e);
      return null;
    }
  }

  // Manipulação da imagem
  onImageSelect(event: any): void {
    const file = event.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64: string = reader.result as string;
        const base64WithoutPrefix = base64.split(',')[1];
        this.form.get('imagem')?.setValue(base64WithoutPrefix);
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

  // Submissão do Formulário
  onSubmitInternal(): void {
    if (this.form.valid) {
      // Retorna os valores brutos, incluindo campos desabilitados como o CEP na edição
      this.formSubmit.emit(this.form.getRawValue() as ChurchFormData);
    } else {
      this.form.markAllAsTouched();
      // Opcional: Focar no primeiro campo inválido ou mostrar toast
      console.error("Formulário inválido:", this.findInvalidControls());
    }
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
    this.form.get("telefone")?.disable();
    this.form.get("whatsapp")?.disable();
    this.form.get("emailContato")?.disable();
    this.form.get("typeChurch")?.disable();
    this.form.get("endereco")?.disable();
    this.form.get("numero")?.disable();
    this.form.get("bairro")?.disable();
    this.form.get("cidade")?.disable();
    this.form.get("estado")?.disable();
    this.form.get("facebook")?.disable();
    this.form.get("instagram")?.disable();
    this.form.get("tiktok")?.disable();
    this.form.get("complemento")?.disable();
    this.form.get("youtube")?.disable();
    this.form.get("nomeIgreja")?.disable();
  }
}
