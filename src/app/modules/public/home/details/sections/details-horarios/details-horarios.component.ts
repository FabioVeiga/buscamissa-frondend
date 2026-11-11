import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { Mass } from '../../../../church/models/church.model';
import { formatMassTime } from '../../../../../../shared/utils/mass-time.utils';
import {
  chaveData,
  descrever,
  ehDataEspecifica,
  ehSemanal,
  formatarData,
  ocorreEm,
  rotuloNaData,
} from '../../../../../../shared/utils/recorrencia-missa';

/** Missa na grade semanal; `rotuloNaSemana` marca a mensal que cai nesta semana ("dia 2", "1ª sexta do mês"). */
interface MissaNaGrade extends Mass {
  rotuloNaSemana?: string;
}

/** Um dia especial (Natal, Missa do Galo...) com os horários que ainda vão acontecer. */
interface DataEspecial {
  data: string;
  diaSemana: string;
  dataCurta: string;
  nome: string;
  substitui: boolean;
  missas: { horario: string; texto: string }[];
}

/** Agenda semanal de horários da paróquia (extraído do DetailsComponent — auditoria 2.x). */
@Component({
  selector: 'app-details-horarios',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './details-horarios.component.html',
  styleUrls: ['./details-horarios.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsHorariosComponent {
  @Input({ required: true }) missas: Mass[] = [];
  /** Falso quando a igreja tem responsável verificado: só ele edita os horários. */
  @Input() podeSugerir = true;

  @Output() adicionarHorarios = new EventEmitter<void>();

  // Os getters abaixo montam objetos novos a cada leitura: sem trackBy o *ngFor
  // destrói e recria os nós, que perdem o id encurtado do HTML pré-renderizado.
  trackDia = (_: number, g: { dia: number }) => g.dia;
  trackMissa = (_: number, m: MissaNaGrade) =>
    [m.diaSemana, m.horario, m.tipoRecorrencia, m.diaDoMes, m.rotuloNaSemana].join('|');
  trackDiaFixo = (_: number, m: { descricao: string }) => m.descricao;
  trackNota = (_: number, n: { chave: string }) => n.chave;

  /** Só os dias que têm missa — a grade fica compacta e com linhas da mesma altura. */
  get diasComMissa(): { dia: number; label: string; missas: MissaNaGrade[] }[] {
    return this.agendaSemana.filter((g) => g.missas.length);
  }

  /** "Segunda, Terça e Sábado" — dias sem nenhuma missa, numa linha só. */
  get diasSemMissa(): string {
    const dias = this.agendaSemana.filter((g) => !g.missas.length).map((g) => g.label);
    if (dias.length <= 1) return dias.join('');
    return `${dias.slice(0, -1).join(', ')} e ${dias[dias.length - 1]}`;
  }

  /** Semana completa (7 dias), incluindo os dias sem missa. */
  get agendaSemana(): { dia: number; label: string; missas: MissaNaGrade[] }[] {
    const labels = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    const grupos: Record<number, MissaNaGrade[]> = {};
    (this.missas ?? []).filter((m) => ehSemanal(m)).forEach((m) => {
      if (m.diaSemana !== undefined && m.diaSemana !== null) {
        (grupos[m.diaSemana] = grupos[m.diaSemana] ?? []).push(m);
      }
    });
    this._adicionarDiaFixoDaSemana(grupos);
    return labels.map((label, dia) => ({
      dia,
      label,
      missas: (grupos[dia] ?? []).sort((a, b) => a.horario.localeCompare(b.horario)),
    }));
  }

  /**
   * Dia fixo do mês que cai nos próximos 7 dias (a partir de hoje) entra na linha do
   * dia da semana correspondente, marcado com o dia ("14h00 · dia 1"). Só no browser:
   * o prerender fica no ar por dias e não sabe que dia é hoje — o HTML pré-gerado
   * mantém a grade só com as semanais (a regra completa segue na seção abaixo).
   * Dia de exceção (ex.: "exceto domingos") já fica de fora pelo `ocorreEm`.
   */
  private _adicionarDiaFixoDaSemana(grupos: Record<number, MissaNaGrade[]>): void {
    if (!this._isBrowser) return;
    const diasFixos = (this.missas ?? []).filter((m) => !ehSemanal(m) && !ehDataEspecifica(m));
    if (!diasFixos.length) return;

    for (const data of this._proximos7Dias()) {
      for (const m of diasFixos) {
        if (!ocorreEm(m, data)) continue;
        (grupos[data.getDay()] = grupos[data.getDay()] ?? []).push({ ...m, rotuloNaSemana: rotuloNaData(m, data) });
      }
    }
  }

  /** Hoje + 6 dias, à meia-noite local. */
  private _proximos7Dias(): Date[] {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i));
  }

  /** Missa de dia fixo que já aparece na grade desta semana (só no browser). */
  private _estaNaGrade(m: Mass): boolean {
    return this._isBrowser && this._proximos7Dias().some((d) => ocorreEm(m, d));
  }

  /** Missas de dia fixo do mês ("Todo dia 13, 19h"): fora da grade semanal. */
  // Só as que NÃO estão na grade desta semana: a que já aparece como "14h00 · dia 1"
  // não se repete aqui. No prerender todas entram (a grade lá não tem dia fixo).
  get missasDiaFixo(): { descricao: string; observacao?: string }[] {
    return (this.missas ?? [])
      .filter((m) => !ehSemanal(m) && !ehDataEspecifica(m) && !this._estaNaGrade(m))
      .sort((a, b) => (a.diaDoMes ?? 0) - (b.diaDoMes ?? 0) || a.horario.localeCompare(b.horario))
      .map((m) => ({ descricao: m.descricaoRecorrencia || descrever(m), observacao: this.notaDaMissa(m) }));
  }

  /**
   * Missas de datas especiais (ex.: Natal 2026) que ainda vão acontecer, agrupadas por data.
   * Datas passadas ficam de fora; `substitui` avisa que as missas normais não ocorrem no dia.
   */
  get datasEspeciais(): DataEspecial[] {
    const hoje = chaveData(new Date());
    const porData = new Map<string, Mass[]>();
    for (const m of this.missas ?? []) {
      if (!ehDataEspecifica(m) || !m.data) continue;
      const data = m.data.slice(0, 10);
      if (data < hoje) continue;
      porData.set(data, [...(porData.get(data) ?? []), m]);
    }
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return [...porData.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, lista]) => {
        const [ano, mes, dia] = data.split('-').map(Number);
        const diaSemana = new Date(ano, mes - 1, dia).getDay();
        // Nome igual em todas as missas do dia (ex.: "Natal") vai ao lado da data;
        // nomes diferentes ("Missa do Galo" e "Natal") continuam em cada horário.
        const nomes = new Set(lista.map((m) => (m.nome ?? '').trim()));
        const nomeDoDia = nomes.size === 1 ? [...nomes][0] : '';
        return {
          data,
          diaSemana: dias[diaSemana],
          dataCurta: formatarData(data),
          nome: nomeDoDia,
          substitui: lista.some((m) => !!m.substituiMissasDoDia),
          missas: [...lista]
            .sort((a, b) => a.horario.localeCompare(b.horario))
            .map((m) => ({
              horario: this.formatarHorario(m.horario),
              texto: [nomeDoDia ? '' : (m.nome ?? '').trim(), (m.observacao ?? '').trim()].filter(Boolean).join(' · '),
            })),
        };
      });
  }

  trackDataEspecial = (_: number, d: { data: string }) => d.data;

  /** Observações do quadro, numeradas na ordem em que aparecem nos chips. */
  get notas(): { chave: string; numero: number; rotulo: string; texto: string }[] {
    const daSemana = this.diasComMissa.flatMap((g) =>
      g.missas
        .filter((m) => this.notaDaMissa(m))
        .map((m) => ({
          chave: `${g.dia}-${m.horario}`,
          rotulo: `${g.label}, ${this.formatarHorario(m.horario)}`,
          texto: this.notaDaMissa(m),
        })),
    );
    const doMes = this.missasDiaFixo.flatMap((m, i) =>
      m.observacao ? [{ chave: `fixo-${i}`, rotulo: m.descricao, texto: m.observacao }] : [],
    );
    return [...daSemana, ...doMes].map((n, i) => ({ ...n, numero: i + 1 }));
  }

  numeroDaNota(chave: string): number | null {
    return this.notas.find((n) => n.chave === chave)?.numero ?? null;
  }

  /** Observação da missa, ou '' se só repete a regra já exibida (ex.: "1ª sexta do mês"). */
  notaDaMissa(m: Mass): string {
    const obs = (m.observacao ?? '').trim();
    if (!obs) return '';
    const regra = (m.descricaoRecorrencia || descrever(m)).toLowerCase();
    return regra.includes(obs.toLowerCase()) ? '' : obs;
  }

  /** Falso no prerender: separa informação temporal estável da relativa. */
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Pílula "HOJE" na grade semanal. Nunca no prerender: qual dia é "hoje" depende do
   * relógio de quem lê, e o arquivo estático fica no ar por dias. A grade em si —
   * dia da semana e horários — é estável e continua toda no HTML indexável; só o
   * destaque relativo nasce na hidratação.
   */
  isHoje(diaSemana: number): boolean {
    return this._isBrowser && new Date().getDay() === diaSemana;
  }

  formatarHorario(horario: string): string {
    return formatMassTime(horario);
  }
}
