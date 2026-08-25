import { effect, Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { organizerFirestore } from '../painel/data/firestore';
import { watchMatches, type TournamentMatch } from '../painel/data/matches-repository';
import { fetchTeamNames } from '../painel/data/teams-repository';
import type { OrganizerTournament } from '../painel/data/tournament.model';
import { watchTournament } from '../painel/data/tournaments-repository';

/** Estado da página pública `/t/:tournamentId`: dois listeners, nas duas coleções que as
 *  rules abrem para qualquer um (`tournaments` e `artifacts/{appId}/public/data/matches`), mais
 *  a hidratação incremental do nome real das duplas (`teams` → `public_profiles`).
 *
 *  `public_profiles` passou a ter leitura pública nas rules (`allow read: if true`) exatamente
 *  para isto: sem ela, a página só teria o rótulo cru do doc da partida (`"Vencedor Jogo #25"`)
 *  mesmo quando a dupla já está definida. Hidratação é best-effort — falha de rede/permissão
 *  cai no rótulo do doc e tenta de novo no próximo snapshot (ver `hydrateTeamLabels`).
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
  /** Rótulo real de cada dupla (`teams` → `public_profiles`), hidratado a partir dos ids das
   *  partidas. Vazio até a primeira resposta: a página cai no label do doc da partida. */
  readonly teamLabels = signal<ReadonlyMap<string, string>>(new Map());

  /** Invalida hidratações em voo quando o torneio muda — resposta velha não pode pintar o
   *  mapa do torneio novo. */
  private generation = 0;
  private readonly hydrated = new Set<string>();

  constructor() {
    effect((onCleanup) => {
      const id = this.tournamentId();
      this.generation++;
      this.tournament.set(null);
      this.matches.set([]);
      this.teamLabels.set(new Map());
      this.hydrated.clear();
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
          void this.hydrateTeamLabels(ms, this.generation);
        },
        () => this.error.set(true),
      );

      onCleanup(() => {
        unsubTournament();
        unsubMatches();
      });
    });
  }

  private async hydrateTeamLabels(matches: TournamentMatch[], generation: number): Promise<void> {
    const ids = [...new Set(matches.flatMap((m) => [m.teamAId, m.teamBId]))].filter(
      (id) => id.length > 0 && !this.hydrated.has(id),
    );
    if (ids.length === 0) return;
    for (const id of ids) this.hydrated.add(id); // marca antes: snapshots em rajada não duplicam fetch
    try {
      const projectId = environment.firebase.projectId;
      if (!projectId) return;
      const names = await fetchTeamNames(organizerFirestore(), projectId, ids);
      if (generation !== this.generation) return;
      this.teamLabels.update((current) => {
        const next = new Map(current);
        for (const [teamId, label] of names) next.set(teamId, label);
        return next;
      });
    } catch {
      // Falha de rede/permissão: fica no label do doc e tenta de novo no próximo snapshot.
      if (generation === this.generation) for (const id of ids) this.hydrated.delete(id);
    }
  }
}
