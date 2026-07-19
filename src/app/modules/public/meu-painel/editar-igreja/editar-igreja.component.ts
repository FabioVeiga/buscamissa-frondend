import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MessageService } from "primeng/api";
import { SkeletonModule } from "primeng/skeleton";
import { PrimeNgModule } from "../../../../shared/primeng.module";
import { AuthService } from "../../../../core/services/auth.service";
import { ResponsavelService } from "../../../../core/services/responsavel.service";
import { LoggerService } from "../../../../core/services/logger.service";

const REDES = [
  { tipo: 1, nome: "Facebook" },
  { tipo: 2, nome: "Instagram" },
  { tipo: 3, nome: "YouTube" },
  { tipo: 4, nome: "TikTok" },
  { tipo: 5, nome: "Twitter/X" },
];

const DIAS = [
  { valor: 0, nome: "Domingo" },
  { valor: 1, nome: "Segunda-feira" },
  { valor: 2, nome: "Terça-feira" },
  { valor: 3, nome: "Quarta-feira" },
  { valor: 4, nome: "Quinta-feira" },
  { valor: 5, nome: "Sexta-feira" },
  { valor: 6, nome: "Sábado" },
];

/**
 * Edição direta (Fase 8) de contato + redes sociais + horários pelo
 * responsável verificado. Grava direto na igreja real (sem código).
 */
@Component({
  selector: "app-editar-igreja",
  imports: [PrimeNgModule, CommonModule, FormsModule, ReactiveFormsModule, RouterLink, SkeletonModule],
  providers: [MessageService],
  templateUrl: "./editar-igreja.component.html",
  styleUrl: "./editar-igreja.component.scss",
})
export class EditarIgrejaComponent implements OnInit {
  private _fb = inject(FormBuilder);
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _auth = inject(AuthService);
  private _responsavel = inject(ResponsavelService);
  private _message = inject(MessageService);
  private _logger = inject(LoggerService);

  readonly redes = REDES;
  readonly dias = DIAS;

  igrejaId!: number;
  igrejaNome = "";
  isLoading = true;
  erroCarregar = false;
  salvando = false;
  form!: FormGroup;

  get redesSociais(): FormArray {
    return this.form.get("redesSociais") as FormArray;
  }
  get missas(): FormArray {
    return this.form.get("missas") as FormArray;
  }

  ngOnInit(): void {
    if (!this._auth.estaLogado) {
      this._router.navigate(["/entrar"]);
      return;
    }
    this.igrejaId = Number(this._route.snapshot.paramMap.get("igrejaId"));
    this.form = this._fb.group({
      contato: this._fb.group({
        ddd: [""],
        telefone: [""],
        dddWhatsApp: [""],
        telefoneWhatsApp: [""],
        website: [""],
        emailContato: ["", [Validators.email]],
      }),
      redesSociais: this._fb.array([]),
      missas: this._fb.array([]),
    });
    this.carregar();
  }

  carregar(): void {
    this.isLoading = true;
    this.erroCarregar = false;
    this._responsavel.obterDados(this.igrejaId).subscribe({
      next: (dados) => {
        this.igrejaNome = dados.igrejaNome;
        this.form.get("contato")!.patchValue({
          ddd: dados.contato.ddd ?? "",
          telefone: dados.contato.telefone ?? "",
          dddWhatsApp: dados.contato.dddWhatsApp ?? "",
          telefoneWhatsApp: dados.contato.telefoneWhatsApp ?? "",
          website: dados.contato.website ?? "",
          emailContato: dados.contato.emailContato ?? "",
        });
        dados.redesSociais.forEach((r) => this.adicionarRede(r.tipoRedeSocial, r.nomeDoPerfil));
        dados.missas.forEach((m) => this.adicionarMissa(m.diaSemana, m.horario, m.observacao ?? ""));
        this.isLoading = false;
      },
      error: (error) => {
        // 403 = perdeu a permissão (ex.: capela ganhou responsável próprio)
        if (error?.status === 403) {
          this._message.add({
            severity: "warn",
            summary: "Sem permissão",
            detail: "Você não pode mais editar esta igreja.",
          });
          this._router.navigate(["/meu-painel"]);
          return;
        }
        this.erroCarregar = true;
        this.isLoading = false;
        this._logger.logError(error, "editar-igreja:carregar");
      },
    });
  }

  adicionarRede(tipo = 2, nome = ""): void {
    this.redesSociais.push(
      this._fb.group({
        tipoRedeSocial: [tipo, Validators.required],
        nomeDoPerfil: [nome, [Validators.required, Validators.maxLength(150)]],
      })
    );
  }

  removerRede(i: number): void {
    this.redesSociais.removeAt(i);
  }

  adicionarMissa(dia = 0, horario = "", observacao = ""): void {
    this.missas.push(
      this._fb.group({
        diaSemana: [dia, Validators.required],
        horario: [horario, [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)]],
        observacao: [observacao, Validators.maxLength(255)],
      })
    );
  }

  removerMissa(i: number): void {
    this.missas.removeAt(i);
  }

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this._message.add({
        severity: "warn",
        summary: "Revise o formulário",
        detail: "Há campos inválidos (verifique horários no formato HH:mm e nomes de perfil).",
      });
      return;
    }
    this.salvando = true;
    const v = this.form.value;
    this._responsavel
      .editarDados(this.igrejaId, {
        contato: {
          ddd: v.contato.ddd || null,
          telefone: v.contato.telefone || null,
          dddWhatsApp: v.contato.dddWhatsApp || null,
          telefoneWhatsApp: v.contato.telefoneWhatsApp || null,
          website: v.contato.website || null,
          emailContato: v.contato.emailContato || null,
        },
        redesSociais: v.redesSociais,
        missas: v.missas,
      })
      .subscribe({
        next: (mensagem) => {
          this._message.add({ severity: "success", summary: "Salvo", detail: mensagem });
          setTimeout(() => this._router.navigate(["/meu-painel"]), 900);
        },
        error: (error) => {
          this.salvando = false;
          this._message.add({
            severity: "error",
            summary: "Não foi possível salvar",
            detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
          });
          this._logger.logError(error, "editar-igreja:salvar");
        },
      });
  }
}
