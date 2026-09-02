import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../auth/auth.service';
import { athleteFunctions } from '../../../data/functions';
import { fetchMyAthleteProfile, type MyAthleteProfile } from '../../../data/my-athlete-profile-repository';
import { PartnerInvitesService } from '../../../data/partner-invites.service';
import { fetchPublicProfilesByIds } from '../../../data/public-profiles-repository';
import {
  sentPendingInvitesFor,
  watchMyRegistrations,
  watchMySentInvites,
  type AthleteTournamentRegistration,
  type SentPartnerInvite,
  type TournamentPartnerInvite,
} from '../../../data/tournament-registrations-repository';
import {
  fetchCategoryEnrolledCounts,
  fetchTournament,
  type TournamentCategoryOffer,
  type TournamentSummary,
} from '../../../data/tournaments-repository';
import { uniformSlotForUid } from '../../../painel/registration-progress';
import { categoryRequiresUniform, isUniformSelectionComplete } from '../../tournament-uniform';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

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

export interface RosterMember {
  uid: string;
  name: string;
  photoUrl: string | null;
  isCaptain: boolean;
  isMe: boolean;
}

/** Estado compartilhado do wizard de inscrição, PROVIDO NA ROTA `torneios/:id/inscricao`.
 *
 *  Uma instância por entrada no fluxo: os seis passos são rotas irmãs e leem o mesmo torneio,
 *  as mesmas inscrições e os mesmos convites. Sem o store, cada passo refaria a cadeia inteira
 *  de leituras a cada navegação — e, pior, cada um poderia enxergar um estado diferente do
 *  outro no mesmo instante.
 *
 *  O store guarda DADOS, nunca o passo. O passo continua derivado do Firestore por
 *  `resolveRegistrationStep` a cada entrada no porteiro — guardá-lo em memória foi exatamente o
 *  beco sem saída da vaga solo pendente. */
@Injectable()
export class RegistrationWizardStore {
  private readonly auth = inject(AuthService);
  private readonly partnerInvites = inject(PartnerInvitesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();

  readonly tournamentId = signal('');

  /** Nome de conta para exibição e para `inviterName` nas callables. */
  readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  readonly myUid = computed(() => this.auth.user()?.uid ?? null);

  // ── leituras ─────────────────────────────────────────────────────────────

  readonly tournament = signal<TournamentSummary | null>(null);
  /** O torneio já foi buscado (com sucesso ou não). O porteiro NÃO decide antes disso. */
  readonly tournamentLoaded = signal(false);
  readonly loadFailed = signal(false);

  readonly profile = signal<MyAthleteProfile | null>(null);
  readonly profileLoaded = signal(false);

  readonly enrolledCounts = signal<ReadonlyMap<string, number>>(new Map());

  readonly myRegistrations = signal<readonly AthleteTournamentRegistration[]>([]);
  /** O listener já emitiu ao menos uma vez.
   *
   *  O porteiro espera por isto: decidir com a lista ainda vazia fazia "retomar o que já
   *  começou" perder para "primeira categoria livre" — o beco sem saída da vaga solo. */
  readonly registrationsLoaded = signal(false);

  readonly sentInvites = signal<readonly SentPartnerInvite[]>([]);
  readonly sentInvitesLoaded = signal(false);

  /** Convites que EU recebi, do store global ao vivo (o convite nasce de um gesto do outro
   *  atleta e pode chegar com a tela já aberta). */
  readonly receivedInvites = computed<TournamentPartnerInvite[]>(() =>
    this.partnerInvites.pending().map(({ invite }) => invite),
  );

  readonly categories = computed<TournamentCategoryOffer[]>(() => this.tournament()?.categories ?? []);

  /** Todas as leituras que o porteiro precisa já resolveram. */
  readonly ready = computed(
    () => this.tournamentLoaded() && this.profileLoaded() && this.registrationsLoaded() && this.sentInvitesLoaded(),
  );

  constructor() {
    // Torneio + contagem de inscritos: uma busca por entrada no fluxo.
    effect(() => {
      const id = this.tournamentId();
      void this.loadTournament(id);
    });

    effect(() => {
      const uid = this.myUid();
      void this.loadProfile(uid);
    });

    // Minhas inscrições neste torneio, AO VIVO: o aceite do parceiro acontece do outro lado e
    // muda a inscrição por baixo da tela (sai o `partnerPending`, entra o pagamento).
    effect((onCleanup) => {
      const tournamentId = this.tournamentId();
      const uid = this.myUid();
      const db = this.firestore;
      const projectId = environment.firebase.projectId;
      if (!db || !projectId || !uid || !tournamentId) {
        this.myRegistrations.set([]);
        // Sem sessão ou sem Firestore não há o que esperar: "resolvido e vazio" é a verdade, e
        // deixar `false` prenderia o porteiro num loader eterno.
        this.registrationsLoaded.set(true);
        return;
      }
      onCleanup(
        watchMyRegistrations(
          db,
          projectId,
          uid,
          (all) => {
            this.myRegistrations.set(all.filter((r) => r.tournamentId === tournamentId));
            this.registrationsLoaded.set(true);
          },
          () => {
            this.myRegistrations.set([]);
            this.registrationsLoaded.set(true);
          },
        ),
      );
    });

    // Convites que eu enviei neste torneio — pendentes, aceitos E recusados. Ver
    // `watchMySentInvites`: os três estados são necessários e o filtro por status na query
    // fazia recusa/cancelamento/expiração chegarem à tela como ausência.
    effect((onCleanup) => {
      const tournamentId = this.tournamentId();
      const uid = this.myUid();
      const db = this.firestore;
      if (!db || !uid || !tournamentId) {
        this.sentInvites.set([]);
        this.sentInvitesLoaded.set(true);
        return;
      }
      onCleanup(
        watchMySentInvites(
          db,
          uid,
          tournamentId,
          (invites) => {
            this.sentInvites.set(invites);
            this.sentInvitesLoaded.set(true);
          },
          () => {
            this.sentInvites.set([]);
            this.sentInvitesLoaded.set(true);
          },
        ),
      );
    });
  }

  // ── consultas por categoria ──────────────────────────────────────────────

  categoryById(categoryId: string | null): TournamentCategoryOffer | null {
    if (!categoryId) return null;
    return this.categories().find((c) => c.id === categoryId) ?? null;
  }

  registrationFor(categoryId: string | null): AthleteTournamentRegistration | null {
    if (!categoryId) return null;
    return this.myRegistrations().find((r) => r.categoryId === categoryId) ?? null;
  }

  registrationById(registrationId: string | null): AthleteTournamentRegistration | null {
    const id = (registrationId ?? '').trim();
    if (!id) return null;
    return this.myRegistrations().find((r) => r.id === id) ?? null;
  }

  receivedInviteFor(categoryId: string | null): TournamentPartnerInvite | null {
    const tournamentId = this.tournamentId();
    if (!categoryId || !tournamentId) return null;
    return (
      this.receivedInvites().find((i) => i.tournamentId === tournamentId && i.categoryId === categoryId) ?? null
    );
  }

  pendingSentInvitesFor(categoryId: string | null): SentPartnerInvite[] {
    if (!categoryId) return [];
    return sentPendingInvitesFor(this.sentInvites(), this.tournamentId(), categoryId);
  }

  /** Vagas ainda livres na categoria. `null` = capacidade desconhecida (sem teto ou contagem
   *  não resolvida) — nunca vira "LOTADO" no escuro. */
  spotsLeftFor(category: TournamentCategoryOffer): number | null {
    if (category.maxTeams <= 0) return null;
    const enrolled = this.enrolledCounts().get(category.id);
    if (enrolled != null) return category.maxTeams - enrolled;
    return category.spotsLeft;
  }

  /** O uniforme do atleta nesta inscrição já está completo para a categoria. */
  uniformCompleteFor(category: TournamentCategoryOffer, registration: AthleteTournamentRegistration | null): boolean {
    if (!categoryRequiresUniform(category)) return true;
    const uid = this.myUid();
    if (!registration || !uid) return false;
    return isUniformSelectionComplete(category, uniformSlotForUid(registration, uid));
  }

  // ── carregamento ─────────────────────────────────────────────────────────

  /** Recarrega tudo que é busca única (o que é listener se corrige sozinho). */
  retry(): void {
    void this.loadTournament(this.tournamentId());
    void this.loadProfile(this.myUid());
  }

  private async loadTournament(id: string): Promise<void> {
    const db = this.firestore;
    if (!db || !id) {
      this.tournament.set(null);
      this.tournamentLoaded.set(true);
      this.loadFailed.set(!!id);
      return;
    }
    this.tournamentLoaded.set(false);
    this.loadFailed.set(false);
    try {
      this.tournament.set(await fetchTournament(db, id));
    } catch {
      this.tournament.set(null);
      this.loadFailed.set(true);
    } finally {
      this.tournamentLoaded.set(true);
    }
    const projectId = environment.firebase.projectId;
    if (projectId) {
      try {
        this.enrolledCounts.set(await fetchCategoryEnrolledCounts(db, projectId, id));
      } catch {
        // Contagem fresca é opcional — o `spotsLeft` do doc segue de fallback.
      }
    }
  }

  private async loadProfile(uid: string | null): Promise<void> {
    const db = this.firestore;
    if (!db || !uid) {
      this.profile.set(null);
      this.profileLoaded.set(true);
      return;
    }
    try {
      this.profile.set(await fetchMyAthleteProfile(db, uid));
    } catch {
      // Sem perfil, a elegibilidade fica permissiva — o backend segue autoritativo. O gate de
      // NÍVEL não usa este valor: ele refaz um fetch fresco e bloqueia se falhar.
      this.profile.set(null);
    } finally {
      this.profileLoaded.set(true);
    }
  }

  /** Perfil FRESCO para o gate de nível.
   *
   *  Campo (não método) para dar um ponto de troca em teste sem bater no Firestore real. A
   *  decisão "já travou?" não pode usar nem o signal `profile` (fica `null` em erro por design)
   *  nem um valor stale — só o resultado atual, awaitado de verdade. Sem sessão OU sem
   *  Firestore é a MESMA falha de resolução: rejeita, quem chama bloqueia — nunca decide no
   *  escuro. */
  fetchLevelGateProfile = (): Promise<MyAthleteProfile | null> => {
    const db = this.firestore;
    const uid = this.myUid();
    if (!db || !uid) return Promise.reject(new Error('Sem sessão ou conexão com o Firestore.'));
    return fetchMyAthleteProfile(db, uid);
  };

  /** Elenco com nome/foto — resolvido de `public_profiles` pelos `participantUids`. */
  async loadRoster(registration: AthleteTournamentRegistration): Promise<RosterMember[]> {
    const db = this.firestore;
    const myUid = this.myUid();
    const captainUid = registration.captainUid ?? registration.player1Id;
    const fallback = registration.participantUids.map((uid) => ({
      uid,
      name: uid === myUid ? 'Você' : 'Atleta',
      photoUrl: null as string | null,
      isCaptain: uid === captainUid,
      isMe: uid === myUid,
    }));
    if (!db) return fallback;
    try {
      const profiles = await fetchPublicProfilesByIds(db, registration.participantUids);
      return registration.participantUids.map((uid) => {
        const profile = profiles.get(uid);
        return {
          uid,
          name: profile?.displayName ?? (uid === myUid ? 'Você' : 'Atleta'),
          photoUrl: profile?.avatarUrl ?? null,
          isCaptain: uid === captainUid,
          isMe: uid === myUid,
        };
      });
    } catch {
      return fallback;
    }
  }

  /** Inscrição criada agora entra na lista otimista: o listener do Firestore entrega o cache
   *  primeiro e a inscrição recém-nascida pode não estar nele — sem isto o passo seguinte
   *  voltaria ao consentimento. */
  addOptimisticRegistration(registration: AthleteTournamentRegistration): void {
    this.myRegistrations.update((list) => (list.some((r) => r.id === registration.id) ? list : [...list, registration]));
  }

  dropRegistration(registrationId: string): void {
    this.myRegistrations.update((list) => list.filter((r) => r.id !== registrationId));
  }

  markInviteAnswered(inviteId: string): void {
    this.partnerInvites.markAnswered(inviteId);
  }

  readonly functions = athleteFunctions;
  readonly hasFirestore = this.firestore != null;
}
