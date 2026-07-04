import { Component, EventEmitter, inject, Input, OnInit, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ConfidenceBadgeComponent } from "../confidence-badge/confidence-badge.component";
import { ChurchPlaceholderComponent } from "../church-placeholder/church-placeholder.component";
import { FavoritesService } from "../../../core/services/favorites.service";
import {
  getNextOccurrenceMinutes,
  formatMassTime,
  getCountdownLabel,
} from "../../utils/mass-time.utils";
import { distanciaMetrosAte } from "../../utils/distance.utils";

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
    return ["/paroquia", this.ufResolved, this.cidadeResolved, this.igreja.slug];
  }

  // ── Próxima missa ───────────────────────────────────────────────────────────

  proximaMissa(): any | null {
    const candidatas: any[] = this.igreja?.missas ?? [];
    if (!candidatas.length) return null;
    return candidatas.reduce((melhor: any, m: any) => {
      const min = getNextOccurrenceMinutes(m.diaSemana, m.horario);
      const melhorMin = getNextOccurrenceMinutes(melhor.diaSemana, melhor.horario);
      return min < melhorMin ? m : melhor;
    });
  }

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }

  countdownLabel(m: any): string {
    return getCountdownLabel(m.diaSemana, m.horario);
  }

  ehUrgente(m: any): boolean {
    return getNextOccurrenceMinutes(m.diaSemana, m.horario) <= 180;
  }

  private diaNome(dia: number): string {
    return ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][dia] ?? "";
  }

  diaLabelRelativo(m: any): string {
    const min = getNextOccurrenceMinutes(m.diaSemana, m.horario);
    const alvo = new Date(Date.now() + min * 60_000);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dAlvo = new Date(alvo); dAlvo.setHours(0, 0, 0, 0);
    const diff = Math.round((dAlvo.getTime() - hoje.getTime()) / 86_400_000);
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanhã";
    return this.diaNome(m.diaSemana);
  }

  diasMissa(): string {
    const missas: any[] = this.igreja?.missas ?? [];
    if (!missas.length) return '';
    const dias = [...new Set(missas.map((m: any) => m.diaSemana as number))]
      .sort((a, b) => a - b);
    return dias.map(d => this.diaNome(d)).join(', ');
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

    const pm = this.proximaMissa() ?? this.igreja?.missas?.[0] ?? null;
    this.favorita = this.favorites.alternar({
      id: this.igreja.id,
      nome: this.igreja.nome,
      uf: this.ufResolved,
      cidadeSlug: this.cidadeResolved,
      slug: this.igreja.slug,
      diaSemana: pm?.diaSemana,
      horario: pm?.horario,
    });
    this.favoriteToggled.emit(this.igreja);
  }
}
