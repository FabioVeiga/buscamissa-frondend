import { Component, inject } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import {
  FormControl,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormBuilder,
} from "@angular/forms";
import { ChurchesService } from "../../../core/services/churches.service";
import { MessageService } from "primeng/api";
import { WEEK_DAYS } from "../../../core/constants/weekdays";
import { PrimeNgModule } from "../../../shared/primeng.module";
import {
  Church,
  FilterSearchChurch,
  Mass,
  ResponseAddress,
} from "../../../core/interfaces/church.interface";
import { HttpErrorResponse } from "@angular/common/http";
import { ModalComponent } from "../../../core/components/modal/modal.component";
import { Router, RouterModule } from "@angular/router";
import { ShareButtons } from "ngx-sharebuttons/buttons";
import { STATES } from "../../../core/constants/states";

interface AddressData {
  [uf: string]: {
    [city: string]: string[];
  };
}

@Component({
  selector: "app-home",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PrimeNgModule,
    ModalComponent,
    RouterModule,
    ShareButtons,
  ],
  providers: [MessageService, DatePipe],
  templateUrl: "./home.component.html",
  styleUrls: ["./home.component.scss"],
})
export class HomeComponent {
  private _churchService = inject(ChurchesService);
  private _toast = inject(MessageService);
  private _datePipe = inject(DatePipe);
  private _fb = inject(FormBuilder);
  public _router = inject(Router);

  public isLoading = false;
  public isLoadingAddress = false;
  public isLoadingCities = false;
  public isLoadingDistricts = false;
  public showNoChurchCard = false;

  public isModalVisible: boolean = false;
  public modalHeader: string = "Denunciar igreja";
  public totalRecords: any;

  public reportForm: FormGroup = new FormGroup({
    titulo: new FormControl("", Validators.required),
    descricao: new FormControl("", Validators.required),
    nomeDenunciador: new FormControl("", Validators.required),
    emailDenunciador: new FormControl("", [
      Validators.required,
      Validators.email,
    ]),
  });

  public churchInfo: Church[] = [];
  public weakDays = WEEK_DAYS;

  public statesList: { label: string; value: string }[] = [];
  public citiesList: { label: string; value: string }[] = [];
  public districtsList: { label: string; value: string }[] = [];

  public selectedState: string = "";
  public selectedCity: string = "";
  public selectedDistrict: string = "";

  public fullAddressData: AddressData = {};

  totalItems: number = 0;
  pageSize: number = 10;
  pageIndex: number = 1;

  public form!: FormGroup;

  ngOnInit(): void {
    this.getAddress();
    this.form = this._fb.group({
      Uf: [null, Validators.required],
      Localidade: [null],
      Bairro: [null],
      DiaDaSemana: [null],
      Horario: [null],
    });
  }

  setDefaultTimeIfNull() {
    const currentValue = this.form.get("Horario")?.value;
    if (!currentValue) {
      const defaultTime = new Date();
      defaultTime.setHours(0, 0, 0, 0);
      this.form.get("Horario")?.setValue(defaultTime);
    }
  }

  public getAddress(): void {
    this.isLoadingAddress = true;

    this._churchService.addressRange().subscribe({
      next: ({ data }: { data: AddressData }) => {
        this.fullAddressData = data;
        this.statesList = Object.keys(data).map((sigla) => {
          const estado = STATES.find((s) => s.sigla === sigla);
          return {
            label: estado?.nome || sigla,
            value: sigla,
          };
        });
      },
      error: () => {
        this._toast.add({
          severity: "error",
          summary: "Erro ao carregar dados",
          detail: "Não foi possível carregar as cidades e bairros.",
        });
      },
      complete: () => {
        this.isLoadingAddress = false;
      },
    });
  }

  public onStateChange(event: any): void {
    this.selectedState = event.value;
    if (this.selectedState) {
      const cities = Object.keys(this.fullAddressData[this.selectedState]);
      this.citiesList = cities.map((city) => ({
        label: city,
        value: city,
      }));

      // Limpa e reseta os bairros
      this.districtsList = [];
      this.selectedCity = "";
    }
  }

  public onCityChange(event: any): void {
    this.selectedCity = event.value;
    if (this.selectedState && this.selectedCity) {
      const districts =
        this.fullAddressData[this.selectedState][this.selectedCity];
      this.districtsList = districts.map((district) => ({
        label: district,
        value: district,
      }));
    }
  }

  public searchFilter(): void {
    if (this.isLoading || this.form.invalid) return;

    this.isLoading = true; // Marca o início do carregamento
    this.churchInfo = []; // Limpa os dados anteriores

    const filters: FilterSearchChurch = {
      Uf: this.form.get("Uf")?.value, // Estado
      Localidade: this.form.get("Localidade")?.value, // Cidade
      Bairro: this.form.get("Bairro")?.value, // Bairro
      DiaDaSemana: this.form.get("DiaDaSemana")?.value,
      Horario: this._datePipe.transform(this.form.value.Horario, "HH:mm"),
      "Paginacao.PageIndex": this.pageIndex,
      "Paginacao.PageSize": this.pageSize,
    };

    this._churchService.searchByFilters(filters).subscribe({
      next: (data: any) => {
        this.churchInfo = data.data.items;
        this.totalRecords = data.data.totalItems;
        this.isLoading = false;

        if (!this.churchInfo.length) {
          this._toast.add({
            severity: "warn",
            summary: "Nenhuma igreja encontrada",
            detail: "Não encontramos igrejas para os filtros aplicados.",
          });
          this.showNoChurchCard = true;
        } else {
          this.showNoChurchCard = false;
        }
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading = false;
        if (err.error.status === 404) {
          this._toast.add({
            severity: "warn",
            summary: "Nenhuma igreja encontrada",
            detail: "Não encontramos igrejas para os filtros aplicados.",
          });
          this.showNoChurchCard = true;
        } else {
          this._toast.add({
            severity: "error",
            summary: "Erro na busca",
            detail: "Não foi possível buscar igrejas.",
          });
          this.showNoChurchCard = false;
        }
      },
      complete: () => {
        this.isLoading = false; // Marca o final do carregamento
      },
    });
  }

  onPageChange(event: any) {
    this.pageIndex = Math.floor(event.first / event.rows) + 1; 
    this.pageSize = event.rows;
    this.searchFilter();
  }

  clearFilter() {
    this.form.reset();
    this.churchInfo = [];
    this.showNoChurchCard = false;
  }

  editChurch(church: Church) {
    // Receba o objeto da igreja
    // Redireciona para a página de edição com o CPF da igreja
    this._router.navigate(["/editar", church.id]);
  }

  reportChurch(idChurch: any): void {
    // Renomeie a função para usar os dados do form
    if (this.reportForm.valid) {
      const reportData = this.reportForm.value;
      this._churchService.report(idChurch.id, reportData).subscribe({
        next: (res: any) => {
          if (!res.data.resultadoDenuncia) {
            this.isModalVisible = false;
            return this._toast.add({
              severity: "warn",
              summary: "Alerta",
              detail: res.data.messagemAplicacao,
              
            });
          } else {
            this.isModalVisible = false;
            this._toast.add({
              severity: "success",
              summary: "Sucesso",
              detail: "Denúncia enviada com sucesso!",
            });
          }
        },
        error: (err: HttpErrorResponse) => {
          console.error(err);
          this._toast.add({
            severity: "warn",
            summary: "Igreja não encontrada",
            detail: "Igreja não encontrada.",
          });
        },
      });
    }
  }

  abrirModalDenuncia(): void {
    // Crie uma função específica para abrir o modal de denúncia
    this.isModalVisible = true;
    this.reportForm.reset(); // Limpa o formulário ao abrir o modal
  }

  fecharModal(): void {
    this.isModalVisible = false;
    this.reportForm.reset(); // Limpa o formulário ao fechar o modal
    console.log("Modal foi fechado.");
  }

  onModalShow(): void {
    console.log("Modal foi aberto.");
  }

  // Converte dia da semana de número para nome
  getDayName(dia: number): string {
    const daysOfWeek = [
      "Domingo",
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
    ];
    return daysOfWeek[dia] || "Desconhecido";
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
}
