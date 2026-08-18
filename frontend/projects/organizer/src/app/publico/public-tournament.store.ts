import { effect, Injectable, signal } from '@angular/core';
import { watchMatches, type TournamentMatch } from '../painel/data/matches-repository';
import type { OrganizerTournament } from '../painel/data/tournament.model';
import { watchTournament } from '../painel/data/tournaments-repository';

/** Estado da página pública `/t/:tournamentId`: dois listeners, nas duas coleções que as
 *  rules abrem para qualquer um (`tournaments` e `artifacts/{appId}/public/data/matches`).
 *
 *  **Não hidrata perfis de propósito.** `public_profiles` exige `request.auth != null`, então
 *  deslogado cada snapshot viraria uma rajada de leituras negadas; os nomes das duplas já vêm
 *  em `team1Label`/`team2Label` no doc da partida. Consequência aceita: sem fotos.
 *
 *  SEM `providedIn` — a página provê a própria instância e os listeners morrem com ela. */
@Injectable()
export class PublicTournamentStore {
  readonly tournamentId = signal<string | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(null);
  readonly matches = signal<TournamentMatch[]>([]);
  readonly loading = signal(true);
  /** Doc inexistente (link errado ou torneio apagado) — diferente de erro de leitura. */
  readonly notFound = signal(false);
  readonly error = signal(false);

  constructor() {
    effect((onCleanup) => {
      const id = this.tournamentId();
      this.tournament.set(null);
      this.matches.set([]);
      this.loading.set(true);
      this.notFound.set(false);
      this.error.set(false);
      if (!id) return;

      const unsubTournament = watchTournament(
        id,
        (t) => {
          this.tournament.set(t);
          this.notFound.set(t === null);
          this.loading.set(false);
          this.error.set(false);
        },
        () => {
          this.error.set(true);
          this.loading.set(false);
        },
      );
      const unsubMatches = watchMatches(
        id,
        (ms) => {
          this.matches.set(ms);
          this.error.set(false);
        },
        () => this.error.set(true),
      );

      onCleanup(() => {
        unsubTournament();
        unsubMatches();
      });
    });
  }
}
