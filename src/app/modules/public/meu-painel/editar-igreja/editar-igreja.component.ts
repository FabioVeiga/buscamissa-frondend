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
import { ChurchesService } from "../../../../core/services/churches.service";
import { LoggerService } from "../../../../core/services/logger.service";
import { MetricasIgreja, Circunscricao, CapelaComunidade, CircunscricaoOpcao, CapelaOrfa, MinhaSolicitacaoVinculo } from "../../../../core/interfaces/responsavel.interface";
import { STATES } from "../../../../core/constants/states";

const REDES = [
  { tipo: 1, nome: "Facebook" },
  { tipo: 2, nome: "Instagram" },
  { tipo: 3, nome: "YouTube" },
  { tipo: 4, nome: "TikTok" },
  { tipo: 5, nome: "Twitter/X" },
];

const TIPOS_SESSAO = [
  { valor: 1, nome: "Secretaria" },
  { valor: 2, nome: "Confissão" },
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
 * Edição direta (Fases 8 e 9) de contato + redes sociais + horários +
 * endereço + imagem pelo responsável verificado. Grava direto na igreja
 * real (sem código). Trocar cidade/UF NÃO muda a URL da página (o
 * identificador é congelado de propósito — protege SEO e links já
 * compartilhados); o formulário avisa isso ao lado dos campos de endereço.
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
  private _churches = inject(ChurchesService);
  private _message = inject(MessageService);
  private _logger = inject(LoggerService);

  readonly redes = REDES;
  readonly dias = DIAS;
  readonly estados = STATES;
  readonly tiposSessao = TIPOS_SESSAO;

  igrejaId!: number;
  igrejaNome = "";
  isLoading = true;
  erroCarregar = false;
  salvando = false;
  form!: FormGroup;

  /** Imagem nova selecionada (base64 sem prefixo) — null = mantém a atual. */
  imagemBase64: string | null = null;
  /** Preview: nova imagem (com prefixo) ou a URL atual da igreja. */
  imagemPreview: string | null = null;

  /** CEP → back preenche cidade/UF (igual /nova). Liberados só se o CEP não retornar cidade. */
  buscandoCep = false;
  cepSemCidade = false;

  /** Cards de métricas (últimos 30 dias). */
  metricas: MetricasIgreja | null = null;

  /** Diocese/arquidiocese efetiva + capelas/comunidades da paróquia. */
  circunscricao: Circunscricao | null = null;
  capelasComunidades: CapelaComunidade[] = [];

  /** Fase 3: seleção editável de diocese/arquidiocese. */
  dioceses: CircunscricaoOpcao[] = [];
  arquidioceses: CircunscricaoOpcao[] = [];
  tipoCircunscricao: "diocese" | "arquidiocese" = "diocese";
  dioceseSelecionada: number | null = null;
  arquidioceseSelecionada: number | null = null;
  salvandoCircunscricao = false;

  /** "Paroquia" | "Capela" | "Comunidade" | "Santuario" | "Outro" — decide a direção do vínculo. */
  tipoIgreja = "Paroquia";
  get ehParoquia(): boolean {
    return this.tipoIgreja === "Paroquia";
  }

  /** Fase 4: anexar/desanexar capelas/comunidades (ou, se for capela, buscar a própria paróquia). */
  buscaCapelaOrfa = "";
  resultadosCapelaOrfa: CapelaOrfa[] = [];
  buscandoCapelaOrfa = false;
  solicitandoCapelaId: number | null = null;
  minhasSolicitacoesVinculo: MinhaSolicitacaoVinculo[] = [];
  desanexandoCapelaId: number | null = null;

  /** Solicitação de cadastro de diocese/arquidiocese que não está na lista. */
  mostrarSolicitarCircunscricao = false;
  mensagemSolicitarCircunscricao = "";
  enviandoSolicitarCircunscricao = false;

  /** Cidade/UF originais — usado para exibir o aviso só quando o usuário muda. */
  private _localidadeOriginal = "";
  private _ufOriginal = "";
  private _cepOriginal = "";
  /** Flag: CEP foi alterado manualmente pelo usuário. */
  private _cepFoiAlterado = false;
  /** Preservados sem UI própria (não pedimos geolocalização manual). */
  private _latitude: number | null = null;
  private _longitude: number | null = null;

  get redesSociais(): FormArray {
    return this.form.get("redesSociais") as FormArray;
  }
  get missas(): FormArray {
    return this.form.get("missas") as FormArray;
  }
  get sessoes(): FormArray {
    return this.form.get("sessoes") as FormArray;
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
      sessoes: this._fb.array([]),
      endereco: this._fb.group({
        cep: ["", Validators.required],
        logradouro: ["", Validators.required],
        complemento: [""],
        bairro: [""],
        // Preenchidos pelo back via CEP (igual /nova); liberados só sem retorno de cidade
        localidade: [{ value: "", disabled: true }, Validators.required],
        uf: [{ value: "", disabled: true }, Validators.required],
        numero: [0],
      }),
    });
    this.carregar();
    this._responsavel.obterMetricas(this.igrejaId).subscribe({
      next: (m) => (this.metricas = m),
      error: () => {}, // cards são informativos — falha não bloqueia a edição
    });
    this._responsavel.listarDioceses().subscribe({
      next: (lista) => (this.dioceses = lista),
      error: () => {},
    });
    this._responsavel.listarArquidioceses().subscribe({
      next: (lista) => (this.arquidioceses = lista),
      error: () => {},
    });
    this._carregarMinhasSolicitacoesVinculo();
  }

  private _carregarMinhasSolicitacoesVinculo(): void {
    this._responsavel.minhasSolicitacoesVinculo().subscribe({
      next: (lista) => (this.minhasSolicitacoesVinculo = lista),
      error: () => {},
    });
  }

  /** True quando já existe solicitação pendente para esta capela (evita duplicar). */
  jaSolicitouCapela(capelaId: number): boolean {
    return this.minhasSolicitacoesVinculo.some((s) => s.capelaId === capelaId && s.status === "Pendente");
  }

  /** UF da própria igreja (form já preenchido) — restringe a busca, evita varrer a base nacional. */
  private get _uf(): string {
    return (this.form.get("endereco.uf")?.value ?? "").trim();
  }

  buscarCapelaOrfa(): void {
    if (this.buscaCapelaOrfa.trim().length < 3) {
      this.resultadosCapelaOrfa = [];
      return;
    }
    if (!this._uf) {
      this._message.add({ severity: "warn", summary: "UF não definida", detail: "Preencha o endereço da igreja antes de buscar." });
      return;
    }
    this.buscandoCapelaOrfa = true;
    const busca$ = this.ehParoquia
      ? this._responsavel.buscarCapelasOrfas(this._uf, this.buscaCapelaOrfa.trim())
      : this._responsavel.buscarParoquias(this._uf, this.buscaCapelaOrfa.trim());
    busca$.subscribe({
      next: (lista) => {
        this.resultadosCapelaOrfa = lista;
        this.buscandoCapelaOrfa = false;
      },
      error: () => {
        this.buscandoCapelaOrfa = false;
      },
    });
  }

  /** Nome da ação de busca, conforme a direção do vínculo. */
  get tituloBuscaVinculo(): string {
    return this.ehParoquia ? "Anexar capela/comunidade órfã" : "Anexar à paróquia";
  }

  solicitarVinculoCapela(alvo: CapelaOrfa): void {
    this.solicitandoCapelaId = alvo.id;
    const solicitar$ = this.ehParoquia
      ? this._responsavel.solicitarVinculoCapela(this.igrejaId, { capelaId: alvo.id })
      : this._responsavel.solicitarVinculoParoquia(this.igrejaId, { paroquiaId: alvo.id });
    solicitar$.subscribe({
      next: (mensagem) => {
        this._message.add({ severity: "success", summary: "Solicitação enviada", detail: mensagem });
        this.solicitandoCapelaId = null;
        this._carregarMinhasSolicitacoesVinculo();
      },
      error: (error) => {
        this.solicitandoCapelaId = null;
        this._message.add({
          severity: "error",
          summary: "Não foi possível solicitar",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "editar-igreja:solicitarVinculoCapela");
      },
    });
  }

  desvincularCircunscricao(): void {
    this.salvandoCircunscricao = true;
    this._responsavel.desvincularCircunscricao(this.igrejaId).subscribe({
      next: (mensagem) => {
        this._message.add({ severity: "success", summary: "Desvinculado", detail: mensagem });
        this.salvandoCircunscricao = false;
        this.dioceseSelecionada = null;
        this.arquidioceseSelecionada = null;
        this.carregar();
      },
      error: (error) => {
        this.salvandoCircunscricao = false;
        this._message.add({
          severity: "error",
          summary: "Não foi possível desvincular",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "editar-igreja:desvincularCircunscricao");
      },
    });
  }

  abrirSolicitarCircunscricao(): void {
    this.mostrarSolicitarCircunscricao = true;
    this.mensagemSolicitarCircunscricao = "";
  }

  enviarSolicitarCircunscricao(): void {
    if (!this.mensagemSolicitarCircunscricao.trim()) return;

    this.enviandoSolicitarCircunscricao = true;
    this._responsavel.solicitarCircunscricao(this.mensagemSolicitarCircunscricao.trim()).subscribe({
      next: (mensagem) => {
        this._message.add({ severity: "success", summary: "Solicitação enviada", detail: mensagem });
        this.enviandoSolicitarCircunscricao = false;
        this.mostrarSolicitarCircunscricao = false;
      },
      error: (error) => {
        this.enviandoSolicitarCircunscricao = false;
        this._message.add({
          severity: "error",
          summary: "Não foi possível enviar",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "editar-igreja:enviarSolicitarCircunscricao");
      },
    });
  }

  desanexarCapela(capela: CapelaComunidade): void {
    this.desanexandoCapelaId = capela.id;
    this._responsavel.desanexarCapela(capela.id).subscribe({
      next: (mensagem) => {
        this._message.add({ severity: "success", summary: "Desanexada", detail: mensagem });
        this.desanexandoCapelaId = null;
        this.capelasComunidades = this.capelasComunidades.filter((c) => c.id !== capela.id);
      },
      error: (error) => {
        this.desanexandoCapelaId = null;
        this._message.add({
          severity: "error",
          summary: "Não foi possível desanexar",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "editar-igreja:desanexarCapela");
      },
    });
  }

  salvarCircunscricao(): void {
    const dioceseId = this.tipoCircunscricao === "diocese" ? this.dioceseSelecionada : null;
    const arquidioceseId = this.tipoCircunscricao === "arquidiocese" ? this.arquidioceseSelecionada : null;

    if (!dioceseId && !arquidioceseId) {
      this._message.add({ severity: "warn", summary: "Selecione uma opção", detail: "Escolha uma diocese ou arquidiocese." });
      return;
    }

    this.salvandoCircunscricao = true;
    this._responsavel.atualizarCircunscricao(this.igrejaId, { dioceseId, arquidioceseId }).subscribe({
      next: (mensagem) => {
        this._message.add({ severity: "success", summary: "Salvo", detail: mensagem });
        this.salvandoCircunscricao = false;
        this.carregar();
      },
      error: (error) => {
        this.salvandoCircunscricao = false;
        this._message.add({
          severity: "error",
          summary: "Não foi possível salvar",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "editar-igreja:salvarCircunscricao");
      },
    });
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
        dados.sessoes.forEach((se) =>
          this.adicionarSessao(se.tipo, se.diaSemana, se.horarioInicio, se.horarioFim, se.observacao ?? ""));

        this.form.get("endereco")!.patchValue({
          cep: dados.endereco.cep ?? "",
          logradouro: dados.endereco.logradouro ?? "",
          complemento: dados.endereco.complemento ?? "",
          bairro: dados.endereco.bairro ?? "",
          localidade: dados.endereco.localidade ?? "",
          uf: dados.endereco.uf ?? "",
          numero: dados.endereco.numero ?? 0,
        });
        this._localidadeOriginal = dados.endereco.localidade ?? "";
        this._ufOriginal = dados.endereco.uf ?? "";
        this._cepOriginal = dados.endereco.cep ?? "";
        this._cepFoiAlterado = false;
        this.form.get("endereco")?.markAsPristine();
        this._latitude = dados.endereco.latitude ?? null;
        this._longitude = dados.endereco.longitude ?? null;
        this.imagemPreview = dados.imagemUrl ?? null;
        this.circunscricao = dados.circunscricao;
        this.capelasComunidades = dados.capelasComunidades ?? [];
        this.tipoIgreja = dados.tipoIgreja ?? "Paroquia";

        if (dados.circunscricao?.dioceseId) {
          this.tipoCircunscricao = "diocese";
          this.dioceseSelecionada = dados.circunscricao.dioceseId;
        } else if (dados.circunscricao?.arquidioceseId) {
          this.tipoCircunscricao = "arquidiocese";
          this.arquidioceseSelecionada = dados.circunscricao.arquidioceseId;
        }

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

  adicionarSessao(tipo = 1, dia = 1, horarioInicio = "", horarioFim = "", observacao = ""): void {
    const horaValida = Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/);
    this.sessoes.push(
      this._fb.group({
        tipo: [tipo, Validators.required],
        diaSemana: [dia, Validators.required],
        horarioInicio: [horarioInicio, [Validators.required, horaValida]],
        horarioFim: [horarioFim, [Validators.required, horaValida]],
        observacao: [observacao, Validators.maxLength(50)],
      })
    );
  }

  removerSessao(i: number): void {
    this.sessoes.removeAt(i);
  }

  /** Consulta o CEP no back (igual /nova): preenche logradouro/bairro e trava cidade/UF. */
  buscarCep(): void {
    const cep: string = (this.form.get("endereco.cep")?.value ?? "").replace(/\D/g, "");
    if (cep.length !== 8) return;

    // Detecta se o CEP foi alterado manualmente
    const cepMudou = cep !== this._cepOriginal;
    if (cepMudou) {
      this._cepFoiAlterado = true;
    }

    this.buscandoCep = true;
    this._churches.consultarCep(cep, this.igrejaId).subscribe({
      next: (res) => {
        this.buscandoCep = false;
        const e = res?.data?.endereco;
        if (!e || (e as any).erro || !e.localidade) {
          // Sem cidade do back: libera digitação manual (caso raro)
          this.cepSemCidade = true;
          this.form.get("endereco.localidade")?.enable();
          this.form.get("endereco.uf")?.enable();
          return;
        }
        this.cepSemCidade = false;
        this.form.get("endereco.localidade")?.disable();
        this.form.get("endereco.uf")?.disable();
        this.form.get("endereco")!.patchValue({
          localidade: e.localidade,
          uf: e.uf,
          logradouro: e.logradouro || this.form.get("endereco.logradouro")?.value,
          bairro: e.bairro || this.form.get("endereco.bairro")?.value,
        });
        // NÃO atualiza valores originais - só atualiza se o CEP foi alterado
        // Isso permite que o aviso apareça se a cidade/UF forem diferentes
      },
      error: () => {
        this.buscandoCep = false;
        this._logger.logError(new Error("consultar-cep falhou"), "editar-igreja:cep");
      },
    });
  }

  /** True quando cidade/UF mudou em relação ao carregado — dispara o aviso de URL. */
  get cidadeOuUfMudou(): boolean {
    // SÓ mostra se o CEP foi alterado manualmente
    if (!this._cepFoiAlterado) return false;

    const e = this.form.get("endereco")!.value;
    const localidadeAtual = (e.localidade || "").trim();
    const ufAtual = (e.uf || "").trim();

    // Comparação com valores originais: mostra se mudou
    const localidadeMudou = localidadeAtual !== this._localidadeOriginal.trim();
    const ufMudou = ufAtual !== this._ufOriginal.trim();

    return localidadeMudou || ufMudou;
  }

  selecionarImagem(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      this._message.add({ severity: "warn", summary: "Arquivo inválido", detail: "Selecione uma imagem." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this._message.add({ severity: "warn", summary: "Arquivo muito grande", detail: "Máximo de 5MB." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      this.imagemBase64 = base64.split(",")[1];
      this.imagemPreview = base64;
    };
    reader.readAsDataURL(file);
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
    const v = this.form.getRawValue();
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
        endereco: {
          cep: v.endereco.cep,
          logradouro: v.endereco.logradouro,
          complemento: v.endereco.complemento || null,
          bairro: v.endereco.bairro || null,
          localidade: v.endereco.localidade,
          uf: v.endereco.uf,
          numero: v.endereco.numero || 0,
          latitude: this._latitude,
          longitude: this._longitude,
        },
        imagem: this.imagemBase64 ? { base64: this.imagemBase64 } : null,
        sessoes: v.sessoes,
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
