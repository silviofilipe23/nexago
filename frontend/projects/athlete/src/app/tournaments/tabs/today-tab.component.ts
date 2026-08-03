import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { matchIsCompleted, matchIsLive, type TournamentMatch } from '../../data/matches-repository';
import type { TournamentAnnouncement } from '../../data/tournament-announcements-repository';
import {
  bestOfLabelOf,
  closedPartialsLabelOf,
  countdownLabelOf,
  courtLabelOf,
  liveScoreLineOf,
  matchNumberLabelOf,
  ordinalOf,
  roundsProgressLabel,
  setWinsLabelOf,
  timeLabelOf,
} from '../tournament-format';
import {
  groupLabelOf,
  hasPendingKnockout,
  isPending,
  knockoutLabelOf,
  outcomeOf,
  qualificationOf,
  roundDisplayNumberOf,
  roundGroupsOf,
  sideOf,
} from '../tournament-live.selectors';
import { TournamentLiveStore, type DuoPlayer } from '../tournament-live.store';

export interface DuoView {
  teamId: string;
  name: string;
  isMe: boolean;
  players: [DuoPlayer, DuoPlayer];
  /** "1º do grupo · 2V 0D" — só existe em partida de fase de grupos. */
  standingLine: string | null;
}

export interface NextMatchView {
  matchId: string;
  kicker: string;
  /** "Jogo #12" — o nome pelo qual o organizador chama a partida na quadra. `null` sem número. */
  numberLabel: string | null;
  timeLabel: string;
  countdown: string | null;
  courtLabel: string | null;
  bestOfLabel: string;
  checkedIn: boolean;
  live: boolean;
  liveScoreLine: string | null;
  sideA: DuoView;
  sideB: DuoView;
}

export type TimelineState = 'done' | 'live' | 'next' | 'upcoming';

export interface TimelineEntry {
  matchId: string;
  time: string;
  title: string;
  detail: string | null;
  outcomeLabel: string | null;
  outcome: 'win' | 'loss' | null;
  state: TimelineState;
  note: string | null;
  clickable: boolean;
}

export interface LiveRowView {
  matchId: string;
  nameA: string;
  nameB: string;
  context: string;
  scoreLine: string | null;
}

export interface QualificationNote {
  tone: 'win' | 'neutral';
  text: string;
}

const ANNOUNCE_TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Na pílula de meta da próxima partida o número aparece sozinho, então vai por extenso
 *  ("Jogo #12") — diferente da linha mono dos cards, onde o `#12` já se explica pelo contexto. */
function numberChipOf(m: TournamentMatch): string | null {
  const number = matchNumberLabelOf(m);
  return number ? `Jogo ${number}` : null;
}

/**
 * Aba "Hoje": o que o atleta precisa saber com o torneio rolando — próxima partida, o dia
 * inteiro em linha do tempo, situação no grupo, o que está em quadra e os avisos do organizador.
 *
 * É uma das duas telas que assinam o tempo real (`acquireLive`); a baixa acontece no destroy,
 * então sair da aba fecha o listener.
 */
@Component({
  selector: 'app-today-tab',
  imports: [RouterLink],
  templateUrl: './today-tab.component.html',
  styleUrl: './today-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodayTabComponent {
  protected readonly store = inject(TournamentLiveStore);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const release = this.store.acquireLive();
    this.destroyRef.onDestroy(release);
  }

  protected readonly categoryLine = computed(() => {
    const category = this.store.focusCategory();
    if (!category) return null;
    const poolId = this.store.focusPoolId();
    const phase = poolId ? 'fase de grupos e depois mata-mata' : 'mata-mata';
    return `${category.categoryName} · ${phase}`;
  });

  protected readonly nextMatch = computed<NextMatchView | null>(() => {
    const m = this.store.nextMatch();
    if (!m) return null;
    const live = matchIsLive(m);
    const side = sideOf(m, this.store.myTeamIds());
    const checkIn = side === 'A' ? m.checkIn.teamA : m.checkIn.teamB;
    return {
      matchId: m.id,
      kicker: this.kickerOf(m),
      numberLabel: numberChipOf(m),
      timeLabel: timeLabelOf(m.scheduleTime),
      countdown: live ? null : countdownLabelOf(m.scheduleTime, this.store.now()),
      courtLabel: courtLabelOf(m.courtName),
      bestOfLabel: bestOfLabelOf(m),
      checkedIn: checkIn === 'present',
      live,
      liveScoreLine: liveScoreLineOf(m),
      sideA: this.duoViewOf(m.teamAId, m.teamADescription, m.poolId),
      sideB: this.duoViewOf(m.teamBId, m.teamBDescription, m.poolId),
    };
  });

  protected readonly timeline = computed<TimelineEntry[]>(() => {
    const myTeamIds = this.store.myTeamIds();
    const nextId = this.store.nextMatch()?.id;
    const entries = this.store.dayTimeline();
    return entries.map((m) => {
      const outcome = outcomeOf(m, myTeamIds);
      const side = sideOf(m, myTeamIds);
      const opponentId = side === 'A' ? m.teamBId : m.teamAId;
      const opponentDescription = side === 'A' ? m.teamBDescription : m.teamADescription;
      const live = matchIsLive(m);
      const done = matchIsCompleted(m);
      return {
        matchId: m.id,
        time: timeLabelOf(m.scheduleTime),
        title: [matchNumberLabelOf(m), this.phaseLabelOf(m), `vs ${this.store.duoNameOf(opponentId, opponentDescription)}`, courtLabelOf(m.courtName)]
          .filter((p): p is string => p != null)
          .join(' · '),
        detail: done ? closedPartialsLabelOf(m) : live ? liveScoreLineOf(m) : null,
        outcomeLabel: outcome ? `${outcome === 'win' ? 'V' : 'D'} ${this.mySetLine(m, side)}` : null,
        outcome,
        state: done ? 'done' : live ? 'live' : m.id === nextId ? 'next' : 'upcoming',
        note: this.noteOf(m),
        clickable: Boolean(m.teamAId && m.teamBId),
      } satisfies TimelineEntry;
    });
  });

  /** Rodapé da timeline: existe mata-mata pela frente, mas o slot ainda não tem dono. */
  protected readonly pendingKnockout = computed(() => {
    const categoryId = this.store.focusCategoryId();
    if (!categoryId) return false;
    const stillAlive = this.store.myMatches().some((m) => m.categoryId === categoryId && isPending(m));
    return !stillAlive && hasPendingKnockout(this.store.matches(), categoryId);
  });

  protected readonly standings = computed(() => {
    const poolId = this.store.focusPoolId();
    if (!poolId) return [];
    const category = this.store.focusCategory();
    const qualifiers = category?.qualifiersPerGroup ?? 2;
    const myTeamId = this.store.myTeamIdInFocus();
    return this.store.standingsOf(poolId).map((s, index) => ({
      rank: index + 1,
      name: this.store.duoNameOf(s.teamId),
      isMe: s.teamId === myTeamId,
      wins: s.wins,
      losses: this.lossesOf(poolId, s.teamId),
      sets: `${s.setsWon}–${s.setsLost}`,
      points: s.points,
      qualifies: index < qualifiers,
    }));
  });

  protected readonly standingsTitle = computed(() => {
    const poolId = this.store.focusPoolId();
    return poolId ? `${groupLabelOf(poolId, this.store.matches())} · classificação parcial` : null;
  });

  protected readonly standingsKicker = computed(() => {
    const poolId = this.store.focusPoolId();
    if (!poolId) return null;
    const pool = this.store.matches().filter((m) => m.poolId === poolId);
    const qualifiers = this.store.focusCategory()?.qualifiersPerGroup ?? 2;
    const rounds = new Set(pool.map((m) => m.round)).size;
    const playedRounds = new Set(pool.filter((m) => matchIsCompleted(m)).map((m) => m.round)).size;
    return `${roundsProgressLabel(playedRounds, rounds)} · ${qualifiers} primeiros avançam`;
  });

  /** Nunca afirma classificação antes do grupo terminar — ver `qualificationOf`. */
  protected readonly qualificationNote = computed<QualificationNote | null>(() => {
    const poolId = this.store.focusPoolId();
    const category = this.store.focusCategory();
    if (!poolId || !category) return null;
    const info = qualificationOf(
      this.store.matches(),
      poolId,
      this.store.myTeamIdInFocus(),
      this.store.standingsOf(poolId),
      category.qualifiersPerGroup,
    );
    if (!info) return null;
    if (info.decided) {
      return info.qualifies
        ? { tone: 'win', text: `Grupo encerrado em ${ordinalOf(info.rank)}. Você avançou para o mata-mata.` }
        : { tone: 'neutral', text: `Grupo encerrado em ${ordinalOf(info.rank)}. Passavam os ${info.qualifiersPerGroup} primeiros.` };
    }
    const remaining = info.remainingMatches === 1 ? 'Falta 1 partida no grupo' : `Faltam ${info.remainingMatches} partidas no grupo`;
    return { tone: 'neutral', text: `Você está em ${ordinalOf(info.rank)}. ${remaining} — avançam os ${info.qualifiersPerGroup} primeiros.` };
  });

  protected readonly liveNow = computed<LiveRowView[]>(() =>
    this.store.liveInFocusCategory().map((m) => ({
      matchId: m.id,
      nameA: this.store.duoNameOf(m.teamAId, m.teamADescription),
      nameB: this.store.duoNameOf(m.teamBId, m.teamBDescription),
      context: [m.poolId ? groupLabelOf(m.poolId, this.store.matches()) : this.phaseLabelOf(m), courtLabelOf(m.courtName)]
        .filter((p): p is string => p != null)
        .join(' · '),
      scoreLine: liveScoreLineOf(m),
    })),
  );

  protected readonly announcements = computed(() =>
    this.store.announcements().map((a: TournamentAnnouncement) => ({
      id: a.id,
      time: a.createdAt ? ANNOUNCE_TIME.format(a.createdAt) : '',
      message: a.message,
    })),
  );

  private duoViewOf(teamId: string, description: string | null, poolId: string): DuoView {
    return {
      teamId,
      name: this.store.duoNameOf(teamId, description),
      isMe: this.store.isMyTeam(teamId),
      players: this.store.duoPlayersOf(teamId),
      standingLine: this.standingLineOf(teamId, poolId),
    };
  }

  /** "1º do grupo · 2V 0D". */
  private standingLineOf(teamId: string, poolId: string): string | null {
    if (!teamId || !poolId) return null;
    const rows = this.store.standingsOf(poolId);
    const index = rows.findIndex((s) => s.teamId === teamId);
    if (index < 0) return null;
    const row = rows[index]!;
    return `${ordinalOf(index + 1)} do grupo · ${row.wins}V ${this.lossesOf(poolId, teamId)}D`;
  }

  private lossesOf(poolId: string, teamId: string): number {
    return this.store
      .matches()
      .filter((m) => m.poolId === poolId && matchIsCompleted(m) && (m.teamAId === teamId || m.teamBId === teamId) && m.winnerId !== teamId).length;
  }

  private mySetLine(m: TournamentMatch, side: 'A' | 'B' | null): string {
    const [a, b] = setWinsLabelOf(m).split(' – ');
    return side === 'B' ? `${b}–${a}` : `${a}–${b}`;
  }

  private phaseLabelOf(m: TournamentMatch): string {
    if (m.poolId) return `Rodada ${roundDisplayNumberOf(this.store.matches(), m.poolId, m.round)}`;
    return knockoutLabelOf(m);
  }

  private kickerOf(m: TournamentMatch): string {
    const parts = ['Sua próxima partida'];
    if (m.poolId) {
      parts.push(groupLabelOf(m.poolId, this.store.matches()), this.phaseLabelOf(m));
    } else {
      parts.push(this.phaseLabelOf(m));
    }
    return parts.join(' · ');
  }

  /** "decide a classificação do grupo" — verdadeiro sempre que a partida é da última rodada
   *  ainda em aberto. Não promete posição específica: isso dependeria de simular os critérios
   *  de desempate. */
  private noteOf(m: TournamentMatch): string | null {
    if (!m.poolId || matchIsCompleted(m)) return null;
    const groups = roundGroupsOf(this.store.matches(), m.poolId);
    const last = groups[groups.length - 1];
    return last && last.round === m.round ? 'decide a classificação do grupo' : null;
  }

  protected readonly mapsUrl = computed(() => {
    const t = this.store.tournament();
    if (!t) return '';
    const q = t.locationAddress ?? `${t.location}, ${t.city}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });
}
