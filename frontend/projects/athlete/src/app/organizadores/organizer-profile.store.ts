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
import { completedOrganizerEvents, upcomingOrganizerEvents } from './organizer-profile.vm';

export type OrganizerProfileStatus = 'loading' | 'ready' | 'not-found' | 'error';

/** Quantos realizados a visão geral mostra — e cujos detalhes (duplas, campeões) carregam já. */
export const HISTORY_PREVIEW = 3;

function errorMessageOf(err: unknown): string | null {
  const raw = (err as { message?: unknown } | null)?.message;
  return typeof raw === 'string' && raw.trim() ? raw.replace(/^Firebase:\s*/i, '').trim() : null;
}

/**
 * Estado da página de um organizador. Provido no componente da página (não em `root` nem na
 * rota): nasce e morre com a tela.
 *
 * Duas fases de leitura. A primeira (perfil, eventos, reputação, resumos) decide a página. A
 * segunda é sob demanda (`ensureDetails`): contagem de inscrições e nomes dos campeões custam
 * uma leitura por evento, então a visão geral pede só os próximos e os 3 últimos realizados, e as
 * abas Eventos/Resultados completam o resto quando abertas.
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
  readonly following = signal(false);
  readonly followBusy = signal(false);
  readonly followersCount = signal(0);
  /** Relógio dos selos ("Em breve", "Ao vivo"): fixado a cada carga. */
  readonly now = signal(new Date());

  private loadToken = 0;
  /** Sobe a cada clique em Seguir: leitura de "já sigo?" que começou antes não sobrescreve. */
  private followVersion = 0;
  private readonly requestedDetails = new Set<string>();

  readonly viewerUid = computed(() => this.auth.user()?.uid ?? null);
  readonly isSelf = computed(() => this.viewerUid() != null && this.viewerUid() === this.organizerId());
  /** Seguir exige sessão Firebase real (a rule compara `request.auth.uid`) e some no próprio perfil. */
  readonly canFollow = computed(() => this.status() === 'ready' && this.viewerUid() != null && !this.isSelf());

  readonly upcoming = computed(() => upcomingOrganizerEvents(this.events(), this.now()));
  readonly completed = computed(() => completedOrganizerEvents(this.events()));

  constructor() {
    // A sessão costuma chegar depois da primeira carga: sem reagir a ela, quem já segue veria "Seguir".
    effect(() => {
      const viewer = this.viewerUid();
      const organizerId = this.organizerId();
      const ready = this.status() === 'ready';
      if (!ready || !viewer || viewer === organizerId) {
        untracked(() => this.following.set(false));
        return;
      }
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
    this.following.set(false);
    this.requestedDetails.clear();
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
      const recent = this.completed().slice(0, HISTORY_PREVIEW);
      void this.ensureDetails([...this.upcoming(), ...recent].map((e) => e.summary.id));
    } catch (err) {
      if (token !== this.loadToken) return;
      this.errorDetail.set(errorMessageOf(err));
      this.status.set('error');
    }
  }

  retry(): Promise<void> {
    return this.load(this.organizerId());
  }

  /** Abas Eventos e Resultados: completa os detalhes de todos os eventos. */
  ensureAllDetails(): Promise<void> {
    return this.ensureDetails([...this.upcoming(), ...this.completed()].map((e) => e.summary.id));
  }

  /** Inscritos e nomes dos campeões dos eventos pedidos — cada evento é lido uma vez só. */
  async ensureDetails(eventIds: readonly string[]): Promise<void> {
    const fresh = [...new Set(eventIds)].filter((id) => !this.requestedDetails.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) this.requestedDetails.add(id);
    const token = this.loadToken;
    const byId = new Map(this.events().map((e) => [e.summary.id, e]));
    const teamIds = fresh.flatMap((id) => byId.get(id)?.champions.map((c) => c.teamId) ?? []);
    const [counts, names] = await Promise.all([
      this.source.fetchEnrolledCounts(fresh).catch(() => new Map<string, number>()),
      teamIds.length > 0 ? this.source.fetchTeamNames(teamIds).catch(() => new Map<string, string>()) : Promise.resolve(new Map<string, string>()),
    ]);
    if (token !== this.loadToken) return;
    if (counts.size > 0) this.enrolled.update((m) => new Map([...m, ...counts]));
    if (names.size > 0) this.teamNames.update((m) => new Map([...m, ...names]));
  }

  /** Otimista: responde na hora e desfaz se a escrita falhar. Seguir é criar o doc; a rule
   *  recusa reescrever um que já existe, então só escreve a partir do estado lido. */
  async toggleFollow(): Promise<void> {
    const viewer = this.viewerUid();
    const organizerId = this.organizerId();
    if (!viewer || !this.canFollow() || this.followBusy()) return;

    const next = !this.following();
    const previousCount = this.followersCount();
    this.followVersion++;
    this.followBusy.set(true);
    this.following.set(next);
    this.followersCount.set(Math.max(0, previousCount + (next ? 1 : -1)));
    try {
      await this.source.setFollowing(viewer, organizerId, next);
      if (next) {
        this.toasts.success(`Seguindo ${this.profile()?.name ?? 'o organizador'}`, 'Você recebe um aviso quando ele abrir inscrições.');
      }
    } catch {
      this.following.set(!next);
      this.followersCount.set(previousCount);
      this.toasts.error(next ? 'Não foi possível seguir' : 'Não foi possível deixar de seguir', 'Verifique sua conexão e tente de novo em instantes.');
    } finally {
      this.followBusy.set(false);
    }
  }

  private async loadFollowing(viewer: string, organizerId: string): Promise<void> {
    const version = this.followVersion;
    try {
      const following = await this.source.isFollowing(viewer, organizerId);
      if (this.organizerId() === organizerId && this.viewerUid() === viewer && version === this.followVersion) this.following.set(following);
    } catch {
      // Sem a leitura o botão fica em "Seguir"; se já segue, a escrita falha e desfaz.
    }
  }
}
