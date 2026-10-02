import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { OrganizerPublicProfileSource } from '../data/organizer-public-profile-repository';
import {
  organizerProfileIsPublic,
  type OrganizerEvent,
  type OrganizerPublicProfile,
  type OrganizerReputationDetail,
  type OrganizerReviewSummaryRow,
} from '../data/organizer-public-profiles';
import { NxToastService } from '../shared/feedback';
import { realizedOrganizerEvents, upcomingOrganizerEvents } from './organizer-profile.vm';

export type OrganizerProfileStatus = 'loading' | 'ready' | 'not-found' | 'error';

/** Quantos próximos e quantos realizados a visão geral mostra — e cujos detalhes carregam já. */
export const UPCOMING_PREVIEW = 3;
export const HISTORY_PREVIEW = 3;

function errorMessageOf(err: unknown): string | null {
  const raw = (err as { message?: unknown } | null)?.message;
  return typeof raw === 'string' && raw.trim() ? raw.replace(/^Firebase:\s*/i, '').trim() : null;
}

function errorCodeOf(err: unknown): string {
  const raw = (err as { code?: unknown } | null)?.code;
  return typeof raw === 'string' ? raw.replace(/^firestore\//, '') : '';
}

const idsOf = (events: readonly OrganizerEvent[]) => events.map((e) => e.summary.id);

/**
 * Estado da página de um organizador. Provido no componente da página (não em `root` nem na
 * rota): nasce e morre com a tela.
 *
 * Duas fases de leitura. A primeira (perfil, eventos, reputação, resumos) decide a página. A
 * segunda é sob demanda e separada por dado, porque cada uma custa leitura por evento:
 * - inscritos (`ensureCounts`): só onde aparecem — os 3 cards e as 3 linhas da visão geral, e
 *   todos na aba Eventos;
 * - nomes dos campeões (`ensureTeamNames`): os 3 realizados da visão geral, e todos nas abas
 *   Eventos e Resultados (que não mostra inscritos).
 * Um id só fica marcado como pedido depois da resposta: o que falhou é pedido de novo na próxima
 * vez que a tela precisar dele.
 */
@Injectable()
export class OrganizerProfileStore {
  private readonly source = inject(OrganizerPublicProfileSource);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(NxToastService);

  readonly organizerId = signal('');
  readonly status = signal<OrganizerProfileStatus>('loading');
  /** Mensagem real do erro (índice, permissão, rede) — vai pra tela junto do texto genérico. */
  readonly errorDetail = signal<string | null>(null);
  readonly profile = signal<OrganizerPublicProfile | null>(null);
  readonly reputation = signal<OrganizerReputationDetail | null>(null);
  readonly events = signal<readonly OrganizerEvent[]>([]);
  readonly reviewSummaries = signal<readonly OrganizerReviewSummaryRow[]>([]);
  /** Inscrições por torneio (`count()` em `inscriptions`). Ausente = ainda não chegou. */
  readonly enrolled = signal<ReadonlyMap<string, number>>(new Map());
  /** Nome de exibição de cada equipe campeã. */
  readonly teamNames = signal<ReadonlyMap<string, string>>(new Map());
  /** `null` = ainda não se sabe (leitura em curso ou falhou). Tratar "não sei" como "não sigo"
   *  levava quem já segue a um create que a rule recusa (vira update) e a um botão travado. */
  readonly following = signal<boolean | null>(null);
  /** A leitura de "já sigo?" falhou: o clique em Seguir tenta ler de novo antes de escrever. */
  readonly followCheckFailed = signal(false);
  readonly followBusy = signal(false);
  readonly followersCount = signal(0);
  /** Relógio dos selos ("Em breve", "Ao vivo"): fixado a cada carga. */
  readonly now = signal(new Date());

  private loadToken = 0;
  /** Sobe a cada clique em Seguir: leitura de "já sigo?" que começou antes não sobrescreve. */
  private followVersion = 0;
  /** Pedidos (em curso ou respondidos) — evita ler duas vezes o mesmo evento ou equipe. */
  private readonly countsRequested = new Set<string>();
  private readonly teamsRequested = new Set<string>();

  readonly viewerUid = computed(() => this.auth.user()?.uid ?? null);
  readonly isSelf = computed(() => this.viewerUid() != null && this.viewerUid() === this.organizerId());
  /** Seguir exige sessão Firebase real (a rule compara `request.auth.uid`) e some no próprio perfil. */
  readonly canFollow = computed(() => this.status() === 'ready' && this.viewerUid() != null && !this.isSelf());
  /** Botão desabilitado enquanto a leitura de "já sigo?" não volta. */
  readonly followPending = computed(() => this.canFollow() && this.following() === null && !this.followCheckFailed());

  readonly upcoming = computed(() => upcomingOrganizerEvents(this.events(), this.now()));
  readonly realized = computed(() => realizedOrganizerEvents(this.events(), this.now()));

  constructor() {
    // A sessão costuma chegar depois da primeira carga: sem reagir a ela, quem já segue veria "Seguir".
    effect(() => {
      const viewer = this.viewerUid();
      const organizerId = this.organizerId();
      const ready = this.status() === 'ready';
      untracked(() => {
        this.following.set(null);
        this.followCheckFailed.set(false);
      });
      if (!ready || !viewer || viewer === organizerId) return;
      untracked(() => void this.loadFollowing(viewer, organizerId));
    });
  }

  async load(organizerId: string): Promise<void> {
    const token = ++this.loadToken;
    const id = organizerId.trim();
    this.organizerId.set(id);
    this.status.set('loading');
    this.errorDetail.set(null);
    this.profile.set(null);
    this.reputation.set(null);
    this.events.set([]);
    this.reviewSummaries.set([]);
    this.enrolled.set(new Map());
    this.teamNames.set(new Map());
    this.following.set(null);
    this.followCheckFailed.set(false);
    this.countsRequested.clear();
    this.teamsRequested.clear();
    if (!id) {
      this.status.set('not-found');
      return;
    }

    try {
      // Reputação e resumos são acessórios: falha neles não derruba a página.
      const [profile, events, reputation, summaries] = await Promise.all([
        this.source.fetchProfile(id),
        this.source.fetchEvents(id),
        this.source.fetchReputation(id).catch(() => null),
        this.source.fetchReviewSummaries(id).catch(() => [] as OrganizerReviewSummaryRow[]),
      ]);
      if (token !== this.loadToken) return;
      if (!organizerProfileIsPublic(profile)) {
        this.status.set('not-found');
        return;
      }
      this.profile.set(profile);
      this.followersCount.set(profile.followersCount);
      this.events.set(events);
      this.reputation.set(reputation);
      this.reviewSummaries.set(summaries);
      this.now.set(new Date());
      this.status.set('ready');
      const recent = this.realized().slice(0, HISTORY_PREVIEW);
      void this.ensureCounts(idsOf([...this.upcoming().slice(0, UPCOMING_PREVIEW), ...recent]));
      void this.ensureTeamNames(idsOf(recent));
    } catch (err) {
      if (token !== this.loadToken) return;
      this.errorDetail.set(errorMessageOf(err));
      this.status.set('error');
    }
  }

  retry(): Promise<void> {
    return this.load(this.organizerId());
  }

  /** Aba Eventos: inscritos de todos e campeões dos realizados. */
  ensureEventsTabDetails(): Promise<unknown> {
    return Promise.all([this.ensureCounts(idsOf([...this.upcoming(), ...this.realized()])), this.ensureTeamNames(idsOf(this.realized()))]);
  }

  /** Aba Resultados: só os campeões — ela não mostra inscritos. */
  ensureResultsTabDetails(): Promise<void> {
    return this.ensureTeamNames(idsOf(this.realized()));
  }

  /** Inscritos por evento (`count()`, 1 leitura cada). */
  async ensureCounts(eventIds: readonly string[]): Promise<void> {
    const fresh = [...new Set(eventIds)].filter((id) => !this.countsRequested.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) this.countsRequested.add(id);
    const token = this.loadToken;
    const counts = await this.source.fetchEnrolledCounts(fresh).catch(() => new Map<string, number>());
    if (token !== this.loadToken) return;
    // Contagem que falhou não volta no mapa: libera o id para a próxima tentativa.
    for (const id of fresh) if (!counts.has(id)) this.countsRequested.delete(id);
    if (counts.size > 0) this.enrolled.update((m) => new Map([...m, ...counts]));
  }

  /** Nomes das equipes campeãs dos eventos pedidos. */
  async ensureTeamNames(eventIds: readonly string[]): Promise<void> {
    const wanted = new Set(eventIds);
    const teamIds = [
      ...new Set(this.events().filter((e) => wanted.has(e.summary.id)).flatMap((e) => e.champions.map((c) => c.teamId))),
    ].filter((id) => !this.teamsRequested.has(id));
    if (teamIds.length === 0) return;
    for (const id of teamIds) this.teamsRequested.add(id);
    const token = this.loadToken;
    try {
      const names = await this.source.fetchTeamNames(teamIds);
      if (token !== this.loadToken) return;
      // Equipe ausente na resposta foi apagada: não adianta pedir de novo.
      if (names.size > 0) this.teamNames.update((m) => new Map([...m, ...names]));
    } catch {
      if (token !== this.loadToken) return;
      for (const id of teamIds) this.teamsRequested.delete(id);
    }
  }

  /**
   * Otimista: responde na hora e desfaz se a escrita falhar. Seguir é CRIAR o doc — a rule recusa
   * escrever sobre um que já existe (vira update). Por isso:
   * - sem saber se já segue (leitura inicial falhou), lê de novo antes de escrever;
   * - create recusado com `permission-denied` relê: se o doc existe, já seguia — adota em silêncio.
   */
  async toggleFollow(): Promise<void> {
    const viewer = this.viewerUid();
    const organizerId = this.organizerId();
    if (!viewer || !this.canFollow() || this.followBusy() || this.followPending()) return;

    this.followBusy.set(true);
    try {
      let current = this.following();
      if (current === null) {
        try {
          current = await this.source.isFollowing(viewer, organizerId);
        } catch {
          this.toasts.error('Não foi possível verificar se você já segue', 'Verifique sua conexão e tente de novo em instantes.');
          return;
        }
        this.followCheckFailed.set(false);
        this.following.set(current);
        if (current) return; // Já seguia: o botão passa a "Seguindo" sem escrever nada.
      }

      const next = !current;
      const previousCount = this.followersCount();
      this.followVersion++;
      this.following.set(next);
      this.followersCount.set(Math.max(0, previousCount + (next ? 1 : -1)));
      try {
        await this.source.setFollowing(viewer, organizerId, next);
        if (next) {
          this.toasts.success(`Seguindo ${this.profile()?.name ?? 'o organizador'}`, 'Você recebe um aviso quando abrir inscrição em um evento novo.');
        }
      } catch (err) {
        if (next && errorCodeOf(err) === 'permission-denied') {
          const exists = await this.source.isFollowing(viewer, organizerId).catch(() => null);
          if (exists === true) {
            this.following.set(true);
            this.followersCount.set(previousCount);
            return;
          }
        }
        this.following.set(current);
        this.followersCount.set(previousCount);
        this.toasts.error(next ? 'Não foi possível seguir' : 'Não foi possível deixar de seguir', 'Verifique sua conexão e tente de novo em instantes.');
      }
    } finally {
      this.followBusy.set(false);
    }
  }

  private async loadFollowing(viewer: string, organizerId: string): Promise<void> {
    const version = this.followVersion;
    const stillCurrent = () => this.organizerId() === organizerId && this.viewerUid() === viewer && version === this.followVersion;
    try {
      const following = await this.source.isFollowing(viewer, organizerId);
      if (stillCurrent()) this.following.set(following);
    } catch {
      // Fica `null` (não "não sigo"): o botão volta a funcionar e o clique relê antes de escrever.
      if (stillCurrent()) this.followCheckFailed.set(true);
    }
  }
}
