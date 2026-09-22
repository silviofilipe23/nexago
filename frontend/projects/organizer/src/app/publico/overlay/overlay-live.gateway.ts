import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from '../../painel/data/firestore';
import { watchMatch, type TournamentMatch } from '../../painel/data/matches-repository';
import { fetchTeamNames } from '../../painel/data/teams-repository';
import type { OrganizerTournament } from '../../painel/data/tournament.model';
import { watchTournament } from '../../painel/data/tournaments-repository';
import { overlayTeamIdsOf } from './overlay-selectors';

/** Costura entre a tela do overlay e o Firestore.
 *
 *  Existe como classe própria por dois motivos: assinar `onSnapshot` dentro do componente
 *  derruba o Karma, e a tela precisa de um dublê no spec. SEM `providedIn` — a página provê a
 *  própria instância e os listeners morrem com ela.
 *
 *  Regra de transmissão embutida aqui: erro de rede NÃO limpa o estado. Se a conexão cai no
 *  meio do jogo, o último placar conhecido continua no ar em vez de o overlay sumir. */
@Injectable()
export class OverlayLiveGateway {
  readonly match = signal<TournamentMatch | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(null);
  readonly teamLabels = signal<ReadonlyMap<string, string>>(new Map<string, string>());

  private readonly hydrated = new Set<string>();

  start(matchId: string): () => void {
    let unsubTournament: (() => void) | null = null;
    let watchedTournamentId: string | null = null;

    const unsubMatch = watchMatch(
      matchId,
      (m) => {
        this.match.set(m);
        if (!m) return;
        void this.hydrateTeams(m);
        if (m.tournamentId && m.tournamentId !== watchedTournamentId) {
          watchedTournamentId = m.tournamentId;
          unsubTournament?.();
          unsubTournament = watchTournament(
            m.tournamentId,
            (t) => this.tournament.set(t),
            () => {},
          );
        }
      },
      () => {},
    );

    return () => {
      unsubMatch();
      unsubTournament?.();
    };
  }

  private async hydrateTeams(match: TournamentMatch): Promise<void> {
    const ids = overlayTeamIdsOf(match).filter((id) => !this.hydrated.has(id));
    if (ids.length === 0) return;
    for (const id of ids) this.hydrated.add(id); // marca antes: rajada de snapshots não duplica busca
    const projectId = environment.firebase.projectId;
    if (!projectId) return;
    try {
      const names = await fetchTeamNames(organizerFirestore(), projectId, ids);
      this.teamLabels.update((current) => {
        const next = new Map(current);
        for (const [teamId, name] of names) next.set(teamId, name);
        return next;
      });
    } catch {
      // Falha de rede: segue com o rótulo do doc e tenta de novo no próximo snapshot.
      for (const id of ids) this.hydrated.delete(id);
    }
  }
}
