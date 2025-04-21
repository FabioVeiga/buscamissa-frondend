import { routes } from "./../../../../app.routes";
import { Component, inject, OnInit } from "@angular/core";
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from "@angular/forms";
import { ChurchesService } from "../../../../core/services/churches.service";
import { MessageService } from "primeng/api";
import { PrimeNgModule } from "../../../../shared/primeng.module";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { ShareButtons } from "ngx-sharebuttons/buttons";
import { Mass } from "../../church/models/church.model";
import { Church } from "../../../../core/interfaces/church.interface";

@Component({
  selector: "app-details",
  imports: [
    PrimeNgModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ShareButtons,
  ],
  providers: [MessageService],
  templateUrl: "./details.component.html",
  styleUrl: "./details.component.scss",
})
export class DetailsComponent implements OnInit {
  _toast = inject(MessageService);
  _church = inject(ChurchesService);
  _route = inject(ActivatedRoute);
  _router = inject(Router);
  form!: FormGroup;
  isLoading = false;
  churchCep: any | null = null;
  diasSemana = [
    { key: 0, label: "Domingo" },
    { key: 1, label: "Segunda-feira" },
    { key: 2, label: "Terça-feira" },
    { key: 3, label: "Quarta-feira" },
    { key: 4, label: "Quinta-feira" },
    { key: 5, label: "Sexta-feira" },
    { key: 6, label: "Sábado" },
  ];
  churchInfo: any;
  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      nomeIgreja: ["", Validators.required],
      nomeParoco: [""],
      cep: ["", Validators.pattern(/^\d{5}-\d{3}$/)],
      endereco: [""],
      numero: [""],
      complemento: [""],
      bairro: [""],
      cidade: [""],
      estado: [""],
      uf: [""],
      regiao: [""],
      telefone: ["", Validators.pattern(/^\(\d{2}\) \d{4}-\d{4}$/)],
      whatsapp: ["", Validators.pattern(/^\(\d{2}\) \d{5}-\d{4}$/)],
      emailContato: ["", Validators.email],
      facebook: [""],
      instagram: [""],
      youtube: [""],
      tiktok: [""],
      imagem: [""],
      missas: this.fb.array([]),
    });

    this._route.params.subscribe((params) => {
      this.churchCep = +params["cep"]; // O '+' converte a string para número
      if (this.churchCep) {
        this.loadChurchForEdit(this.churchCep);
        // this.loadInfo()
        this.form.disable();
      } else {
        this.adicionarHorario(); // Add an initial empty horario for new churches
      }
    });
  }

  // Função para carregar os dados da igreja para edição
  loadChurchForEdit(cep: any): void {
    this.isLoading = true;
    this._church.searchByCEP(cep).subscribe({
      next: (response: any) => {
        const igreja = response?.data.response; // Ajuste conforme a sua API
        this.churchInfo = igreja;
        if (igreja) {
          this.form?.patchValue({
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
          igreja.missas?.forEach((missa: any) => {
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
            this.horarios.disable();
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

  // Função para buscar a URL de uma rede social específica
  private getSocialMedia(redes: any[], tipo: number): string {
    const rede = redes?.find((r) => r.tipoRedeSocial === tipo);
    return rede ? rede.url : "";
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

  get horarios(): FormArray {
    return this.form.get("missas") as FormArray;
  }

  limparHorarios(): void {
    while (this.horarios.length !== 0) {
      this.horarios.removeAt(0); // Remove um por um
    }
  }

  adicionarHorario(): void {
    this.horarios.push(
      this.fb.group({
        id: [null],
        diaSemana: [null, Validators.required],
        horario: [null, [Validators.required, this.minutosValidos()]],
        observacao: [""],
      })
    );
  }

  removerHorario(index: number): void {
    this.horarios.removeAt(index);
  }

  stringParaDate(horario: string): Date {
    const [hourStr, minuteStr, secondStr = "00"] = horario?.split(":");

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

  voltar() {
    this._router.navigate(['/']);
  }

  getFormattedMasses(
    missas: Mass[]
  ): { horario: string; observacao: string }[] {
    const daysOfWeek = [
      "Domingo",
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
    ];

    const groupedMasses: { [key: number]: Mass[] } = {};
    missas.forEach((missa) => {
      if (missa.diaSemana !== undefined && !groupedMasses[missa.diaSemana]) {
        if (missa.diaSemana !== undefined) {
          groupedMasses[missa.diaSemana] = [];
        }
      }
      if (missa.diaSemana !== undefined) {
        groupedMasses[missa.diaSemana].push(missa);
      }
    });

    const formattedMasses: { horario: string; observacao: string }[] = [];
    for (const dayIndex in groupedMasses) {
      if (groupedMasses.hasOwnProperty(dayIndex)) {
        const day = daysOfWeek[parseInt(dayIndex, 10)];
        const massesOnDay = groupedMasses[dayIndex];
        const times = massesOnDay.map((missa) =>
          this.formatTime(missa.horario)
        );
        times.sort(); // Garante que os horários estejam em ordem crescente

        let horarioFormatado = `${day}: `;
        if (times.length === 1) {
          horarioFormatado += times[0];
        } else if (times.length > 1) {
          horarioFormatado += `${times[0]} - ${times[times.length - 1]}`;
        }

        // Pegar a observação (se houver) - aqui assumo que a observação é a mesma para todas as missas no mesmo dia. Se precisar de uma lógica mais complexa, ajuste aqui.
        const observacao = massesOnDay[0]?.observacao || "Sem observação";

        formattedMasses.push({
          horario: horarioFormatado,
          observacao: observacao,
        });
      }
    }

    return formattedMasses;
  }

  formatTime(timeString: string): string {
    const [hours, minutes] = timeString.split(":");
    return `${parseInt(hours, 10)}:${minutes}`;
  }
  
  getSocialIcon(url: string): string {
    if (url.includes("facebook.com")) return "pi pi-facebook";
    if (url.includes("instagram.com")) return "pi pi-instagram";
    if (url.includes("youtube.com")) return "pi pi-youtube";
    if (url.includes("tiktok.com")) return "pi pi-tiktok";

    return "pi pi-globe"; // Ícone padrão caso não encontre
  }

    editChurch(church: Church) {
      this._router.navigate(["/editar", church.id]);
    }
}
