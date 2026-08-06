import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { athleteFunctions } from '../../data/functions';
import { matchIsCanceled, matchIsCompleted, matchIsLive, type TournamentMatch } from '../../data/matches-repository';
import { fetchPublicProfilesByIds, type AthletePublicProfile } from '../../data/public-profiles-repository';
import { fetchPredictionEntries, submitBracketPrediction, type TournamentPredictionEntry } from '../../data/tournament-predictions-repository';
import { NxToastService } from '../../shared/feedback';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { matchNumberLabelOf, timeLabelOf } from '../tournament-format';
import { groupLabelOf, knockoutLabelOf } from '../tournament-live.selectors';
import { TournamentLiveStore, type DuoPlayer } from '../tournament-live.store';
import {
  buildPredictionLeaderboard,
  canPredictMatch,
  isChampionDecidingMatch,
  isPredictionLocked,
  predictableMatches,
  predictionResultOf,
  predictionStatsOf,
  type PredictionResult,
} from './predictions.selectors';

type Section = 'picks' | 'ranking';
type CardState = 'open' | 'live' | 'done' | 'canceled';

export interface PickOptionView {
  teamId: string;
  name: string;
  players: [DuoPlayer, DuoPlayer];
  selected: boolean;
  /** Venceu de fato — o par visual do selo "você acertou", pra não depender só da cor. */
  won: boolean;
  mine: boolean;
}

export interface PredictionCardView {
  matchId: string;
  number: string | null;
  /** "SEMIFINAL · 17:30" (+ categoria quando a lista mistura categorias). */
  head: string;
  state: CardState;
  stateLabel: string;
  /** Final e 3º lugar herdam o card premium (ouro/bronze) já usado em Partidas. */
  stage: 'final' | 'third' | null;
  championMatch: boolean;
  locked: boolean;
  result: PredictionResult | null;
  /** Quanto vale acertar esta partida: 1, ou 4 na final (1 da partida + 3 do campeão). */
  hitPoints: number;
  options: PickOptionView[];
  saving: boolean;
  saved: boolean;
}

export interface LeaderRowView {
  rank: number;
  name: string;
  initials: string;
  photo: string | null;
  score: number;
  detail: string;
  isMe: boolean;
}

const STATE_LABEL: Record<CardState, string> = {
  open: 'Aberto',
  live: 'Em jogo',
  done: 'Encerrada',
  canceled: 'Cancelada',
};

/** Quanto tempo o "Salvo" fica no card antes de sair de cena. */
const SAVED_BADGE_MS = 2400;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '—';
}

/** Mensagem de erro do salvamento: causa + o que fazer, sem vazar código de erro do Firebase. */
function saveErrorMessage(error: unknown): string {
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';
  if (code === 'functions/unauthenticated') return 'Entre na sua conta de novo para palpitar.';
  if (code === 'functions/failed-precondition') return 'Essa partida já começou — o palpite dela fechou.';
  if (code === 'functions/invalid-argument') return 'Esse palpite não vale para a partida.';
  return 'Tente de novo em instantes.';
}

/**
 * Aba "Palpites": o torcedor aponta quem vence cada partida da chave e disputa o ranking de
 * quem mais acerta. Vale +1 por acerto e +3 no palpite da final (que também é o palpite de
 * campeão) — pontuação creditada pelo trigger de conclusão de partida, nunca aqui.
 *
 * Salva a cada escolha: no navegador, rascunho preso atrás de um botão "Salvar" vira palpite
 * perdido toda vez que a aba fecha. A escolha pinta na hora e só volta atrás se o servidor
 * recusar. A escrita é EXCLUSIVA da callable `submitBracketPrediction` — o portal não tem (nem
 * deve ter) permissão de gravar no documento.
 *
 * Assina o tempo real como as outras abas: quando o organizador dá o start, o card trava aqui
 * sem recarregar a página.
 */
@Component({
  selector: 'app-predictions-tab',
  imports: [NxPageLoadingComponent],
  templateUrl: './predictions-tab.component.html',
  styleUrl: './predictions-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PredictionsTabComponent {
  protected readonly store = inject(TournamentLiveStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NxToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly section = signal<Section>('picks');
  protected readonly categoryFilter = signal<string | null>(null);
  protected readonly loading = signal(true);

  private readonly entries = signal<readonly TournamentPredictionEntry[]>([]);
  private readonly profiles = signal<ReadonlyMap<string, AthletePublicProfile>>(new Map());
  /** Escolhas otimistas ainda não confirmadas pelo servidor, sobrepostas ao que está gravado. */
  private readonly draft = signal<Readonly<Record<string, string>>>({});
  private readonly savingMatchId = signal<string | null>(null);
  private readonly savedMatchId = signal<string | null>(null);

  private loadedFor = '';
  private savedTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly uid = computed(() => this.auth.user()?.uid ?? null);

  constructor() {
    this.destroyRef.onDestroy(this.store.acquireLive());
    this.destroyRef.onDestroy(() => clearTimeout(this.savedTimer));

    effect(() => {
      const id = this.store.tournamentId();
      if (id && id !== this.loadedFor) {
        this.loadedFor = id;
        void this.loadEntries(id);
      }
    });
  }

  // ── Dados ────────────────────────────────────────────────────

  private async loadEntries(tournamentId: string): Promise<void> {
    const db = this.store.firestore;
    if (!db) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const entries = await fetchPredictionEntries(db, tournamentId);
      this.entries.set(entries);
      if (entries.length > 0) {
        this.profiles.set(await fetchPublicProfilesByIds(db, entries.map((e) => e.userId)).catch(() => new Map()));
      }
    } catch {
      // Ranking indisponível não pode derrubar a aba: os cards de palpite continuam utilizáveis.
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private readonly myEntry = computed<TournamentPredictionEntry | null>(() => {
    const uid = this.uid();
    return uid ? (this.entries().find((e) => e.userId === uid) ?? null) : null;
  });

  /** O que está gravado + o que o atleta acabou de escolher. */
  protected readonly picks = computed<Readonly<Record<string, string>>>(() => ({ ...(this.myEntry()?.picks ?? {}), ...this.draft() }));

  private readonly matches = computed(() => predictableMatches(this.store.matches()));

  protected readonly leaderboard = computed(() => buildPredictionLeaderboard(this.entries(), this.uid()));

  protected readonly stats = computed(() => predictionStatsOf(this.myEntry(), this.matches(), this.leaderboard()));

  /** O resumo só faz sentido depois do primeiro palpite — antes disso é uma faixa de zeros. */
  protected readonly hasPlayed = computed(() => Object.keys(this.picks()).length > 0);

  protected readonly openCount = computed(() => this.visibleMatches().filter(canPredictMatch).length);

  // ── Filtro de categoria ──────────────────────────────────────

  protected readonly categories = computed(() => {
    const withMatches = new Set(this.matches().map((m) => m.categoryId));
    return (this.store.tournament()?.categories ?? []).filter((c) => withMatches.has(c.id)).map((c) => ({ id: c.id, label: c.categoryName }));
  });

  private readonly visibleMatches = computed(() => {
    const categoryId = this.categoryFilter();
    const list = this.matches();
    return categoryId ? list.filter((m) => m.categoryId === categoryId) : list;
  });

  protected selectCategory(id: string | null): void {
    this.categoryFilter.set(id);
  }

  // ── Cards ────────────────────────────────────────────────────

  /** `poolId` → "Grupo A". A letra vem da posição do grupo DENTRO da categoria, então o mapa é
   *  montado uma vez por categoria em vez de a cada card. */
  private readonly poolLabels = computed<ReadonlyMap<string, string>>(() => {
    const byCategory = new Map<string, TournamentMatch[]>();
    for (const m of this.store.matches()) {
      const list = byCategory.get(m.categoryId);
      if (list) list.push(m);
      else byCategory.set(m.categoryId, [m]);
    }
    const labels = new Map<string, string>();
    for (const list of byCategory.values()) {
      for (const m of list) {
        if (m.poolId && !labels.has(m.poolId)) labels.set(m.poolId, groupLabelOf(m.poolId, list));
      }
    }
    return labels;
  });

  protected readonly cards = computed<PredictionCardView[]>(() => {
    const picks = this.picks();
    const showCategory = this.categoryFilter() == null && this.categories().length > 1;
    return this.visibleMatches().map((m) => this.cardOf(m, picks, showCategory));
  });

  /** Fase da partida como o atleta a chama: "Grupo A" na fase de grupos, "Semifinal" no
   *  mata-mata. Sem isso o `matchType` cru vaza em inglês ("Group") no cabeçalho do card. */
  private phaseLabelOf(m: TournamentMatch): string {
    return m.poolId ? (this.poolLabels().get(m.poolId) ?? 'Grupo') : knockoutLabelOf(m);
  }

  private cardOf(m: TournamentMatch, picks: Readonly<Record<string, string>>, showCategory: boolean): PredictionCardView {
    const state = this.stateOf(m);
    const pick = picks[m.id] ?? null;
    const category = showCategory ? (this.store.categoryById(m.categoryId)?.categoryName ?? null) : null;
    const time = m.scheduleTime ? timeLabelOf(m.scheduleTime) : null;
    const isChampion = isChampionDecidingMatch(m);

    return {
      matchId: m.id,
      number: matchNumberLabelOf(m),
      head: [category, this.phaseLabelOf(m), time].filter((p): p is string => p != null && p.length > 0).join(' · '),
      state,
      stateLabel: state === 'open' && time ? time : STATE_LABEL[state],
      stage: this.stageOf(m),
      championMatch: isChampion,
      locked: isPredictionLocked(m),
      result: predictionResultOf(m, picks),
      hitPoints: isChampion ? 4 : 1,
      options: [this.optionOf(m, m.teamAId, m.teamADescription, pick), this.optionOf(m, m.teamBId, m.teamBDescription, pick)],
      saving: this.savingMatchId() === m.id,
      saved: this.savedMatchId() === m.id,
    };
  }

  private optionOf(m: TournamentMatch, teamId: string, description: string | null, pick: string | null): PickOptionView {
    return {
      teamId,
      name: this.store.duoNameOf(teamId, description),
      players: this.store.duoPlayersOf(teamId),
      selected: pick === teamId,
      won: matchIsCompleted(m) && m.winnerId === teamId,
      mine: this.store.isMyTeam(teamId),
    };
  }

  private stateOf(m: TournamentMatch): CardState {
    if (matchIsCompleted(m)) return 'done';
    if (matchIsLive(m)) return 'live';
    if (matchIsCanceled(m)) return 'canceled';
    return 'open';
  }

  private stageOf(m: TournamentMatch): 'final' | 'third' | null {
    if (m.poolId) return null;
    const label = knockoutLabelOf(m);
    if (label === 'Final' || label === 'Grand final') return 'final';
    if (label === '3º lugar') return 'third';
    return null;
  }

  // ── Salvamento ───────────────────────────────────────────────

  protected async pick(matchId: string, teamId: string): Promise<void> {
    const tournamentId = this.store.tournamentId();
    const match = this.store.matchById(matchId);
    const uid = this.uid();
    if (!match || !tournamentId) return;

    if (!uid) {
      this.toast.error('Entre na sua conta para palpitar', 'Seus palpites ficam salvos no seu perfil.');
      return;
    }
    if (!canPredictMatch(match)) {
      this.toast.warning('Palpite fechado', 'Essa partida já começou.');
      return;
    }
    if (this.picks()[matchId] === teamId || this.savingMatchId() != null) return;

    const previous = this.picks()[matchId] ?? null;
    this.draft.update((d) => ({ ...d, [matchId]: teamId }));
    this.savingMatchId.set(matchId);

    try {
      await submitBracketPrediction(athleteFunctions(), {
        tournamentId,
        picks: { [matchId]: teamId },
        // O palpite da final É o palpite de campeão: vale +3 e dispensa um seletor à parte.
        championPick: isChampionDecidingMatch(match) ? teamId : null,
      });
      this.commit(uid, matchId, teamId, isChampionDecidingMatch(match));
      this.flashSaved(matchId);
    } catch (error) {
      this.rollback(matchId, previous);
      this.toast.error('Palpite não salvo', saveErrorMessage(error));
    } finally {
      this.savingMatchId.set(null);
    }
  }

  /** Confirma a escolha na lista carregada, pro ranking refletir o palpite sem reler a coleção. */
  private commit(uid: string, matchId: string, teamId: string, isChampion: boolean): void {
    this.entries.update((list) => {
      const existing = list.find((e) => e.userId === uid);
      const merged: TournamentPredictionEntry = {
        userId: uid,
        picks: { ...(existing?.picks ?? {}), [matchId]: teamId },
        championPick: isChampion ? teamId : (existing?.championPick ?? null),
        score: existing?.score ?? 0,
      };
      return existing ? list.map((e) => (e.userId === uid ? merged : e)) : [...list, merged];
    });
    this.draft.update((d) => {
      const { [matchId]: _saved, ...rest } = d;
      return rest;
    });
  }

  private rollback(matchId: string, previous: string | null): void {
    this.draft.update((d) => {
      const next = { ...d };
      if (previous) next[matchId] = previous;
      else delete next[matchId];
      return next;
    });
  }

  private flashSaved(matchId: string): void {
    clearTimeout(this.savedTimer);
    this.savedMatchId.set(matchId);
    this.savedTimer = setTimeout(() => this.savedMatchId.set(null), SAVED_BADGE_MS);
  }

  // ── Ranking ──────────────────────────────────────────────────

  protected readonly leaderRows = computed<LeaderRowView[]>(() => {
    const profiles = this.profiles();
    return this.leaderboard().map((row) => {
      const name = profiles.get(row.userId)?.displayName?.trim() || 'Atleta';
      return {
        rank: row.rank,
        name,
        initials: initialsOf(name),
        photo: profiles.get(row.userId)?.avatarUrl ?? null,
        score: row.score,
        detail: row.picksCount === 1 ? '1 palpite' : `${row.picksCount} palpites`,
        isMe: row.isMe,
      };
    });
  });

  protected showSection(section: Section): void {
    this.section.set(section);
  }
}
