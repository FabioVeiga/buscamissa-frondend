import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable, shareReplay } from "rxjs";
import { FilterSearchChurch } from "../interfaces/church.interface";

@Injectable({
  providedIn: "root",
})
export class ChurchesService {
  private http = inject(HttpClient);

  /** Caches de dados quase estáticos — compartilhados entre telas (3.D) */
  private addressRange$?: Observable<any>;
  private info$?: Observable<any>;

  /** Cria uma nova igreja */
  newChurch(church: unknown) {
    return this.http.post(`v1/Igreja`, church);
  }

  /** Atualiza os dados de uma igreja existente */
  updateChurch(church: unknown) {
    return this.http.put(`v1/Igreja`, church);
  }

  /** Gera código para criar ou editar igreja */
  generateCode(body: unknown) {
    return this.http.post(`v1/Usuario/gerar-codigo-validador`, body);
  }

  /** Valida código da igreja */
  validateCode(body: unknown) {
    return this.http.post(`v1/CodigoValidador/validar-igreja`, body);
  }

  /** Obtém o desafio matemático de validação (feature validacaoSemEmail) */
  getDesafio(controleId: number) {
    return this.http.get(`v1/CodigoValidador/desafio/${controleId}`);
  }

  /** Valida a contribuição respondendo o desafio (feature validacaoSemEmail) */
  validateDesafio(body: any) {
    return this.http.post(`v1/CodigoValidador/validar-igreja-desafio`, body);
  }

  /** Busca igrejas próximas pelo CEP */
  searchByCEP(cep: string) {
    return this.http.get(`v1/Igreja/buscar-por-cep?cep=${cep}`);
  }

  /** Busca igrejas pelo CEP (v2) — retorna dadosEndereco com localidade e uf */
  searchByCEPv2(cep: string) {
    return this.http.get<{
      data: {
        nomeUnico: string;
        slug?: string;
        cidadeSlug?: string;
        dadosEndereco: { localidade: string; uf: string };
      }[];
    }>(`v2/Igreja/buscar-por-cep/${cep}`);
  }

  /** Busca cidades e bairros através da UF, Localidade e Bairro */
  public addressRange(): Observable<any> {
    this.addressRange$ ??= this.http
      .get<any>("v1/Igreja/v2/obter-enderecos")
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.addressRange$;
  }

  /** Busca igrejas filtradas pelos parâmetros informados */
  searchByFilters(filters: FilterSearchChurch) {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params = params.append(key, value.toString());
      }
    });
    return this.http.get(`v1/Igreja/buscar-por-filtro`, { params });
  }

  /** Busca atualizações de uma igreja específica */
  searchUpdates(churchId: number) {
    return this.http.get(`v1/Igreja/buscar-por-atualizacoes/${churchId}`);
  }

  reportarProblema(churchId: number, body: { nome: string; email: string; descricao: string }) {
    return this.http.post(`v1/Igreja/reportar-problema/${churchId}`, body);
  }

  proximasMissas(lat?: number | null, lng?: number | null, raioKm = 10): Observable<any> {
    let params = new HttpParams().append('RaioKm', raioKm).append('Horas', 2);
    if (lat != null && lng != null) {
      params = params.append('Lat', lat).append('Lng', lng);
    }
    return this.http.get('v2/Igreja/proximas-missas', { params });
  }

  /** Busca cidades próximas (até 100km de raio) para mostrar no grid */
  cidadesProximas(lat: number, lng: number): Observable<any> {
    return this.http.get('v2/Igreja/proximas-missas', {
      params: new HttpParams()
        .append('Lat', lat)
        .append('Lng', lng)
        .append('RaioKm', 100)
        .append('Horas', 2)
    });
  }

  getInfo() {
    this.info$ ??= this.http
      .get(`v1/Igreja/infos`)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.info$;
  }

  /** Busca paróquia pelo slug (nomeUnico) — endpoint público v2 (legado) */
  getByNomeUnico(nomeUnico: string) {
    return this.http.get(`v2/Igreja/${nomeUnico}`);
  }

  /** Lista paróquias de uma cidade — página /missas/{uf}/{cidade} */
  getByCidade(uf: string, cidade: string) {
    return this.http.get(`v2/Igreja/cidade/${uf}/${cidade}`);
  }

  /** Busca paróquia pela URL canônica /paroquia/{uf}/{cidade}/{slug} */
  getByCidadeESlug(uf: string, cidade: string, slug: string) {
    return this.http.get(`v2/Igreja/paroquia/${uf}/${cidade}/${slug}`);
  }

  // ── Confiabilidade de Horários ─────────────────────────────────────────────

  /** Confirma que os horários de uma paróquia estão corretos */
  confirmarHorarios(igrejaId: number) {
    return this.http.post(`v2/Confiabilidade/${igrejaId}/confirmar`, {
      fingerprint: this.gerarFingerprint()
    });
  }

  /** Resumo de prova social: total de confirmações + última confirmação */
  getResumoConfirmacoes(igrejaId: number) {
    return this.http.get(`v2/Confiabilidade/${igrejaId}/resumo`);
  }

  /** Gera fingerprint a partir de características do browser */
  gerarFingerprint(): string {
    const data = [
      navigator.userAgent,
      navigator.language,
      screen.width.toString(),
      screen.height.toString(),
      new Date().getTimezoneOffset().toString(),
      navigator.hardwareConcurrency?.toString() ?? ''
    ].join('|');
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0') + Date.now().toString(36);
  }
}
