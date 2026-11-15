import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PhoneAppShell, type AppTab } from '../../../shared/ui/phone-app-shell';
import {
  ATHLETE,
  MISSIONS,
  MISSIONS_PER_DAY,
  RANKING,
  RANKING_CLIMB,
  RANKING_FROM,
  RECENT_MATCHES,
  TOURNAMENT_WIN_XP,
  formatThousands,
  levelProgress,
  myPosition,
  pointsToPromotion,
  winRate,
  type AthleteStep,
} from './athlete-beats';

/** Em que aba do app cada tela mora. Focus e o editor de story são imersivos: sem abas. */
const TAB_BY_STEP: Record<AthleteStep, AppTab | null> = {
  focus: null,
  history: 'Início',
  level: 'Início',
  ranking: 'Competir',
  xp: 'Início',
  share: null,
};

/** Seções do Modo Focus, como aparecem na navegação dele. */
const FOCUS_SECTIONS = ['Agora', 'Jornada', 'Chave', 'Arena', 'Palpites'];

/**
 * A tela do app em cada passo da cena do atleta, com os rótulos do app de verdade ("Sua próxima
 * partida", "Histórico", "Seu nível", "Compartilhar minha posição", "Missões diárias", "Postar no
 * story"). Tudo que é número vem de `athlete-beats.ts`, a mesma fonte da ficha ao lado.
 */
@Component({
  selector: 'app-athlete-phone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhoneAppShell],
  host: { class: 'block h-full' },
  templateUrl: './athlete-phone.html',
  styles: `
    .screen {
      animation: fade 420ms ease both;
    }

    .live-dot {
      animation: pulse 1.4s ease-in-out infinite;
    }

    /* Card do story: fundo escuro com o brilho laranja no canto, como a arte "Noite" do app. */
    .story {
      background:
        radial-gradient(120% 70% at 88% 0%, rgba(255, 106, 26, 0.3), transparent 62%),
        var(--color-surface-0);
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
export class AthletePhone {
  readonly step = input.required<AthleteStep>();

  protected readonly athlete = ATHLETE;
  protected readonly focusSections = FOCUS_SECTIONS;
  protected readonly matches = RECENT_MATCHES;
  protected readonly missions = MISSIONS;
  protected readonly missionsPerDay = MISSIONS_PER_DAY;
  protected readonly missionsDone = MISSIONS.filter((mission) => mission.done).length;
  protected readonly winXp = TOURNAMENT_WIN_XP;

  protected readonly winRate = winRate(ATHLETE.wins, ATHLETE.games);
  protected readonly levelProgress = levelProgress(ATHLETE.level);
  protected readonly pointsToPromotion = pointsToPromotion(ATHLETE.level);
  protected readonly position = myPosition();
  protected readonly climb = RANKING_CLIMB;
  protected readonly ranking = RANKING.map((row, index) => ({
    ...row,
    position: RANKING_FROM + index,
    pointsLabel: formatThousands(row.points),
  }));

  protected readonly levelPoints = formatThousands(ATHLETE.level.points);
  protected readonly levelMarks = [
    { label: 'Desce', value: formatThousands(ATHLETE.level.dropAt) },
    { label: 'Início', value: formatThousands(ATHLETE.level.startAt) },
    { label: 'Sobe', value: formatThousands(ATHLETE.level.promoteAt) },
  ];
  protected readonly xpTotal = formatThousands(ATHLETE.xp.total);

  protected readonly tab = computed(() => TAB_BY_STEP[this.step()]);
}
