import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { watchMyPendingPartnerInvites, type TournamentPartnerInvite } from './tournament-registrations-repository';
import { fetchTournamentSummariesByIds, type TournamentSummary } from './tournaments-repository';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** Convite pendente com o torneio já resolvido: quem mostra convite precisa do nome e das
 *  categorias, nunca só do doc cru. */
export interface PendingPartnerInvite {
  invite: TournamentPartnerInvite;
  tournament: TournamentSummary | null;
}

/** O que conta como convite pendente para TODAS as telas. Convite de torneio cancelado é botão
 *  que só entrega erro (`acceptTournamentPartnerInvite` recusa com "Este torneio não aceita
 *  novas inscrições"); torneio que não resolveu (fetch parcial) continua aparecendo com o nome
 *  genérico — sumir seria pior que mostrar "Torneio". */
export function pendingInvitesView(
  invites: readonly TournamentPartnerInvite[],
  tournaments: ReadonlyMap<string, TournamentSummary>,
  answered: ReadonlySet<string>,
): PendingPartnerInvite[] {
  return invites
    .filter((invite) => !answered.has(invite.id))
    .filter((invite) => tournaments.get(invite.tournamentId)?.isCancelled !== true)
    .map((invite) => ({ invite, tournament: tournaments.get(invite.tournamentId) ?? null }));
}

/** Convites de parceiro recebidos, ao vivo e compartilhados pelas quatro telas que os mostram
 *  (badge do shell, card do painel, "Precisa de você" da Agenda e a própria inscrição).
 *
 *  Um store só, e não uma busca por tela, por dois motivos: o convite nasce de um gesto do
 *  OUTRO atleta — sem listener ele só aparecia no próximo carregamento da tela — e a contagem
 *  do badge tem de bater com a lista dos cards sempre, não "quase sempre". */
@Injectable({ providedIn: 'root' })
export class PartnerInvitesService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly invites = signal<readonly TournamentPartnerInvite[]>([]);
  private readonly tournaments = signal<ReadonlyMap<string, TournamentSummary>>(new Map());
  /** Respondidos nesta sessão (aceitar/recusar): tira o convite da tela no gesto, sem esperar
   *  o snapshot do novo `status` chegar. Só cresce — o convite respondido não volta. */
  private readonly answered = signal<ReadonlySet<string>>(new Set<string>());

  readonly pending = computed<PendingPartnerInvite[]>(() =>
    pendingInvitesView(this.invites(), this.tournaments(), this.answered()),
  );

  readonly pendingCount = computed(() => this.pending().length);

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      const db = this.firestore;
      if (!uid || !db) {
        this.invites.set([]);
        return;
      }

      const stop = watchMyPendingPartnerInvites(
        db,
        uid,
        (invites) => {
          this.invites.set(invites);
          void this.resolveTournaments(db, invites);
        },
        // Convite é enriquecimento da tela: falha do listener não pode virar erro de página.
        () => this.invites.set([]),
      );
      onCleanup(stop);
    });
  }

  /** Convite aceito/recusado por esta sessão. */
  markAnswered(inviteId: string): void {
    this.answered.update((current) => new Set(current).add(inviteId));
  }

  /** Busca só os torneios que ainda não estão no mapa — o listener reemite a cada mudança de
   *  convite e não pode virar uma releitura da coleção de torneios a cada emissão. */
  private async resolveTournaments(db: Firestore, invites: readonly TournamentPartnerInvite[]): Promise<void> {
    const known = this.tournaments();
    const missing = [...new Set(invites.map((i) => i.tournamentId).filter((id) => id && !known.has(id)))];
    if (missing.length === 0) return;
    try {
      const fetched = await fetchTournamentSummariesByIds(db, missing);
      if (fetched.size === 0) return;
      this.tournaments.update((current) => new Map([...current, ...fetched]));
    } catch {
      // Sem o torneio o convite ainda aparece (nome genérico); sumir seria pior.
    }
  }
}
