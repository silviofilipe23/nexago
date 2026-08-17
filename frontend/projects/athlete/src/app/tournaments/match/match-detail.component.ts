import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { LivePointEvent } from '@nexago/live-scoring';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { matchIsCompleted, matchIsLive, matchSetWins, type TournamentMatch } from '../../data/matches-repository';
import { knockoutRounds } from '../focus/focus-journey';
import { bestOfLabelOf, courtLabelOf, currentSetNumberOf, elapsedLabelOf, matchNumberLabelOf, ordinalOf, timeLabelOf } from '../tournament-format';
import {
  campaignOf,
  displaySetsOf,
  groupLabelOf,
  knockoutLabelOf,
  roundDisplayNumberOf,
  sideOf,
  type CampaignEntry,
  type DisplaySet,
} from '../tournament-live.selectors';
import { TournamentLiveStore, type DuoPlayer } from '../tournament-live.store';
import { MatchShareDialogComponent } from './match-share-dialog.component';
import { defaultSetIndexOf, pointByPointSetsOf, summaryLineOf, type PointByPointSet } from './match-point-by-point';
import { MatchPointByPointComponent, type PointByPointColumn, type PointByPointColumns } from './match-point-by-point.component';
import { MatchPointEventsGateway } from './match-point-events.gateway';
import { nextRoundPreviewOf } from './next-round-preview';

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  return local ? titleCase(local) : 'Atleta';
}

export interface MatchSideView {
  teamId: string;
  name: string;
  isMe: boolean;
  players: [DuoPlayer, DuoPlayer];
  /** "1º do Grupo B" — só existe se a dupla passou por fase de grupos. */
  seedLine: string | null;
  campaign: CampaignEntry[];
  winner: boolean;
}

export interface SetRowView {
  index: number;
  a: number;
  b: number;
  inProgress: boolean;
  /** "Você venceu" / "Adversário venceu" / "Marcelo & Enzo venceu". */
  label: string;
  /** Proporção do set para a barra, 0–100 do ponto de vista do lado A. */
  sharePercent: number;
  tone: 'a' | 'b' | 'live';
}

/**
 * Tela cheia da partida (04h). É irmã das abas, não filha — mas compartilha o mesmo
 * `TournamentLiveStore`, providenciado na rota pai, e assina o tempo real enquanto está aberta.
 *
 * O ponto a ponto tem listener próprio: `pointEvents` é subcoleção da PARTIDA, e o store é do
 * torneio inteiro — quem não abre este detalhe não paga a leitura.
 *
 * Fora do escopo por decisão de produto: histórico de confronto direto entre as duplas — exigiria
 * casar duplas por par de uids, e o `teamId` nasce a cada inscrição. (A duração por set, que
 * também estava de fora por falta de `endedAt` nos sets, saiu da lista: as horas dos
 * `pointEvents` dão isso para os sets que a mesa marcou ponto a ponto.)
 */
@Component({
  selector: 'app-match-detail',
  imports: [RouterLink, AtPanelShellComponent, NxPageLoadingComponent, MatchShareDialogComponent, MatchPointByPointComponent],
  templateUrl: './match-detail.component.html',
  styleUrl: './match-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pointEventsGateway = inject(MatchPointEventsGateway);
  protected readonly store = inject(TournamentLiveStore);

  private readonly tournamentIdParam = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
  private readonly matchId = toSignal(this.route.paramMap.pipe(map((p) => p.get('matchId') ?? '')), { initialValue: '' });

  protected readonly shareOpen = signal(false);

  private readonly pointEvents = signal<readonly LivePointEvent[]>([]);

  /** Set escolhido pelo atleta nas abas de set. `null` = "siga o padrão", que acompanha o set em
   *  andamento enquanto a partida rola — depois do primeiro toque a escolha dele manda. */
  private readonly chosenSetIndex = signal<number | null>(null);

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly match = computed<TournamentMatch | null>(() => this.store.matchById(this.matchId()));

  constructor() {
    // A tela pode ser aberta direto pela URL, sem passar pelo shell — então carrega por conta.
    effect(() => {
      const id = this.tournamentIdParam();
      if (id) void this.store.load(id);
    });

    const release = this.store.acquireLive();
    this.destroyRef.onDestroy(release);

    // A rota pode trocar de partida sem recriar o componente, então a assinatura segue o param:
    // desliga a anterior, zera a timeline e assina a nova.
    let unsubscribePoints: (() => void) | null = null;
    effect(() => {
      const id = this.matchId();
      unsubscribePoints?.();
      unsubscribePoints = null;
      this.pointEvents.set([]);
      this.chosenSetIndex.set(null);
      if (id) unsubscribePoints = this.pointEventsGateway.watch(id, (events) => this.pointEvents.set(events));
    });
    this.destroyRef.onDestroy(() => unsubscribePoints?.());
  }

  protected readonly live = computed(() => {
    const m = this.match();
    return m ? matchIsLive(m) : false;
  });

  protected readonly completed = computed(() => {
    const m = this.match();
    return m ? matchIsCompleted(m) : false;
  });

  protected readonly phaseLabel = computed(() => {
    const m = this.match();
    if (!m) return '';
    // Sempre a categoria, nunca o torneio: as duas derivações abaixo recortam por `poolId`, que
    // só é único dentro da categoria — 'Grupo A' existe em todas (ver `buildGroupStandings`).
    const categoryMatches = this.store.matchesOfCategory(m.categoryId);
    if (m.poolId) return `${groupLabelOf(m.poolId, categoryMatches)} · rodada ${roundDisplayNumberOf(categoryMatches, m.poolId, m.round)}`;
    return knockoutLabelOf(m, knockoutRounds(categoryMatches, m.categoryId));
  });

  /** Só a fase: os nomes das duplas já dominam o placar logo abaixo, e repeti-los no título
   *  gastava três linhas no celular com nomes reais. */
  protected readonly pageTitle = computed(() => {
    const m = this.match();
    if (!m) return 'Partida';
    return this.phaseLabel();
  });

  protected readonly categoryName = computed(() => {
    const m = this.match();
    if (!m) return null;
    return this.store.tournament()?.categories.find((c) => c.id === m.categoryId)?.categoryName ?? null;
  });

  /** "Jogo #12 · MD3 · Quadra 2" — sem a fase, que já é o título da página logo acima. O número
   *  vem escrito por extenso porque aqui ele aparece solto, fora da linha mono dos cards. */
  protected readonly contextLine = computed(() => {
    const m = this.match();
    if (!m) return '';
    const number = matchNumberLabelOf(m);
    return [number ? `Jogo ${number}` : null, bestOfLabelOf(m), courtLabelOf(m.courtName)]
      .filter((p): p is string => p != null && p.length > 0)
      .join(' · ');
  });

  /** "início 15:04 · 0:52 em quadra" — o relógio corre com o tick do store. */
  protected readonly timingLine = computed(() => {
    const m = this.match();
    if (!m) return null;
    if (m.matchStartedAt) {
      const parts = [`início ${timeLabelOf(m.matchStartedAt)}`];
      if (this.live()) {
        const elapsed = elapsedLabelOf(m.matchStartedAt, this.store.now());
        if (elapsed) parts.push(`${elapsed} em quadra`);
      }
      return parts.join(' · ');
    }
    return m.scheduleTime ? `agendada para ${timeLabelOf(m.scheduleTime)}` : null;
  });

  protected readonly liveBadge = computed(() => {
    const m = this.match();
    if (!m || !this.live()) return null;
    const setNumber = currentSetNumberOf(m);
    return setNumber ? `Ao vivo · ${ordinalOf(setNumber)} set` : 'Ao vivo';
  });

  protected readonly setWins = computed<[number, number]>(() => {
    const m = this.match();
    return m ? matchSetWins(m) : [0, 0];
  });

  protected readonly sideA = computed<MatchSideView | null>(() => this.sideViewOf('A'));
  protected readonly sideB = computed<MatchSideView | null>(() => this.sideViewOf('B'));

  private sideViewOf(side: 'A' | 'B'): MatchSideView | null {
    const m = this.match();
    if (!m) return null;
    const teamId = side === 'A' ? m.teamAId : m.teamBId;
    const description = side === 'A' ? m.teamADescription : m.teamBDescription;
    const categoryMatches = this.store.matches().filter((k) => k.categoryId === m.categoryId);
    return {
      teamId,
      name: this.store.duoNameOf(teamId, description),
      isMe: this.store.isMyTeam(teamId),
      players: this.store.duoPlayersOf(teamId),
      seedLine: this.seedLineOf(teamId, categoryMatches),
      campaign: campaignOf(categoryMatches, teamId, (opponentId) => this.store.duoNameOf(opponentId), knockoutRounds(categoryMatches, m.categoryId)),
      winner: matchIsCompleted(m) && m.winnerId === teamId,
    };
  }

  /** "1º do Grupo B" — posição final/parcial da dupla no grupo por onde ela passou. */
  private seedLineOf(teamId: string, categoryMatches: readonly TournamentMatch[]): string | null {
    if (!teamId) return null;
    const poolMatch = categoryMatches.find((m) => m.poolId && (m.teamAId === teamId || m.teamBId === teamId));
    if (!poolMatch) return null;
    const rows = this.store.standingsOf(poolMatch.categoryId, poolMatch.poolId);
    const index = rows.findIndex((s) => s.teamId === teamId);
    if (index < 0) return null;
    return `${ordinalOf(index + 1)} do ${groupLabelOf(poolMatch.poolId, categoryMatches)}`;
  }

  protected readonly sets = computed<SetRowView[]>(() => {
    const m = this.match();
    if (!m) return [];
    return displaySetsOf(m).map((s) => this.setRowOf(s, m));
  });

  private setRowOf(s: DisplaySet, m: TournamentMatch): SetRowView {
    const total = s.a + s.b;
    const aWon = s.a > s.b;
    const myTeamIds = this.store.myTeamIds();
    const mySide = sideOf(m, myTeamIds);
    const winnerName = aWon ? this.store.duoNameOf(m.teamAId, m.teamADescription) : this.store.duoNameOf(m.teamBId, m.teamBDescription);
    const iWon = mySide != null && ((aWon && mySide === 'A') || (!aWon && mySide === 'B'));
    return {
      index: s.index,
      a: s.a,
      b: s.b,
      inProgress: s.inProgress,
      label: s.inProgress ? 'Em andamento' : mySide != null ? (iWon ? 'Você venceu' : 'Adversário venceu') : `${winnerName} venceu`,
      sharePercent: total > 0 ? Math.round((s.a / total) * 100) : 50,
      tone: s.inProgress ? 'live' : aWon ? 'a' : 'b',
    };
  }

  protected readonly pointByPointSets = computed<PointByPointSet[]>(() => {
    const m = this.match();
    if (!m) return [];
    return pointByPointSetsOf({ match: m, events: this.pointEvents(), mySide: sideOf(m, this.store.myTeamIds()) });
  });

  /** O card só aparece quando ALGUM set foi de fato marcado ponto a ponto: numa partida lançada só
   *  pelo placar final ele não teria nada a dizer que as Parciais já não dizem. */
  protected readonly showPointByPoint = computed(() => this.pointByPointSets().some((s) => s.blocks.length > 0));

  protected readonly selectedSetIndex = computed<number | null>(() => {
    const sets = this.pointByPointSets();
    const chosen = this.chosenSetIndex();
    if (chosen != null && sets.some((s) => s.setIndex === chosen)) return chosen;
    const m = this.match();
    return m ? defaultSetIndexOf(sets, m) : null;
  });

  protected readonly selectedSetSummary = computed<string | null>(() => {
    const index = this.selectedSetIndex();
    const set = this.pointByPointSets().find((s) => s.setIndex === index);
    return set ? summaryLineOf(set.summary) : null;
  });

  /** Quem fica em cada coluna: a dupla do atleta à esquerda quando ele joga esta partida (a mesma
   *  perspectiva que `pointByPointSetsOf` aplica ao placar), senão o lado A do doc. */
  protected readonly pointByPointColumns = computed<PointByPointColumns | null>(() => {
    const m = this.match();
    if (!m) return null;
    const a: PointByPointColumn = { name: this.store.duoNameOf(m.teamAId, m.teamADescription), isMe: this.store.isMyTeam(m.teamAId) };
    const b: PointByPointColumn = { name: this.store.duoNameOf(m.teamBId, m.teamBDescription), isMe: this.store.isMyTeam(m.teamBId) };
    return sideOf(m, this.store.myTeamIds()) === 'B' ? { left: b, right: a } : { left: a, right: b };
  });

  protected selectSet(setIndex: number): void {
    this.chosenSetIndex.set(setIndex);
  }

  protected readonly nextRound = computed(() => {
    const m = this.match();
    if (!m) return null;
    const categoryMatches = this.store.matches().filter((k) => k.categoryId === m.categoryId);
    const preview = nextRoundPreviewOf(categoryMatches, m, (teamId, fallback) => this.store.duoNameOf(teamId, fallback));
    if (!preview) return null;
    const when = preview.match.scheduleTime;
    return {
      text: preview.opponentNames.join(' ou '),
      roundLabel: preview.roundLabel.toLowerCase(),
      when: when ? `${timeLabelOf(when)}` : null,
      court: courtLabelOf(preview.match.courtName),
    };
  });

  /** De onde o atleta veio: a categoria DESTA partida — chave no mata-mata, lista de jogos na
   *  fase de grupos. Sem a categoria na URL o voltar caía numa categoria qualquer. */
  protected readonly backLink = computed(() => {
    const m = this.match();
    const tournamentId = this.store.tournamentId() || this.tournamentIdParam();
    if (!m?.categoryId) return ['/torneios', tournamentId, 'categorias'];
    return ['/torneios', tournamentId, 'categorias', m.categoryId, m.poolId ? 'partidas' : 'chave'];
  });

  protected readonly backLabel = computed(() => (this.match()?.poolId ? 'Voltar às partidas' : 'Voltar à chave'));
}
