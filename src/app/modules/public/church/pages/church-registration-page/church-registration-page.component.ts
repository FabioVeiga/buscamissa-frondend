import {
  Component,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  AfterViewInit,
} from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { CommonModule, DatePipe } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { ConfirmationService, MessageService } from "primeng/api";

import {
  ChurchFormData,
  ChurchApiData,
} from "../../models/church.model";
import { ChurchFormComponent } from "../../components/church-form/church-form.component";
import { PrimeNgModule } from "../../../../../shared/primeng.module";
import { ChurchesService } from "../../../../../core/services/churches.service";
import { ClarityService } from "../../../../../core/services/clarity.service";
import { RedesSociaisService, TipoRedeSocial } from "../../../../../core/services/redes-sociais.service";
import { LoggerService } from "../../../../../core/services/logger.service";

@Component({
  selector: "app-church-registration-page",
  standalone: true,
  imports: [CommonModule, RouterLink, ChurchFormComponent, PrimeNgModule],
  providers: [MessageService, DatePipe, ConfirmationService],
  templateUrl: "./church-registration-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChurchRegistrationPageComponent implements AfterViewInit {
  @ViewChild(ChurchFormComponent) churchFormComponent!: ChurchFormComponent;

  private churchService = inject(ChurchesService);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private datePipe = inject(DatePipe);
  private cd = inject(ChangeDetectorRef);
  private _clarity = inject(ClarityService);
  private redesSociaisService = inject(RedesSociaisService);
  private logger = inject(LoggerService);

  private tiposRedeSocial: TipoRedeSocial[] = [];
  isLoading = false;
  isCepLoading = false;

  ngAfterViewInit(): void {
    this.redesSociaisService.obterTipos().subscribe((tipos) => (this.tiposRedeSocial = tipos));
    this.cd.detectChanges();
    this._clarity.track('contrib_form_aberto');
  }

  // Lida com a submissão vinda do form filho
  handleFormSubmit(formData: ChurchFormData): void {
    this.isLoading = true;
    const payload = this.mapFormDataToApiData(formData);

    this.churchService.newChurch(payload).subscribe({
      next: (response: any) => {
        // Tipar a resposta da API idealmente
        this.isLoading = false;
        const controleId = response?.data?.response?.controleId; // Ajuste conforme sua API
        this.messageService.add({
          severity: "success",
          summary: "Sucesso",
          detail: "Cadastro iniciado! Verifique seu e-mail para validação.",
        });
        if (controleId) {
          // Navega para a página de validação
          this.router.navigate(["/enviar-codigo", controleId]); // Ajuste a rota se necessário
        } else {
          this.logger.logWarning("Controle ID não recebido, navegando para a home.", "church-registration");
          this.router.navigate(["/"]); // Fallback
        }
        this.cd.markForCheck(); // Atualiza view
      },
      error: (error: HttpErrorResponse) => {
        this.logger.logError(error, "church-registration:cadastrar");
        this.isLoading = false;
        this.showErrorToast(error, "Erro ao cadastrar igreja");
        this.cd.markForCheck(); // Atualiza view
      },
    });
  }

  // Lida com a busca de CEP vinda do form filho
  handleCepLookup(cep: string): void {
    if (!this.churchFormComponent) return;
    this.isCepLoading = true;
    this.cd.markForCheck();
    this.churchService.searchByCEP(cep).subscribe({
      next: (response: any) => {
        this.isCepLoading = false;
        // Se encontrou uma IGREJA existente (inesperado no cadastro, mas tratar)
        if (response?.data?.response?.id) {

          this.confirmationService.confirm({
            header: "Igreja já cadastrada",
            message:
              "Já existe uma igreja com este CEP. Deseja editar o cadastro existente?",
            icon: "pi pi-exclamation-triangle",
            acceptLabel: "Sim",
            rejectLabel: "Não",
            accept: () => {
              this.router.navigate(["/editar", response?.data?.response?.id]);
            },
            reject: () => {
              this.churchFormComponent.form.reset(); // limpa o formulário
              this.churchFormComponent.updateAddressFieldsState(false); // reabilita os campos
              this.cd.markForCheck();
            },
          });
        }
        this.cd.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.isCepLoading = false;
        // Tratamento específico para 404 que RETORNA endereço (como no seu código original)
        if (error.status === 404 && error.error?.data?.endereco) {
          const address = error.error.data.endereco;
          const isAddressEmpty = Object.values(address).every(
            (v) => v === null || v === undefined || v === ""
          );

          if (isAddressEmpty) {
            this.messageService.add({
              severity: "error",
              summary: "Erro",
              detail: "CEP não encontrado.",
            });
            this.churchFormComponent?.form
              .get("cep")
              ?.setErrors({ notFound: true });
          } else {
            this.messageService.add({
              severity: "info",
              summary: "Endereço Encontrado",
              detail: "Endereço preenchido automaticamente.",
            });
            this.cd.detectChanges();
            // Trava só o que veio preenchido; campos vazios ficam liberados e
            // cidade/UF ausentes viram seleção padronizada (ver ChurchFormComponent).
            this.churchFormComponent?.applyCepAddress(address);
            setTimeout(() => document.getElementById("numero")?.focus(), 0);
          }
        } else {
          // Outro erro na busca de CEP
          this.showErrorToast(error, "Erro ao buscar CEP");
        }
        this.cd.markForCheck();
      },
    });
  }

  // Mapeia os dados do formulário para o formato esperado pela API de CRIAÇÃO
  private mapFormDataToApiData(
    formData: ChurchFormData
  ): Omit<ChurchApiData, "id"> {
    const telefoneLimpo = formData.telefone?.replace(/\D/g, "") ?? "";
    const whatsappLimpo = formData.whatsapp?.replace(/\D/g, "") ?? "";

    const payload: Omit<ChurchApiData, "id"> = {
      nome: `${formData.typeChurchValue} ${formData.nomeIgreja}`,
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
      contato: {
        ddd: telefoneLimpo.substring(0, 2),
        telefone: telefoneLimpo.substring(2),
        dddWhatsApp: whatsappLimpo.substring(0, 2),
        telefoneWhatsApp: whatsappLimpo.substring(2),
        emailContato: formData.emailContato,
      },
      redesSociais: this._mapearRedesSociais(formData),
    };
    return payload;
  }

  private _mapearRedesSociais(formData: any) {
    return this.tiposRedeSocial
      .map((tipo) => ({
        tipoRedeSocial: tipo.id,
        nomeRedeSocial: (formData[tipo.nome.toLowerCase()] as string) ?? "",
      }))
      .filter(({ nomeRedeSocial }) => !!nomeRedeSocial.trim());
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

  cancel(): void {
    this._clarity.track('contrib_cancelado');
    this.router.navigate(["/"]);
  }
}
