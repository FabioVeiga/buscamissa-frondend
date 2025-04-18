import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { CommonModule, DatePipe } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { MessageService } from "primeng/api";
import { switchMap, map, tap, catchError, finalize } from "rxjs/operators";
import { Observable, of } from "rxjs";

import {
  ChurchFormData,
  ChurchApiData,
  SocialMedia,
} from "../../models/church.model";
import { ChurchFormComponent } from "../../components/church-form/church-form.component";
import { PrimeNgModule } from "../../../../../shared/primeng.module";
import { ChurchesService } from "../../../../../core/services/churches.service";

@Component({
  selector: "app-church-edit-page",
  standalone: true,
  imports: [CommonModule, ChurchFormComponent, PrimeNgModule],
  providers: [MessageService, DatePipe],
  templateUrl: "./church-edit-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChurchEditPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private churchService = inject(ChurchesService);
  private messageService = inject(MessageService);
  private datePipe = inject(DatePipe);
  private cd = inject(ChangeDetectorRef);
  public router = inject(Router);

  isLoading = false;
  isSaving = false;
  churchDataForForm$: Observable<ChurchFormData | null> | undefined;
  churchId: number | null = null;

  typeChurchOptions = [
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

  ngOnInit(): void {
    this.churchDataForForm$ = this.route.params.pipe(
      tap((params) => {
        this.churchId = params["id"];
        this.isLoading = true;
      }),
      switchMap((params) =>
        this.churchService.searchUpdates(params["id"]).pipe(
          map((response: any) => {
            const data = response.data;
            if (data) {
              this.churchId = data.id;
              return this.mapApiDataToFormData(data);
            } else {
              this.messageService.add({
                severity: "error",
                summary: "Erro",
                detail: "Igreja não encontrada.",
              });
              return null;
            }
          }),
          catchError((error: HttpErrorResponse) => {
            this.showErrorToast(error, "Erro ao carregar dados da igreja");
            console.log(error);
            return of(null);
          }),
          finalize(() => {
            this.isLoading = false;
          })
        )
      )
    );
  }  


  handleFormSubmit(formData: ChurchFormData): void {
    if (!this.churchId) {
      this.messageService.add({
        severity: "error",
        summary: "Erro Interno",
        detail: "ID da igreja não encontrado para atualização.",
      });
      return;
    }
    this.isSaving = true;
    const payload = this.mapFormDataToApiUpdateData(formData, this.churchId);
    this.churchService.updateChurch(payload).subscribe({
      next: (response: any) => {
        this.isSaving = false;
        const controleId = response?.data?.response?.controleId;
        this.messageService.add({
          severity: "success",
          summary: "Sucesso",
          detail: "Alteração de igreja em andamento! Verifique seu e-mail para validação.",
        });
        if (controleId) {
          this.router.navigate(["/enviar-codigo", controleId]);
        } else {
          console.warn("Controle ID não recebido, navegando para a home.");
          this.router.navigate(["/"]);
        }
        this.cd.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.isSaving = false;
        this.showErrorToast(error, "Erro ao atualizar igreja");
        this.cd.markForCheck();
      },
    });
  }


  private mapApiDataToFormData(
    apiData: ChurchApiData | null
  ): ChurchFormData | null {
    if (!apiData) return null;
    let type = "";
    let name = apiData.nome;

    const formData: ChurchFormData = {
      id: apiData.id,
      nomeIgreja: name,
      nomeParoco: apiData.paroco,
      cep: apiData.endereco.cep,
      endereco: apiData.endereco.logradouro,
      numero: apiData.endereco.numero,
      complemento: apiData.endereco.complemento,
      bairro: apiData.endereco.bairro,
      cidade: apiData.endereco.localidade,
      estado: apiData.endereco.estado,
      uf: apiData.endereco.uf,
      regiao: apiData.endereco.regiao,
      missas: apiData.missasTemporaria?.map((missa) => ({
        ...missa,
        horario: missa.horario,
      })),
      imagem: apiData.imagemUrl,
    };
    return formData;
  }

  private mapFormDataToApiUpdateData(
    formData: ChurchFormData,
    id: number
  ): ChurchApiData {
    const payload: ChurchApiData = {
      id: id,
      nome: formData.nomeIgreja,
      paroco: formData.nomeParoco,
      imagem: formData.imagem,
      missas: formData.missas?.map((missa: any) => ({
        diaSemana: missa.diaSemana,
        horario:
          missa.horario instanceof Date
            ? this.datePipe.transform(missa.horario, "HH:mm:ss")!
            : "00:00:00",
        observacao: missa.observacao,
      })),
      endereco: {
        cep: formData.cep.replace(/\D/g, ""),
        logradouro: formData.endereco,
        complemento: formData.complemento,
        bairro: formData.bairro,
        localidade: formData.cidade,
        uf: formData.uf,
        estado: formData.estado,
        regiao: formData.regiao,
        numero: formData.numero,
      },
    };
    return payload;
  }

  private showErrorToast(error: HttpErrorResponse, summary: string): void {
    let detail = "Ocorreu um erro. Tente novamente.";
    if (error.error && typeof error.error === "string") {
      detail = error.error;
    } else if (error.error?.message) {
      detail = error.error.message;
    } else if (error.message) {
      detail = error.message;
    }
    if (error.error?.errors && typeof error.error.errors === "object") {
      detail = Object.values(error.error.errors).flat().join(" ");
    }
    this.messageService.add({
      severity: "error",
      summary: summary,
      detail: detail,
    });
  }

  // Navega de volta para detalhes ou lista
  cancel(): void {
    if (this.churchId) {
      this.router.navigate(["/igrejas", this.churchId]);
    } else {
      this.router.navigate(["/igrejas"]);
    }
  }
}
