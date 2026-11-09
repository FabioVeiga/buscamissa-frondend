import { Component, EventEmitter, inject, Input, OnInit, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ConfidenceBadgeComponent } from "../confidence-badge/confidence-badge.component";
import { ChurchPlaceholderComponent } from "../church-placeholder/church-placeholder.component";
import { FavoritesService } from "../../../core/services/favorites.service";
import { MetricasService } from "../../../core/services/metricas.service";
import { formatMassTime } from "../../utils/mass-time.utils";
import {
  diasSemanaisDeMissa,
  formatarOutrosHorarios,
  ProximaMissaCard,
  rotuloContagem,
  rotuloDataMissa,
  rotuloDiaMissa,
} from "../../utils/proxima-missa-card.utils";
import { distanciaMetrosAte } from "../../utils/distance.utils";
import { linkParoquia } from "../../utils/church-link.utils";

/**
 * Card de igreja reutilizável (resultado de busca / página de cidade).
 * Encapsula horário da próxima missa, thumbnail, distância, favoritar e CTAs.
 * O shape de `igreja` é o mesmo retornado por `v2/Igreja/cidade` e por
 * `v1/Igreja/buscar-por-filtro` (id, nome, slug, imagemUrl, endereco{bairro,
 * latitude, longitude, uf, cidadeSlug}, missas[{diaSemana, horario}]).
 */
@Component({
  selector: "app-church-result-card",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ConfidenceBadgeComponent,
    ChurchPlaceholderComponent,
  ],
  templateUrl: "./church-result-card.component.html",
  styleUrl: "./church-result-card.component.scss",
})
export class ChurchResultCardComponent implements OnInit {
  @Input({ required: true }) igreja: any;

  /** Calculada pela tela, para o card e a ordenação usarem o mesmo resultado. */
  @Input({ required: true }) proxima!: ProximaMissaCard;
  @Input({ required: true }) agora!: Date;

  /** UF/cidade-slug para montar o link da paróquia. Se ausentes, derivados do endereço. */
  @Input() uf = "";
  @Input() cidade = "";
  @Input() cidadeNome = "";

  /** Geolocalização do usuário para exibir distância (opcional). */
  @Input() userLat: number | null = null;
  @Input() userLng: number | null = null;

  /** Destaca o card como "melhor opção". */
  @Input() destaque = false;
  @Input() showBadgeDestaque = false;

  @Output() churchClick = new EventEmitter<any>();
  @Output() favoriteToggled = new EventEmitter<any>();

  private favorites = inject(FavoritesService);
  private metricas = inject(MetricasService);

  imagemQuebrada = false;
  favorita = false;

  ngOnInit(): void {
    this._syncFavorita();
  }

  // ── Helpers de contexto ─────────────────────────────────────────────────────

  private get ufResolved(): string {
    return (this.uf || this.igreja?.endereco?.uf || "").toLowerCase();
  }

  private get cidadeResolved(): string {
    return this.cidade || this.igreja?.endereco?.cidadeSlug || "";
  }

  get ufLabel(): string {
    return (this.uf || this.igreja?.endereco?.uf || "").toUpperCase();
  }

  linkParoquia(): string[] {
    return linkParoquia({
      ...this.igreja,
      endereco: { ...this.igreja?.endereco, uf: this.ufResolved, cidadeSlug: this.cidadeResolved },
    });
  }

  // ── Próxima missa ───────────────────────────────────────────────────────────

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }

  get diaLabel(): string {
    return this.proxima.inicio ? rotuloDiaMissa(this.proxima.inicio, this.agora) : "";
  }

  get dataLabel(): string {
    return this.proxima.inicio ? rotuloDataMissa(this.proxima.inicio, this.agora) : "";
  }

  get outrosHorarios(): string {
    return formatarOutrosHorarios(this.proxima.outrosHorarios);
  }

  get ehHoje(): boolean {
    return this.diaLabel.startsWith("Hoje");
  }

  get contagem(): string {
    return this.proxima.inicio ? rotuloContagem(this.proxima.inicio, this.agora) : "";
  }

  get textoSemHorario(): string {
    return this.proxima.estado === "sem-horarios"
      ? "Horários não informados"
      : "Não há próxima missa futura informada";
  }

  private diaNome(dia: number): string {
    return ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][dia] ?? "";
  }

  /** Só dias de missa semanal; some quando repetiria o único dia já mostrado no horário. */
  diasMissa(): string {
    const dias = diasSemanaisDeMissa(this.igreja?.missas ?? []);
    if (dias.length === 1 && this.proxima.inicio?.getDay() === dias[0]) return "";
    return dias.map(d => this.diaNome(d)).join(", ");
  }

  // ── Distância ───────────────────────────────────────────────────────────────

  distanciaMetros(): number | null {
    return distanciaMetrosAte(
      this.userLat,
      this.userLng,
      this.igreja?.endereco?.latitude,
      this.igreja?.endereco?.longitude
    );
  }

  // ── Ações ───────────────────────────────────────────────────────────────────

  onClick(): void {
    this.churchClick.emit(this.igreja);
  }

  comoChegar(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const lat = this.igreja?.endereco?.latitude;
    const lng = this.igreja?.endereco?.longitude;
    const url = lat && lng
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(this.igreja.nome + " " + this.cidadeNome)}`;
    window.open(url, "_blank", "noopener");
  }

  // ── Favoritar ─────────────────────────────────────────────────────────────

  private _syncFavorita(): void {
    this.favorita = this.igreja?.id != null && this.favorites.isFavorita(this.igreja.id);
  }

  toggleFavoritar(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const pm = this.proxima.missa ?? this.igreja?.missas?.[0] ?? null;
    this.favorita = this.favorites.alternar({
      id: this.igreja.id,
      nome: this.igreja.nome,
      uf: this.ufResolved,
      cidadeSlug: this.cidadeResolved,
      slug: this.igreja.slug,
      nomeUnico: this.igreja.nomeUnico,
      diaSemana: pm?.diaSemana,
      horario: pm?.horario,
    });
    if (this.favorita) {
      this.metricas.registrarFavorito(this.igreja.id);
    }
    this.favoriteToggled.emit(this.igreja);
  }
}
