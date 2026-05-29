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
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
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
  private _route = inject(ActivatedRoute);

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
    this.form = this._fb.group({
      Uf: [null, Validators.required],
      Localidade: [null],
      Bairro: [null],
      DiaDaSemana: [null],
      Horario: [null],
    });
    this.getAddress();
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
        }).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
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
        this._restoreFromQueryParams();
      },
    });
  }

  private _restoreFromQueryParams(): void {
    const p = this._route.snapshot.queryParams;
    if (!p['uf']) return;

    // Restaura UF e popula cidades
    this.form.get('Uf')?.setValue(p['uf']);
    this.onStateChange({ value: p['uf'] });

    if (p['cidade']) {
      this.form.get('Localidade')?.setValue(p['cidade']);
      this.onCityChange({ value: p['cidade'] });
    }

    if (p['bairro']) this.form.get('Bairro')?.setValue(p['bairro']);
    if (p['dia'] != null) this.form.get('DiaDaSemana')?.setValue(Number(p['dia']));
    if (p['horario']) {
      const [h, m] = p['horario'].split(':').map(Number);
      const t = new Date();
      t.setHours(h, m, 0, 0);
      this.form.get('Horario')?.setValue(t);
    }
    if (p['pagina']) this.pageIndex = Number(p['pagina']);

    this.searchFilter(false);
  }

  public onStateChange(event: any): void {
    this.selectedState = event.value;
    if (this.selectedState) {
      const cities = Object.keys(this.fullAddressData[this.selectedState]);
      this.citiesList = cities.map((city) => ({
        label: city,
        value: city,
      })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    } else {
      this.citiesList = [];
    }
    this.districtsList = [];
    this.selectedCity = "";
    this.form.get('Localidade')?.setValue(null);
    this.form.get('Bairro')?.setValue(null);
  }

  public onCityChange(event: any): void {
    this.selectedCity = event.value;
    if (this.selectedState && this.selectedCity) {
      const districts =
        this.fullAddressData[this.selectedState][this.selectedCity];
      this.districtsList = districts.map((district) => ({
        label: district,
        value: district,
      })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    } else {
      this.districtsList = [];
    }
    this.form.get('Bairro')?.setValue(null);
  }

  public searchFilter(resetPage = true): void {
    if (this.isLoading || this.form.invalid) return;

    if (resetPage) this.pageIndex = 1;

    this.isLoading = true;
    this.churchInfo = [];

    const uf = this.form.get("Uf")?.value;
    const localidade = this.form.get("Localidade")?.value;
    const bairro = this.form.get("Bairro")?.value;
    const diaDaSemana = this.form.get("DiaDaSemana")?.value;
    const horario = this._datePipe.transform(this.form.value.Horario, "HH:mm");

    this._router.navigate([], {
      queryParams: {
        uf: uf || null,
        cidade: localidade || null,
        bairro: bairro || null,
        dia: diaDaSemana ?? null,
        horario: horario || null,
        pagina: this.pageIndex,
      },
      replaceUrl: true,
    });

    const filters: FilterSearchChurch = {
      Uf: uf,
      Localidade: localidade,
      Bairro: bairro,
      DiaDaSemana: diaDaSemana,
      Horario: horario,
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
    this.searchFilter(false);
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
      if (missa.diaSemana !== undefined) {
        if (!groupedMasses[missa.diaSemana]) {
          groupedMasses[missa.diaSemana] = [];
        }
        groupedMasses[missa.diaSemana].push(missa);
      }
    });
  
    const formattedMasses: { horario: string; observacao: string }[] = [];
    for (const dayIndex in groupedMasses) {
      if (groupedMasses.hasOwnProperty(dayIndex)) {
        const day = daysOfWeek[parseInt(dayIndex, 10)];
        const massesOnDay = groupedMasses[dayIndex];
  
        const times = massesOnDay
          .map((missa) => this.formatTime(missa.horario))
          .sort((a, b) => {
            // Ordena por hora real
            const [h1, m1] = a.split(":").map(Number);
            const [h2, m2] = b.split(":").map(Number);
            return h1 - h2 || m1 - m2;
          });
  
        const horarioFormatado = `${day}: ${times.join(", ")}`;
  
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
