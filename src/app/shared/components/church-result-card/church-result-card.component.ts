import { Component, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ConfidenceBadgeComponent } from "../confidence-badge/confidence-badge.component";
import { ChurchPlaceholderComponent } from "../church-placeholder/church-placeholder.component";
import {
  getNextOccurrenceMinutes,
  formatMassTime,
  getCountdownLabel,
} from "../../utils/mass-time.utils";

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
    const pm = this.proximaMissa();
    return pm ? this.diaNome(pm.diaSemana) : "";
  }

  // ── Distância ───────────────────────────────────────────────────────────────

  distanciaMetros(): number | null {
    if (this.userLat === null || this.userLng === null) return null;
    const lat2 = this.igreja?.endereco?.latitude;
    const lng2 = this.igreja?.endereco?.longitude;
    if (!lat2 || !lng2) return null;
    return this.haversine(this.userLat, this.userLng, lat2, lng2);
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    try {
      const arr = JSON.parse(localStorage.getItem("buscamissa_favoritas") || "[]");
      this.favorita = Array.isArray(arr) && arr.some((f: any) => f.id === this.igreja?.id);
    } catch { this.favorita = false; }
  }

  toggleFavoritar(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    let favoritas: any[] = [];
    try { favoritas = JSON.parse(localStorage.getItem("buscamissa_favoritas") || "[]"); } catch { }
    if (!Array.isArray(favoritas)) favoritas = [];

    if (this.favorita) {
      favoritas = favoritas.filter((f) => f.id !== this.igreja.id);
      this.favorita = false;
    } else {
      const pm = this.proximaMissa() ?? this.igreja?.missas?.[0] ?? null;
      favoritas.push({
        id: this.igreja.id,
        nome: this.igreja.nome,
        uf: this.ufResolved,
        cidadeSlug: this.cidadeResolved,
        slug: this.igreja.slug,
        diaSemana: pm?.diaSemana,
        horario: pm?.horario,
      });
      this.favorita = true;
    }
    localStorage.setItem("buscamissa_favoritas", JSON.stringify(favoritas));
    this.favoriteToggled.emit(this.igreja);
  }
}
