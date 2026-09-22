import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from '../../painel/data/firestore';
import { isKingOfCourtMatchType, normalizeMatchType } from '../../painel/data/koc';
import { listMatches, watchMatch, type TournamentMatch } from '../../painel/data/matches-repository';
import { fetchProfileDisplays, fetchTeamsByIds } from '../../painel/data/teams-repository';
import type { OrganizerTournament } from '../../painel/data/tournament.model';
import { watchTournament } from '../../painel/data/tournaments-repository';
import { overlayTeamIdsOf } from './overlay-selectors';

export interface OverlayTeam {
  label: string;
  players: [string, string];
}

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
  readonly teams = signal<ReadonlyMap<string, OverlayTeam>>(new Map<string, OverlayTeam>());
  /** Total de rodadas da fase, pro "Rodada 3/7" do KOTC. Zero = não foi possível contar, e a
   *  faixa simplesmente omite o total. Contado UMA vez, não é listener. */
  readonly totalRounds = signal(0);

  private readonly hydrated = new Set<string>();
  private countedRounds = false;

  start(matchId: string): () => void {
    let unsubTournament: (() => void) | null = null;
    let watchedTournamentId: string | null = null;

    const unsubMatch = watchMatch(
      matchId,
      (m) => {
        this.match.set(m);
        if (!m) return;
        void this.hydrateTeams(m);
        void this.countRounds(m);
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

  /** Nome POR ATLETA, não só o rótulo combinado: a faixa do KOTC desenha uma linha por atleta.
   *  Mesmo join que o telão faz (`teams` → `public_profiles`). */
  private async hydrateTeams(match: TournamentMatch): Promise<void> {
    const ids = overlayTeamIdsOf(match).filter((id) => !this.hydrated.has(id));
    if (ids.length === 0) return;
    for (const id of ids) this.hydrated.add(id); // marca antes: rajada de snapshots não duplica busca
    const projectId = environment.firebase.projectId;
    if (!projectId) return;
    try {
      const db = organizerFirestore();
      const teams = await fetchTeamsByIds(db, projectId, ids);
      const playerIds = [...teams.values()]
        .flatMap((t) => [t.player1Id, t.player2Id])
        .filter((id) => id !== '');
      const profiles = await fetchProfileDisplays(db, playerIds);
      this.teams.update((current) => {
        const next = new Map(current);
        for (const [teamId, team] of teams) {
          // Ordem dos SLOTS (`player1Id`, `player2Id`) — é a ordem que a dupla usa em quadra.
          const players: [string, string] = [
            profiles.get(team.player1Id)?.name ?? '',
            profiles.get(team.player2Id)?.name ?? '',
          ];
          const named = players.filter((n) => n !== '');
          next.set(teamId, {
            label: team.teamName ?? (named.length > 0 ? named.join(' / ') : ''),
            players,
          });
        }
        return next;
      });
    } catch {
      // Falha de rede: segue com o rótulo do doc e tenta de novo no próximo snapshot.
      for (const id of ids) this.hydrated.delete(id);
    }
  }

  /** Quantas rodadas tem a fase — uma leitura só, no primeiro snapshot KOTC. O doc da partida
   *  não guarda esse total, e um listener a mais numa transmissão de horas não se paga. */
  private async countRounds(match: TournamentMatch): Promise<void> {
    if (this.countedRounds || !isKingOfCourtMatchType(match.matchType)) return;
    this.countedRounds = true;
    try {
      const all = await listMatches(match.tournamentId);
      const phase = normalizeMatchType(match.matchType);
      this.totalRounds.set(
        all.filter(
          (m) => m.categoryId === match.categoryId && normalizeMatchType(m.matchType) === phase,
        ).length,
      );
    } catch {
      this.countedRounds = false; // tenta de novo no próximo snapshot
    }
  }
}
