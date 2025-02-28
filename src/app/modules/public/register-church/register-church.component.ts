import { CommonModule } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatOptionModule } from "@angular/material/core";
import { MatDividerModule } from "@angular/material/divider";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { ChurchesService } from "../../../core/services/churches.service";
import { HttpErrorResponse } from "@angular/common/http";
import { MatSelectModule } from "@angular/material/select";
import { horarioMinutosValidator } from "../../../core/misc/validator-minute";

@Component({
  selector: "app-register-church",
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatOptionModule,
    MatCheckboxModule,
    MatCardModule,
    MatDividerModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDividerModule,
  ],
  templateUrl: "./register-church.component.html",
  styleUrls: ["./register-church.component.scss"],
})
export class RegisterChurchComponent implements OnInit {
  _church = inject(ChurchesService);
  form!: FormGroup;
  diaSelecionado: number | null = null;
  imageName = ""; // Nome da imagem selecionada

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
      nomeParoco: ["", Validators.required],
      cep: [""],
      endereco: [""],
      numero: [""],
      bairro: [""],
      cidade: [""],
      estado: [""],
      telefone: [""],
      whatsapp: [""],
      emailContato: [""],
      missas: this.fb.array([], Validators.required), // FormArray para armazenar os horários
      facebook: [""], // Nome do perfil do Facebook
      instagram: [""], // Nome do perfil do Instagram
      linkedin: [""], // Nome do perfil do LinkedIn
      youtube: [""], // Nome do perfil do YouTube
      imagem: [""], // Imagem da igreja em base64
    });
  }

  // Função para buscar o endereço pelo CEP.
  getCEP() {
    // this._church.searchByCEP(this.form.get("cep")?.value).subscribe({
    //   next: (response: any) => {
    //     const address = response.data[0].endereco;
    //     this.form.get("endereco")?.setValue(address.logradouro);
    //     this.form.get("bairro")?.setValue(address.bairro);
    //     this.form.get("cidade")?.setValue(address.localidade);
    //     this.form.get("estado")?.setValue(address.uf);
    //   },
    //   error: (error: HttpErrorResponse) => {
    //     console.error(error);
    //   },
    // });
  }

  get horarios(): FormArray {
    return this.form.get("missas") as FormArray;
  }

  adicionarHorario(): void {
    this.horarios.push(
      this.fb.group({
        diaSemana: ["", [Validators.required]], // Dropdown do dia da semana
        horario: ["", [Validators.required, horarioMinutosValidator()]], // Horário
        observacao: "", // Observação
      })
    );
  }

  removerHorario(index: number): void {
    this.horarios.removeAt(index);
  }

  // Função para selecionar a imagem
  onImageSelect(event: any): void {
    const file = event.target.files[0];

    if (file) {
      this.imageName = file.name; // Armazena o nome do arquivo
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        this.form.get("imagemBase64")?.setValue(reader.result as string); // Armazenando o valor em base64
      };
    }
  }

  // Função de submissão
  submit(): void {
    if (this.form.invalid) {
      console.log("Por favor, preencha todos os campos obrigatórios.");
      return; // Evita o envio do formulário
    }

    // Obtendo os valores do formulário
    const formValues = this.form.value;

    // Mapeando os valores para o formato desejado
    const payload = {
      nome: formValues.nomeIgreja,
      paroco: formValues.nomeParoco,
      imagem: formValues.imagem, // Aqui você já terá o base64 da imagem
      missas: formValues.missas.map((missa: any) => ({
        id: 0, // Ajuste do id conforme necessário
        diaSemana: missa.diaSemana,
        horario: missa.horario,
        observacao: missa.observacao,
      })),
      endereco: {
        cep: formValues.cep,
        logradouro: formValues.endereco,
        complemento: formValues.numero,
        bairro: formValues.bairro,
        localidade: formValues.cidade,
        uf: formValues.estado,
        estado: formValues.estado || "0",  // Caso precise do estado aqui
        regiao: formValues.regiao || "0" 
      },
      contato: {
        emailContato: formValues.emailContato || "",
        ddd: "11",  // Pega o DDD do telefone
        telefone: formValues.telefone || "",  // Verifica se o campo de telefone está preenchido
        dddWhatsApp: "11", // Pega o DDD do WhatsApp
        telefoneWhatsApp: formValues.whatsapp || ""  // Verifica se o campo de WhatsApp está preenchido
      },
      redeSociais: [
        { tipoRedeSocial: 1, nomeDoPerfil: formValues.linkedin || "" },
        { tipoRedeSocial: 2, nomeDoPerfil: formValues.facebook || "" },
        { tipoRedeSocial: 3, nomeDoPerfil: formValues.instagram || "" },
        { tipoRedeSocial: 4, nomeDoPerfil: formValues.youtube || "" }
      ]
    };
    this._church.newChurch(payload).subscribe({
      next: (response: any) => {
        console.log("Igreja cadastrada com sucesso!", response);
      },
      error: (error: HttpErrorResponse) => {
        console.error("Ocorreu um erro ao cadastrar a igreja.", error);
      }
    });
    // console.log(payload); // Aqui você pode processar o payload, como enviar para o backend
  }
}
