import { Component, inject, OnInit } from "@angular/core";
import { PrimeNgModule } from "../../../shared/primeng.module";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { RequestService } from "../../../core/services/request.service";
import { NgIf } from "@angular/common";
import { MessageService } from "primeng/api";

@Component({
  selector: "app-request",
  imports: [PrimeNgModule, FormsModule, ReactiveFormsModule, NgIf],
  providers: [MessageService],
  templateUrl: "./request.component.html",
  styleUrl: "./request.component.scss",
})
export class RequestComponent implements OnInit {
  private readonly _service = inject(RequestService);
  private _message = inject(MessageService);
  private _fb = inject(FormBuilder);
  public isLoading = false;
  public form!: FormGroup;
  public tipos: any[] = [];

  ngOnInit(): void {
    this.initForm();
    this.getSubject();
  }

  private initForm(): void {
    this.form = this._fb.group({
      tipo: [null, Validators.required],
      assunto: ["", Validators.required],
      mensagem: ["", Validators.required],
      nomeSolicitante: ["", Validators.required],
      emailSolicitante: ["", Validators.required, Validators.email],
    });
  }

  getSubject() {
    this._service.getSubject().subscribe({
      next: (res) => {
        this.tipos = res;
      },
    });
  }

  sendSubject() {
    this._service.sendRequest(this.form.value).subscribe({
      next: (res) => {
        this.isLoading = true;
        if (res.data.numeroSolicitacao) {
          this._message.add({
            severity: "success",
            summary: "Sucesso",
            detail: "Solicitação enviada com sucesso.",
          });
          this.form.reset();
        }
      },
      error: (error) => {
        this._message.add({
          severity: "error",
          summary: "Erro",
          detail: "Não foi possível enviar uma solicitação.",
        });
        console.error(error);
      },
      complete: () => {
        this.isLoading = false;
      },
    });
  }
}
