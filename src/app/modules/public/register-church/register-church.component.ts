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
import { NgxMaskDirective, NgxMaskPipe, provideNgxMask } from "ngx-mask";

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
    NgxMaskDirective,
  ],
  providers: [provideNgxMask()],
  templateUrl: "./register-church.component.html",
  styleUrls: ["./register-church.component.scss"],
})
export class RegisterChurchComponent implements OnInit {
  _church = inject(ChurchesService);
  form!: FormGroup;
  diaSelecionado: number | null = null;
  imageName = "";

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
      missas: this.fb.array([], Validators.required),
      facebook: [""],
      instagram: [""],
      linkedin: [""],
      youtube: [""],
      imagem: [""],
    });
  }

  // Função para buscar o endereço pelo CEP.
  getCEP() {
    this._church.searchByCEP(this.form.get("cep")?.value).subscribe({
      next: (response: any) => {
        const igreja = response.data.response;

        if (igreja && igreja.endereco) {
          this.form.patchValue({
            nomeIgreja: igreja.nome,
            nomeParoco: igreja.paroco,
            cep: igreja.endereco.cep,
            endereco: igreja.endereco.logradouro,
            numero: igreja.endereco.complemento,
            bairro: igreja.endereco.bairro,
            cidade: igreja.endereco.localidade,
            estado: igreja.endereco.uf,
            telefone: igreja.contato?.telefone || "",
            whatsapp: igreja.contato?.telefoneWhatsApp || "",
            emailContato: igreja.contato?.emailContato || "",
            facebook: this.getSocialMedia(igreja.redesSociais, 1),
            instagram: this.getSocialMedia(igreja.redesSociais, 2),
            youtube: this.getSocialMedia(igreja.redesSociais, 3),
            linkedin: this.getSocialMedia(igreja.redesSociais, 4),
          });

          // Desabilita os campos preenchidos
          this.disableFields();
        }

        // Preenche os horários das missas
        this.horarios.clear();
        if (igreja.missas && igreja.missas.length) {
          igreja.missas.forEach((missa: any) => {
            this.horarios.push(
              this.fb.group({
                diaSemana: [missa.diaSemana, Validators.required],
                horario: [
                  missa.horario,
                  [Validators.required, horarioMinutosValidator()],
                ],
                observacao: [missa.observacao],
              })
            );
          });
        }
      },
      error: (error: HttpErrorResponse) => {
        console.error("Erro ao buscar CEP:", error);
      },
    });
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
        this.form.get("imagem")?.setValue(reader.result as string); // Armazenando o valor em base64
      };
    }
  }

  // Função de submissão
  submit(): void {
    if (this.form.invalid) {
      console.log("Por favor, preencha todos os campos obrigatórios.");
      return; // Evita o envio do formulário
    }

    const formValues = this.form.value;
    const payload = {
      nome: formValues.nomeIgreja,
      paroco: formValues.nomeParoco,
      imagem: formValues.imagem,
      missas: formValues.missas.map((missa: any) => ({
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
        estado: formValues.estado ?? "0",
        regiao: formValues.regiao ?? "0",
      },
      contato: {
        emailContato: formValues.emailContato,
        ddd: formValues.telefone.substring(0, 2),
        telefone: formValues.telefone.substring(2),
        dddWhatsApp: formValues.whatsapp.substring(0, 2),
        telefoneWhatsApp: formValues.whatsapp.substring(2),
      },

      redeSociais: [
        { tipoRedeSocial: 1, nomeDoPerfil: formValues.linkedin },
        { tipoRedeSocial: 2, nomeDoPerfil: formValues.facebook },
        { tipoRedeSocial: 3, nomeDoPerfil: formValues.instagram },
        { tipoRedeSocial: 4, nomeDoPerfil: formValues.youtube },
      ],
    };
    this._church.newChurch(payload).subscribe({
      next: (response: any) => {
        console.log("Igreja cadastrada com sucesso!", response);
      },
      error: (error: HttpErrorResponse) => {
        console.error("Ocorreu um erro ao cadastrar a igreja.", error);
      },
    });
  }

  // Função para buscar a URL de uma rede social específica
  private getSocialMedia(redes: any[], tipo: number): string {
    const rede = redes.find((r) => r.tipoRedeSocial === tipo);
    return rede ? rede.url : "";
  }

  // Função para desabilitar os campos após preenchimento
  private disableFields(): void {
    this.form.get("nomeIgreja")?.disable();
    this.form.get("nomeParoco")?.disable();
    this.form.get("cep")?.disable();
    this.form.get("endereco")?.disable();
    this.form.get("numero")?.disable();
    this.form.get("bairro")?.disable();
    this.form.get("cidade")?.disable();
    this.form.get("estado")?.disable();
    this.form.get("telefone")?.disable();
    this.form.get("whatsapp")?.disable();
    this.form.get("emailContato")?.disable();
    this.form.get("facebook")?.disable();
    this.form.get("instagram")?.disable();
    this.form.get("linkedin")?.disable();
    this.form.get("youtube")?.disable();
  }
}
