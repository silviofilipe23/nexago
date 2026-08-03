import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { buildGroupStandings, distinctPoolIds, fetchMatchesForTournament, watchMatchesForTournament, type TournamentMatch } from '../data/matches-repository';
import { fetchPublicProfilesByIds, type AthletePublicProfile } from '../data/public-profiles-repository';
import { fetchTeamsByIds, type ArenaTeam } from '../data/teams-repository';
import { fetchTournamentAnnouncements, type TournamentAnnouncement } from '../data/tournament-announcements-repository';
import { fetchMyRegistrations, type AthleteTournamentRegistration } from '../data/tournament-registrations-repository';
import { fetchCategoryEnrolledCounts, fetchTournament, type TournamentCategoryOffer, type TournamentSummary } from '../data/tournaments-repository';
import { defaultTabOf, liveMatchesOf, myDayTimeline, myMatches, nextMatchOf, visibleTabsOf, type TournamentTabId } from './tournament-live.selectors';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function initialsOf(name: string): string {
  const parts = name
    .replace(/\s*[&/]\s*/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '—';
}

function firstNameOf(full: string | undefined): string | null {
  const name = full?.trim().split(/\s+/)[0];
  return name ? name : null;
}

/** O que um círculo de avatar renderiza: a foto quando existe, senão as iniciais. */
export interface DuoPlayer {
  initial: string;
  photo: string | null;
}

/** Intervalos do relógio: 1s enquanto alguma tela mostra placar ao vivo (o cronômetro "0:52 em
 *  quadra" precisa disso), 60s no resto do tempo — a contagem regressiva do card de próxima
 *  partida é exibida em minutos e não justifica um tick por segundo. */
const TICK_LIVE_MS = 1_000;
const TICK_IDLE_MS = 60_000;

/**
 * Fonte única de dados de um torneio para todas as abas + a tela de partida.
 *
 * É providenciado no `TournamentShellComponent` (NÃO em `root`): nasce ao entrar no torneio e
 * morre ao sair, junto com o listener. Sem isso cada aba refaria a mesma cadeia de fetches —
 * hoje `tournament-brackets` sozinho encadeia quatro.
 *
 * Tempo real é opt-in por tela: `acquireLive()` liga o `onSnapshot` e devolve a função de
 * baixa. Enquanto houver ao menos um assinante o listener fica de pé; ao chegar em zero volta
 * ao `getDocs` one-shot. Só a aba Hoje e o detalhe da partida assinam.
 */
@Injectable()
export class TournamentLiveStore {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly db = createFirestore();
  private readonly projectId = environment.firebase.projectId ?? '';

  private unsubscribeMatches: Unsubscribe | null = null;
  private liveSubscribers = 0;
  private tickHandle: ReturnType<typeof setInterval> | undefined;
  private loadToken = 0;

  readonly tournamentId = signal('');
  readonly loading = signal(true);
  readonly tournament = signal<TournamentSummary | null>(null);
  readonly matches = signal<readonly TournamentMatch[]>([]);
  readonly announcements = signal<readonly TournamentAnnouncement[]>([]);
  readonly myRegistrations = signal<readonly AthleteTournamentRegistration[]>([]);
  readonly enrolledByCategory = signal<ReadonlyMap<string, number>>(new Map());
  readonly isLiveConnected = signal(false);

  /** Exposto para as abas que precisam de uma consulta pontual fora do escopo do store
   *  (a Visão geral carrega ligas só para a linha de contexto). */
  get firestore(): Firestore | null {
    return this.db;
  }

  private readonly teams = signal<ReadonlyMap<string, ArenaTeam>>(new Map());
  private readonly profiles = signal<ReadonlyMap<string, AthletePublicProfile>>(new Map());

  /** Relógio compartilhado — tudo que depende de "agora" lê este signal em vez de `new Date()`,
   *  senão o valor congela (computed não reavalia sozinho com o tempo). */
  readonly now = signal(new Date());

  readonly myTeamIds = computed<ReadonlySet<string>>(() => {
    const ids = this.myRegistrations()
      .map((r) => r.teamId)
      .filter((id): id is string => id != null && id.length > 0);
    return new Set(ids);
  });

  readonly myCategoryIds = computed<ReadonlySet<string>>(() => new Set(this.myRegistrations().map((r) => r.categoryId)));

  readonly isRegistered = computed(() => this.myRegistrations().length > 0);

  readonly myMatches = computed(() => myMatches(this.matches(), this.myTeamIds()));

  readonly nextMatch = computed(() => nextMatchOf(this.matches(), this.myTeamIds()));

  readonly dayTimeline = computed(() => myDayTimeline(this.matches(), this.myTeamIds(), this.now()));

  /** A categoria que o atleta está jogando agora — base da classificação lateral e do "ao vivo
   *  na sua categoria". Quem se inscreveu em mais de uma vê a da próxima partida. */
  readonly focusCategoryId = computed<string | null>(() => {
    const next = this.nextMatch();
    if (next) return next.categoryId;
    const [first] = [...this.myCategoryIds()];
    return first ?? null;
  });

  readonly focusCategory = computed<TournamentCategoryOffer | null>(() => {
    const id = this.focusCategoryId();
    return this.tournament()?.categories.find((c) => c.id === id) ?? null;
  });

  /** Grupo do atleta na categoria em foco. */
  readonly focusPoolId = computed<string | null>(() => {
    const teamIds = this.myTeamIds();
    const categoryId = this.focusCategoryId();
    const mine = this.matches().find((m) => m.categoryId === categoryId && m.poolId && (teamIds.has(m.teamAId) || teamIds.has(m.teamBId)));
    return mine?.poolId ?? null;
  });

  readonly myTeamIdInFocus = computed<string | null>(() => {
    const teamIds = this.myTeamIds();
    const categoryId = this.focusCategoryId();
    const mine = this.matches().find((m) => m.categoryId === categoryId && (teamIds.has(m.teamAId) || teamIds.has(m.teamBId)));
    if (!mine) return null;
    return teamIds.has(mine.teamAId) ? mine.teamAId : mine.teamBId;
  });

  readonly liveInFocusCategory = computed(() => liveMatchesOf(this.matches(), this.focusCategoryId() ?? undefined));
  readonly liveInTournament = computed(() => liveMatchesOf(this.matches()));

  readonly hasMyMatchToday = computed(() => this.dayTimeline().length > 0);

  readonly visibleTabs = computed<TournamentTabId[]>(() =>
    visibleTabsOf({
      hasMyMatchToday: this.hasMyMatchToday(),
      isRegistered: this.isRegistered(),
    }),
  );

  readonly defaultTab = computed(() => defaultTabOf(this.visibleTabs()));

  /** Ligado quando o atleta pede a lista de categorias ("Todas as categorias"). Enquanto for
   *  falso, quem está inscrito é levado direto para a própria categoria — sem o sinal, o atalho
   *  reagiria ao clique de voltar e prenderia o atleta na categoria dele. */
  readonly categoryListRequested = signal(false);

  constructor() {
    this.startTicking(TICK_IDLE_MS);
    this.destroyRef.onDestroy(() => {
      this.unsubscribeMatches?.();
      this.unsubscribeMatches = null;
      clearInterval(this.tickHandle);
    });
  }

  /** Carrega tudo que as abas precisam. Idempotente por id: chamar de novo com o mesmo torneio
   *  não refaz o trabalho. */
  async load(tournamentId: string): Promise<void> {
    if (!tournamentId || tournamentId === this.tournamentId()) return;
    this.tournamentId.set(tournamentId);
    const db = this.db;
    if (!db || !this.projectId) {
      this.loading.set(false);
      return;
    }

    const token = ++this.loadToken;
    this.loading.set(true);
    try {
      const uid = this.auth.user()?.uid ?? null;
      // Cada leitura degrada por conta própria. O doc do torneio é público, mas partidas,
      // inscrições e avisos dependem de permissão (e o índice dos avisos pode não existir
      // ainda) — uma recusa isolada não pode apagar a página inteira.
      const [tournament, matches, enrolled, announcements, registrations] = await Promise.all([
        fetchTournament(db, tournamentId).catch(() => null),
        fetchMatchesForTournament(db, this.projectId, tournamentId).catch(() => []),
        fetchCategoryEnrolledCounts(db, this.projectId, tournamentId).catch(() => new Map<string, number>()),
        fetchTournamentAnnouncements(db, tournamentId).catch(() => []),
        uid ? fetchMyRegistrations(db, this.projectId, uid).catch(() => []) : Promise.resolve([]),
      ]);
      if (token !== this.loadToken) return;

      this.tournament.set(tournament);
      this.matches.set(matches);
      this.enrolledByCategory.set(enrolled);
      this.announcements.set(announcements);
      this.myRegistrations.set(registrations.filter((r) => r.tournamentId === tournamentId));

      await this.hydrateNames(matches);
      if (this.liveSubscribers > 0) this.openLiveListener();
    } finally {
      if (token === this.loadToken) this.loading.set(false);
    }
  }

  /** Nomes das duplas: `teams` → `public_profiles`. Roda uma vez por conjunto de partidas e é
   *  reaproveitado por todas as abas. */
  private async hydrateNames(matches: readonly TournamentMatch[]): Promise<void> {
    const db = this.db;
    if (!db || !this.projectId) return;
    const teamIds = [...new Set(matches.flatMap((m) => [m.teamAId, m.teamBId]).filter((id) => id.length > 0))];
    if (teamIds.length === 0) return;
    try {
      const teams = await fetchTeamsByIds(db, this.projectId, teamIds);
      const profileIds = [...teams.values()].flatMap((t) => [t.player1Id, t.player2Id]).filter((id) => id.length > 0);
      const profiles = await fetchPublicProfilesByIds(db, profileIds);
      this.teams.set(teams);
      this.profiles.set(profiles);
    } catch {
      // Sem os nomes, `duoNameOf` cai no `teamDescription` do próprio doc da partida.
    }
  }

  /** Liga o tempo real e devolve a baixa. A tela chama no init e guarda o retorno pro destroy. */
  acquireLive(): () => void {
    this.liveSubscribers++;
    if (this.liveSubscribers === 1) {
      this.startTicking(TICK_LIVE_MS);
      if (this.tournamentId()) this.openLiveListener();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.liveSubscribers = Math.max(0, this.liveSubscribers - 1);
      if (this.liveSubscribers === 0) {
        this.unsubscribeMatches?.();
        this.unsubscribeMatches = null;
        this.isLiveConnected.set(false);
        this.startTicking(TICK_IDLE_MS);
      }
    };
  }

  private openLiveListener(): void {
    const db = this.db;
    const tournamentId = this.tournamentId();
    if (!db || !this.projectId || !tournamentId || this.unsubscribeMatches) return;
    this.unsubscribeMatches = watchMatchesForTournament(
      db,
      this.projectId,
      tournamentId,
      (matches) => {
        this.matches.set(matches);
        this.isLiveConnected.set(true);
        // Duplas novas entram na chave conforme o mata-mata avança.
        const known = this.teams();
        const unknown = matches.some((m) => (m.teamAId && !known.has(m.teamAId)) || (m.teamBId && !known.has(m.teamBId)));
        if (unknown) void this.hydrateNames(matches);
      },
      () => this.isLiveConnected.set(false),
    );
  }

  private startTicking(intervalMs: number): void {
    clearInterval(this.tickHandle);
    this.now.set(new Date());
    this.tickHandle = setInterval(() => this.now.set(new Date()), intervalMs);
  }

  matchById(matchId: string): TournamentMatch | null {
    return this.matches().find((m) => m.id === matchId) ?? null;
  }

  /** "Marcelo / Enzo" — nome cadastrado da equipe, senão os primeiros nomes da dupla. */
  duoNameOf(teamId: string, fallback: string | null = null): string {
    if (!teamId) return fallback ?? 'A definir';
    const team = this.teams().get(teamId);
    if (!team) return fallback ?? 'Dupla';
    if (team.teamName) return team.teamName;
    const profiles = this.profiles();
    const p1 = firstNameOf(profiles.get(team.player1Id)?.displayName);
    const p2 = firstNameOf(profiles.get(team.player2Id)?.displayName);
    if (!p1 && !p2) return fallback ?? 'Dupla';
    // Dupla ainda procurando parceiro grava o mesmo uid nos dois slots.
    if (team.player1Id === team.player2Id) return p1 ?? fallback ?? 'Dupla';
    return `${p1 ?? 'Atleta'} / ${p2 ?? 'Atleta'}`;
  }

  duoInitialsOf(teamId: string): [string, string] {
    const team = this.teams().get(teamId);
    if (!team) return ['—', '—'];
    const profiles = this.profiles();
    const p1 = profiles.get(team.player1Id)?.displayName;
    const p2 = profiles.get(team.player2Id)?.displayName;
    return [p1 ? initialsOf(p1).slice(0, 2) : '—', p2 ? initialsOf(p2).slice(0, 2) : '—'];
  }

  duoAvatarsOf(teamId: string): [string | null, string | null] {
    const team = this.teams().get(teamId);
    if (!team) return [null, null];
    const profiles = this.profiles();
    return [profiles.get(team.player1Id)?.avatarUrl ?? null, profiles.get(team.player2Id)?.avatarUrl ?? null];
  }

  /** Foto + inicial de cada atleta da dupla, na ordem player1/player2 — o par que os cards
   *  de partida renderizam. */
  duoPlayersOf(teamId: string): [DuoPlayer, DuoPlayer] {
    const initials = this.duoInitialsOf(teamId);
    const avatars = this.duoAvatarsOf(teamId);
    return [
      { initial: initials[0], photo: avatars[0] },
      { initial: initials[1], photo: avatars[1] },
    ];
  }

  isMyTeam(teamId: string): boolean {
    return teamId.length > 0 && this.myTeamIds().has(teamId);
  }

  categoryById(categoryId: string): TournamentCategoryOffer | null {
    return this.tournament()?.categories.find((c) => c.id === categoryId) ?? null;
  }

  matchesOfCategory(categoryId: string): TournamentMatch[] {
    return this.matches().filter((m) => m.categoryId === categoryId);
  }

  /** Grupos da categoria, em ordem alfabética de poolId (A, B, C…). */
  poolIdsOf(categoryId: string): string[] {
    return distinctPoolIds(this.matches().filter((m) => m.categoryId === categoryId));
  }

  standingsOf(poolId: string) {
    return buildGroupStandings(this.matches(), poolId);
  }
}
