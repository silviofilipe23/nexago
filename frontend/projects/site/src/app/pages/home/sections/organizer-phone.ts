import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PhoneAppShell } from '../../../shared/ui/phone-app-shell';
import {
  CHAMPIONS,
  COURTS,
  EVENT,
  LIVE,
  ORGANIZER_BEATS,
  RUNNERS_UP,
  TEAMS,
  collected,
  formatMoney,
  matchView,
  scheduleGrid,
  type OrganizerStep,
} from './organizer-beats';

/**
 * A tela do painel do organizador em cada passo do torneio, com os rótulos do app de verdade
 * ("Compartilhar inscrição", "Gerar chave", "Cabeças de chave", "Grade de quadras", "Abrir telão",
 * "Disponível para saque"). São telas de gestão, sem as abas do atleta. Duplas, grade e placar
 * vêm de `organizer-beats.ts`, a mesma fonte da chave ao lado.
 */
@Component({
  selector: 'app-organizer-phone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhoneAppShell],
  host: { class: 'block h-full' },
  templateUrl: './organizer-phone.html',
  styles: `
    .screen {
      animation: fade 420ms ease both;
    }

    .live-dot {
      animation: pulse 1.4s ease-in-out infinite;
    }

    @keyframes fade {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes pulse {
      50% {
        opacity: 0.35;
      }
    }
  `,
})
export class OrganizerPhone {
  readonly step = input.required<OrganizerStep>();

  protected readonly event = EVENT;
  protected readonly teamCount = TEAMS.length;
  protected readonly collected = formatMoney(collected());
  /** As inscrições mais recentes: as últimas duplas a entrar. */
  protected readonly latestSignups = [...TEAMS].reverse().slice(0, 3);
  protected readonly seeds = TEAMS.slice(0, 4);
  protected readonly courts = COURTS;
  protected readonly grid = scheduleGrid();
  protected readonly matchCount = scheduleGrid().reduce((total, row) => total + row.courts.filter(Boolean).length, 0);

  /** A partida que a mesa está lançando, com os pontos do set em andamento. */
  protected readonly live = { match: matchView('live', LIVE.id), firstSet: LIVE.firstSet, points: LIVE.points };
  protected readonly lastPoint = `${LIVE.points[0]}–${LIVE.points[1]}`;
  protected readonly champions = CHAMPIONS;
  protected readonly runnersUp = RUNNERS_UP;

  protected readonly clock = computed(() => ORGANIZER_BEATS.find((beat) => beat.step === this.step())?.clock ?? '');
}
