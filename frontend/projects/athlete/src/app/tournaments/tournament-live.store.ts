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
import {
  duoAvatarsOf,
  duoInitialsOf,
  duoNameOf,
  duoPlayersOf,
  type DuoPlayer as DuoPlayerType,
} from './duo-identity';
import { defaultTabOf, liveMatchesOf, myDayTimeline, myMatches, nextMatchOf, visibleTabsOf, type TournamentTabId } from './tournament-live.selectors';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

// `DuoPlayer` e as regras de nome/retrato da dupla moram em `./duo-identity`, compartilhadas com
// a HOME do atleta (que monta o card de campanha sem entrar na rota do torneio). Re-exportado
// aqui porque onze arquivos já importam o tipo deste módulo.
export type { DuoPlayer } from './duo-identity';

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

  readonly liveInTournament = computed(() => liveMatchesOf(this.matches()));

  readonly hasMyMatchToday = computed(() => this.dayTimeline().length > 0);

  /** Há confronto definido em algum lugar da chave — o que destrava a aba de palpites. */
  readonly hasDefinedMatchups = computed(() => this.matches().some((m) => m.teamAId.length > 0 && m.teamBId.length > 0));

  readonly visibleTabs = computed<TournamentTabId[]>(() =>
    visibleTabsOf({
      hasMyMatchToday: this.hasMyMatchToday(),
      isRegistered: this.isRegistered(),
      hasDefinedMatchups: this.hasDefinedMatchups(),
    }),
  );

  readonly defaultTab = computed(() => defaultTabOf());

  /** Ligado quando o atleta pede a lista de categorias ("Todas as categorias"). Enquanto for
   *  falso, quem está inscrito é levado direto para a própria categoria — sem o sinal, o atalho
   *  reagiria ao clique de voltar e prenderia o atleta na categoria dele. */
  readonly categoryListRequested = signal(false);

  /** Reconhecimento LOCAL da chamada de quadra (seção Agora do Focus) — mora aqui, não no
   *  componente da seção. `callMatchToCourt` grava `queueStatus: 'on_court'` e NUNCA o reseta —
   *  `submitMatchResult` grava `status`/`sets`/`winnerId` mas não toca em `queueStatus`; só
   *  `declareMatchWalkover` o limpa. Então, depois que o atleta confirma, o reconhecimento é o
   *  ÚNICO sinal que distingue "chamado" de "em quadra" pro resto da partida, e ele precisa
   *  sobreviver à troca de seção dentro do Focus: `agora`/`trajetória`/`grupo` são rotas irmãs,
   *  sem `RouteReuseStrategy` customizada, então o Angular destrói e recria o componente da
   *  seção a cada navegação — um signal local ali reapareceria com o alerta vermelho no meio da
   *  partida. Só em memória, de propósito: um reload deve mostrar a chamada de novo. */
  private readonly acknowledgedCallMatchId = signal<string | null>(null);

  get acknowledgedCall(): string | null {
    return this.acknowledgedCallMatchId();
  }

  acknowledgeCall(matchId: string): void {
    this.acknowledgedCallMatchId.set(matchId);
  }

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
    return duoNameOf(this.teams(), this.profiles(), teamId, fallback);
  }

  duoInitialsOf(teamId: string): [string, string] {
    return duoInitialsOf(this.teams(), this.profiles(), teamId);
  }

  duoAvatarsOf(teamId: string): [string | null, string | null] {
    return duoAvatarsOf(this.teams(), this.profiles(), teamId);
  }

  /** Foto + inicial de cada atleta da dupla, na ordem player1/player2 — o par que os cards
   *  de partida renderizam. */
  duoPlayersOf(teamId: string): [DuoPlayerType, DuoPlayerType] {
    return duoPlayersOf(this.teams(), this.profiles(), teamId);
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

  /** `categoryId` junto do `poolId` porque "Grupo A" existe em toda categoria do torneio e
   *  `matches()` é o torneio inteiro — ver `buildGroupStandings`. */
  standingsOf(categoryId: string, poolId: string) {
    return buildGroupStandings(this.matches(), categoryId, poolId);
  }
}
