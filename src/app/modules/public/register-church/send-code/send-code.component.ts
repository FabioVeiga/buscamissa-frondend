import { CommonModule } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { ChurchesService } from "../../../../core/services/churches.service";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MessageService } from "primeng/api";
import { PrimeNgModule } from "../../../../shared/primeng.module";
import { LoadingComponent } from "../../../../core/components/loading/loading.component";

@Component({
  selector: "app-send-code",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PrimeNgModule,
    LoadingComponent
  ],
  providers: [MessageService],
  templateUrl: "./send-code.component.html",
  styleUrl: "./send-code.component.scss",
})
export class SendCodeComponent implements OnInit {
  private _fb = inject(FormBuilder);
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _service = inject(ChurchesService);
  private _toast = inject(MessageService);

  isLoading = false;
  controleId!: number;
  form!: FormGroup;
  showPromocaoModal = false;
  showTermosModal = false;

  ngOnInit(): void {
    this.controleId = Number(this._route.snapshot.paramMap.get("controleId"));
    this.form = this._fb.group({
      nome: ["", Validators.required],
      email: ["", [Validators.required, Validators.email]],
      aceitarTermo: [false, Validators.requiredTrue],
      aceitarPromocao: [false],
    });
  }

  generateValidationCode(): void {
    this.isLoading = true;
    if (this.form.invalid) {
      this._toast.add({ severity: 'info', summary: 'Aviso!', detail: "Por favor, preencha todos os campos obrigatórios." });
      return;
    }
    const body = {
      nome: this.form.value.nome,
      email: this.form.value.email,
      controleId: this.controleId,
      aceitarTermo: this.form.value.aceitarTermo,
      aceitarPromocao: this.form.value.aceitarPromocao,
    };
    this._service.generateCode(body).subscribe({
      next: (response: any) => {
        if (response?.data?.mensagemTela) {
          this._router.navigate(["/validar"], {
            queryParams: {
              email: body.email,
              controleId: body.controleId,
            },
          });
          console.log('Enviando para /validar com:', {
            email: body.email,
            controleId: body.controleId,
          });
        } else {
          this.isLoading = false;
          this._toast.add({ severity: 'error', summary: 'Aviso!', detail: response?.data?.mensagemTela });
        }
      },
      error: (error: any) => {
        this.isLoading = false;
        this._toast.add({ severity: 'error', summary: 'Aviso!', detail: error.error.data.mensagemTela ?? error.error.data.mensagemInterno });
        console.log("Erro ao gerar código", error);
      },
    });
  }

  openPromocaoModal(event: Event) {
    event.preventDefault(); // Prevent default link behavior
    this.showPromocaoModal = true;
  }

  aceitarPromocao() {
    this.form.get('aceitarPromocao')?.setValue(true);
    this.showPromocaoModal = false;
  }

  openTermosModal(event: Event) {
    event.preventDefault(); // Prevent default link behavior
    this.showTermosModal = true;
  }

  aceitarTermos() {
    this.form.get('aceitarTermo')?.setValue(true);
    this.showTermosModal = false;
  }
}
