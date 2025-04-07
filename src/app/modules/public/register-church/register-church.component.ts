import { CommonModule, DatePipe } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
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
import { ChurchesService } from "../../../core/services/churches.service";
import { HttpErrorResponse } from "@angular/common/http";
import { ActivatedRoute, Router } from "@angular/router";
import { MessageService } from "primeng/api";
import { PrimeNgModule } from "../../../core/shared/primeng.module";
import { LoadingComponent } from "../../../core/components/loading/loading.component";

interface typeChurch {
  name: string;
  value: string;
}

@Component({
  selector: "app-register-church",
  imports: [CommonModule, ReactiveFormsModule, PrimeNgModule],
  providers: [MessageService, DatePipe],
  templateUrl: "./register-church.component.html",
  styleUrls: ["./register-church.component.scss"],
})
export class RegisterChurchComponent implements OnInit {
  _toast = inject(MessageService);
  _church = inject(ChurchesService);
  _router = inject(Router);
  _route = inject(ActivatedRoute); // Injete ActivatedRoute
  _datePipe = inject(DatePipe);
  form!: FormGroup;

  isLoading = false;
  diaSelecionado: number | null = null;
  imageName = "";
  isEditMode = false; // Flag para indicar se estamos em modo de edição
  churchCep: any | null = null; // Para armazenar o CPF da igreja em edição
  churchId: number | null = null; // Para armazenar o ID da igreja em edição
  typeChurch: typeChurch[] | undefined;

  selectedChurch: typeChurch | undefined;

  diasSemana = [
    { key: 0, label: "Domingo" },
    { key: 1, label: "Segunda-feira" },
    { key: 2, label: "Terça-feira" },
    { key: 3, label: "Quarta-feira" },
    { key: 4, label: "Quinta-feira" },
    { key: 5, label: "Sexta-feira" },
    { key: 6, label: "Sábado" },
  ];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      nomeIgreja: ["", Validators.required],
      typeChurch: [""],
      nomeParoco: ["", Validators.required],
      cep: [""],
      endereco: [""],
      numero: ["", Validators.required],
      complemento: [""],
      bairro: [""],
      cidade: [""],
      estado: [""],
      uf: [""],
      regiao: [""],
      telefone: [""],
      whatsapp: [""],
      emailContato: ["", Validators.email],
      missas: this.fb.array([], Validators.required),
      facebook: [""],
      instagram: [""],
      tiktok: [""],
      youtube: [""],
      imagem: [""],
    });
    this.typeChurch = [
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
    this.form.get("nomeParoco")?.valueChanges.subscribe((value) => {
      if (value === null || value.trim() === "") {
        this.form.get("nomeParoco")?.setValue("", { emitEvent: false });
      } else if (!value.startsWith("Pe. ")) {
        this.form
          .get("nomeParoco")
          ?.setValue("Pe. " + value.replace(/^Pe\.\s*/, ""), {
            emitEvent: false,
          });
      }
    });

    // Verifica se estamos em modo de edição
    this._route.params.subscribe((params) => {
      this.churchCep = +params["cep"]; // O '+' converte a string para número
      if (this.churchCep) {
        this.isEditMode = true;
        this.loadChurchForEdit(this.churchCep);
        this.form.get("cep")?.disable();
      }
    });
  }

  // Função para carregar os dados da igreja para edição
  loadChurchForEdit(churchCep: any): void {
    this.isLoading = true;
    this._church.searchByCEP(churchCep).subscribe({
      next: (response: any) => {
        const igreja = response.data.response; // Ajuste conforme a sua API
        if (igreja) {
          this.form.patchValue({
            nomeIgreja: igreja.nome,
            nomeParoco: igreja.paroco,
            cep: igreja.endereco?.cep || "",
            endereco: igreja.endereco?.logradouro || "",
            numero: igreja.endereco?.numero || "",
            complemento: igreja.endereco?.complemento || "",
            bairro: igreja.endereco?.bairro || "",
            cidade: igreja.endereco?.localidade || "",
            estado: igreja.endereco?.estado || "",
            uf: igreja.endereco?.uf || "",
            regiao: igreja.endereco?.regiao || "",
            telefone: igreja.contato?.telefone
              ? `${igreja.contato.ddd}${igreja.contato.telefone}`
              : "",
            whatsapp: igreja.contato?.telefoneWhatsApp
              ? `${igreja.contato.dddWhatsApp}${igreja.contato.telefoneWhatsApp}`
              : "",
            emailContato: igreja.contato?.emailContato || "",
            facebook: this.getSocialMedia(igreja.redesSociais, 1),
            instagram: this.getSocialMedia(igreja.redesSociais, 2),
            youtube: this.getSocialMedia(igreja.redesSociais, 3),
            tiktok: this.getSocialMedia(igreja.redesSociais, 4),
            imagem: igreja.imagemUrl, // Se a API retornar a URL da imagem
          });
          this.limparHorarios();
          igreja.missas.forEach((missa: any) => {
            const horario = missa.horario
              ? this.stringParaDate(missa.horario)
              : null;
            this.horarios.push(
              this.fb.group({
                id: [missa.id], // Se a missa tiver um ID
                diaSemana: [missa.diaSemana, Validators.required],
                horario: [
                  horario,
                  [Validators.required, this.minutosValidos()],
                ],
                observacao: [missa.observacao],
              })
            );
          });
        } else {
          this._toast.add({
            severity: "error",
            summary: "Erro",
            detail: "Dados da igreja não encontrados.",
          });
        }
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        this._toast.add({
          severity: "error",
          summary: "Erro",
          detail: "Erro ao carregar dados da igreja para edição.",
        });
        console.error(error);
      },
    });
  }

  // Função para buscar o endereço pelo CEP.
  getCEP() {
    if (!this.form.get("cep")?.value) return;
    this.isLoading = true;
    const cepAtual = this.form.get("cep")?.value;
    this.limparHorarios();
    this.enableFields();
    this._church.searchByCEP(cepAtual).subscribe({
      next: (response: any) => {
        // Verifica se a resposta contém os dados da igreja
        if (response.data.response) {
          const igreja = response.data.response;

          // Reseta o formulário mantendo o CEP
          this.form.reset();
          this.form.patchValue({ cep: cepAtual });

          // Preenche os dados no formulário
          this.churchId = igreja.id; // Guarda o ID para edição futura
          this.form.patchValue({
            nomeIgreja: igreja.nome,
            nomeParoco: igreja.paroco,
            endereco: igreja.endereco.logradouro,
            numero: igreja.endereco.numero,
            complemento: igreja.endereco.complemento,
            bairro: igreja.endereco.bairro,
            imagem: igreja.imagemUrl,
            cidade: igreja.endereco.localidade,
            estado: igreja.endereco.estado,
            uf: igreja.endereco.uf,
            regiao: igreja.endereco.regiao,
            telefone: `${igreja.contato.ddd}${igreja.contato.telefone}`,
            whatsapp: `${igreja.contato.dddWhatsApp}${igreja.contato.telefoneWhatsApp}`,
            emailContato: igreja.contato.emailContato,
            facebook: this.getSocialMedia(igreja.redesSociais, 1),
            instagram: this.getSocialMedia(igreja.redesSociais, 2),
            youtube: this.getSocialMedia(igreja.redesSociais, 3),
            tiktok: this.getSocialMedia(igreja.redesSociais, 4),
          });

          // Limpa os horários e adiciona os novos
          igreja.missas.forEach((missa: any) => {
            const horario = missa.horario
              ? this.stringParaDate(missa.horario)
              : null;
            this.horarios.push(
              this.fb.group({
                id: [missa.id],
                diaSemana: [missa.diaSemana, Validators.required],
                horario: [horario, [Validators.required]],
                observacao: [missa.observacao],
              })
            );
          });

          // Desabilita os campos necessários
          this.disableFields();
        }
        this.isLoading = false;
      },
      error: (error) => {
        if (error.status === 404 && error.error?.data?.endereco) {
          const endereco = error.error.data.endereco;

          // Reseta o formulário mantendo o CEP
          this.form.reset();
          this.form.patchValue({ cep: cepAtual });

          const todosNulos = Object.values(endereco).every(
            (valor) => valor === null || valor === undefined || valor === ""
          );

          if (todosNulos) {
            this.form.reset();
            document.getElementById("cep")?.focus();
            return this._toast.add({
              severity: "info",
              summary: "Erro",
              detail: "CEP não encontrado ou inválido, por favor, informe outro.",
            });
          }

          this.form.patchValue({
            endereco: endereco.logradouro,
            numero: endereco.complemento,
            bairro: endereco.bairro,
            cidade: endereco.localidade,
            estado: endereco.estado,
            uf: endereco.uf,
            regiao: endereco.regiao,
          });
          this.isEditMode = true;
          if (!todosNulos) {
            this.disableAddressFields();
          }

          this._toast.add({
            severity: "info",
            summary: "Informação",
            detail: error.error.data.messagemAplicacao,
          });
        } else {
          console.error("Ocorreu um erro ao buscar o CEP.", error);
        }
        this.isLoading = false;
      },
      complete: () => {
        this.isLoading = false;
      },
    });
  }

  enableFields() {
    Object.keys(this.form.controls).forEach((field) => {
      this.form.get(field)?.enable();
    });
  }

  minutosValidos(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (control.value) {
        let horario = control.value;

        // Se for um objeto Date, converta para string no formato "HH:mm:ss"
        if (horario instanceof Date) {
          const hours = horario.getHours().toString().padStart(2, "0");
          const minutes = horario.getMinutes().toString().padStart(2, "0");
          const seconds = horario.getSeconds().toString().padStart(2, "0");
          horario = `${hours}:${minutes}:${seconds}`; // Converte para "HH:mm:ss"
        }

        const [hours, minutes] = horario
          .split(":")
          .map((val: string) => parseInt(val, 10));

        if (![0, 15, 30, 45].includes(minutes)) {
          return { minutosInvalidos: true };
        }
      }
      return null;
    };
  }

  stringParaDate(horario: string): Date {
    const [hourStr, minuteStr, secondStr] = horario?.split(":");

    const hours = parseInt(hourStr, 10);
    const minutes = parseInt(minuteStr, 10);
    const seconds = parseInt(secondStr, 10);

    // Criamos um objeto Date com a data padrão e apenas alteramos as horas, minutos e segundos
    const date = new Date();
    date.setHours(hours, minutes, seconds, 0); // Setando a hora, minutos e segundos

    return date;
  }

  dateParaString(date: Date): string {
    const hours = date.getHours().toString().padStart(2, "0"); // Adiciona zero à esquerda se necessário
    const minutes = date.getMinutes().toString().padStart(2, "0"); // Adiciona zero à esquerda se necessário
    const seconds = date.getSeconds().toString().padStart(2, "0"); // Adiciona zero à esquerda se necessário

    return `${hours}:${minutes}:${seconds}`;
  }

  disableAddressFields() {
    this.form.get("endereco")?.disable();
    this.form.get("bairro")?.disable();
    this.form.get("cidade")?.disable();
    this.form.get("estado")?.disable();
    this.form.get("numero")?.enable();
  }

  get horarios(): FormArray {
    return this.form.get("missas") as FormArray;
  }

  adicionarHorario(): void {
    this.horarios.push(
      this.fb.group({
        diaSemana: ["", [Validators.required]],
        horario: [
          null, // Permite que o valor inicial seja null ou vazio
          [Validators.required, this.minutosValidos()],
        ],
        observacao: "",
      })
    );
  }

  removerHorario(index: number): void {
    this.horarios.removeAt(index);
  }

  limparHorarios(): void {
    while (this.horarios.length !== 0) {
      this.horarios.removeAt(0); // Remove um por um
    }
  }

  onImageSelect(event: any): void {
    const file = event.files[0];
    if (file) {
      this.imageName = file.name;
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(",")[1]; // Extrai a parte base64
        this.form.get("imagem")?.setValue(base64Data); // Atualiza o valor no formulário
      };
    }
  }

  // Função de submissão (para novo registro)
  submit(): void {
    this.isLoading = true;
    const formValues = this.form.getRawValue();
    const telefoneLimpo = formValues.telefone?.replace(/\D/g, "");
    const whatsappLimpo = formValues.whatsapp?.replace(/\D/g, "");
    const payload = {
      nome: this.typeChurch + formValues.nomeIgreja,
      paroco: formValues.nomeParoco,
      imagem: formValues.imagem,
      missas: formValues.missas.map((missa: any) => ({
        diaSemana: missa.diaSemana,
        horario: this._datePipe.transform(missa.horario, "HH:mm:ss"),
        observacao: missa.observacao,
      })),
      endereco: {
        cep: formValues.cep,
        logradouro: formValues.endereco,
        complemento: formValues.complemento,
        bairro: formValues.bairro,
        localidade: formValues.cidade,
        uf: formValues.uf,
        estado: formValues.estado,
        regiao: formValues.regiao,
        numero: formValues.numero,
      },
      contato: {
        ddd: telefoneLimpo?.substring(0, 2),
        telefone: telefoneLimpo?.substring(2),
        dddWhatsApp: whatsappLimpo?.substring(0, 2),
        telefoneWhatsApp: whatsappLimpo?.substring(2),
      },
      redeSociais: [
        { tipoRedeSocial: 1, nomeDoPerfil: formValues.facebook },
        { tipoRedeSocial: 2, nomeDoPerfil: formValues.instagram },
        { tipoRedeSocial: 3, nomeDoPerfil: formValues.youtube },
        { tipoRedeSocial: 4, nomeDoPerfil: formValues.tiktok },
      ],
    };
    this._church.newChurch(payload).subscribe({
      next: (response: any) => {
        const controleId = response?.data?.response?.controleId;
        if (controleId) {
          this._router.navigate(["/enviar-codigo", controleId]);
        } else {
          console.log("Erro: controleId não encontrado na resposta");
        }
        this.isLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading = false;
        let errorMessage = "";
        if (
          error.error &&
          error.error.errors &&
          typeof error.error.errors === "object"
        ) {
          for (const field in error.error.errors) {
            if (error.error.errors.hasOwnProperty(field)) {
              const fieldErrors = Array.isArray(error.error.errors[field])
                ? error.error.errors[field].join(", ")
                : error.error.errors[field];

              errorMessage += `${field}: ${fieldErrors}\n`;
            }
          }
        } else {
          errorMessage = "Erro desconhecido ao processar as informações.";
        }
        this._toast.add({
          severity: "error",
          summary: "Erro de Validação",
          detail: errorMessage || "Erro de validação.",
        });
      },
      complete: () => {
        this.isLoading = false;
      },
    });
  }

  // Função para salvar as alterações (edição)
  save(): void {
    this.isLoading = true;
    const formValues = this.form.getRawValue();
    const telefoneLimpo = formValues.telefone?.replace(/\D/g, "");
    const whatsappLimpo = formValues.whatsapp?.replace(/\D/g, "");
    const payload = {
      id: this.churchId ?? null, // Use o ID da igreja carregado
      paroco: formValues.nomeParoco,
      imagem: formValues.imagem,
      missas: formValues.missas.map((missa: any) => ({
        id: missa.id,
        diaSemana: missa.diaSemana,
        horario:
          typeof missa.horario === "string"
            ? this.stringParaDate(missa.horario)
            : this.dateParaString(missa.horario),
        observacao: missa.observacao,
      })),
      contato: {
        emailContato: formValues.emailContato,
        ddd: telefoneLimpo?.substring(0, 2),
        telefone: telefoneLimpo?.substring(2),
        dddWhatsApp: whatsappLimpo?.substring(0, 2),
        telefoneWhatsApp: whatsappLimpo?.substring(2),
      },
    };
    this._church.updateChurch(payload).subscribe({
      next: (response: any) => {
        this._toast.add({
          severity: "success",
          summary: "Sucesso",
          detail: "Igreja atualizada com sucesso!",
        });
        this._router.navigate(["/"]); // Redireciona para a listagem ou outra página
        this.isLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading = false;
        let errorMessage = "";
        if (
          error.error &&
          error.error.errors &&
          typeof error.error.errors === "object"
        ) {
          for (const field in error.error.errors) {
            if (error.error.errors.hasOwnProperty(field)) {
              const fieldErrors = Array.isArray(error.error.errors[field])
                ? error.error.errors[field].join(", ")
                : error.error.errors[field];

              errorMessage += `${field}: ${fieldErrors}\n`;
            }
          }
        } else {
          errorMessage = "Erro desconhecido ao processar as informações.";
        }
        this._toast.add({
          severity: "error",
          summary: "Erro de Validação",
          detail: errorMessage || "Erro de validação.",
        });
      },
      complete: () => {
        this.isLoading = false;
      },
    });
  }

  // Função para lidar com o envio do formulário (chama submit ou save dependendo do modo)
  onSubmit(): void {
    if (this.isEditMode) {
      this.save();
    } else {
      this.submit();
    }
  }

  // Função para buscar a URL de uma rede social específica
  private getSocialMedia(redes: any[], tipo: number): string {
    const rede = redes.find((r) => r.tipoRedeSocial === tipo);
    return rede ? rede.url : "";
  }

  // Função para desabilitar os campos após preenchimento (manter se necessário)
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

  addPrefix() {
    let control = this.form.get("nomeParoco");
    if (control && control.value && !control.value.startsWith("Pe. ")) {
      control.setValue("Pe. " + control.value);
    }
  }
}
