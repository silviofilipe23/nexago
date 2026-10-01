import { effect, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { DEFAULT_BROADCAST_CONTROL, type BroadcastControl } from '../data/broadcast-control';
import { saveBroadcastControl, watchBroadcastControl, type BroadcastControlPatch } from '../data/broadcast-control-repository';
import { organizerFirestore } from '../data/firestore';
import { watchMatches, type TournamentMatch } from '../data/matches-repository';
import { fetchProfileDisplays, fetchTeamsByIds } from '../data/teams-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { watchTournament } from '../data/tournaments-repository';
import { rosterOf, rosterUidsOf, teamIdsOfMatch, type TeamRoster } from './transmissao-selectors';

/** Estado ao vivo da tela Transmissão: doc do torneio, partidas, controle e os elencos (nome e
 *  foto por atleta, pra tarja). SEM `providedIn` — a tela provê a própria instância, os
 *  listeners morrem com ela, e o spec troca por um dublê. */
@Injectable()
export class TransmissaoDataService {
  private readonly auth = inject(AuthService);

  readonly tournamentId = signal<string | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(null);
  readonly matches = signal<TournamentMatch[]>([]);
  readonly control = signal<BroadcastControl>(DEFAULT_BROADCAST_CONTROL);
  readonly rosters = signal<ReadonlyMap<string, TeamRoster>>(new Map());
  /** Última escrita recusada/sem rede. A chave volta sozinha (o listener devolve o valor real). */
  readonly saveError = signal(false);

  private generation = 0;
  private readonly hydrated = new Set<string>();

  constructor() {
    effect((onCleanup) => {
      const id = this.tournamentId();
      this.generation++;
      this.tournament.set(null);
      this.matches.set([]);
      this.control.set(DEFAULT_BROADCAST_CONTROL);
      this.rosters.set(new Map());
      this.hydrated.clear();
      if (!id) return;
      const unsubTournament = watchTournament(id, (t) => this.tournament.set(t), () => {});
      const unsubMatches = watchMatches(
        id,
        (ms) => {
          this.matches.set(ms);
          void this.hydrate(ms, this.generation);
        },
        () => {},
      );
      const unsubControl = watchBroadcastControl(id, (c) => this.control.set(c), () => {});
      onCleanup(() => {
        unsubTournament();
        unsubMatches();
        unsubControl();
      });
    });
  }

  async save(patch: BroadcastControlPatch): Promise<void> {
    const id = this.tournamentId();
    const uid = this.auth.user()?.uid;
    if (!id || !uid) return;
    try {
      await saveBroadcastControl(id, patch, uid);
      this.saveError.set(false);
    } catch {
      this.saveError.set(true);
    }
  }

  private async hydrate(matches: TournamentMatch[], generation: number): Promise<void> {
    const ids = [...new Set(matches.flatMap(teamIdsOfMatch))].filter((id) => !this.hydrated.has(id));
    if (ids.length === 0) return;
    for (const id of ids) this.hydrated.add(id); // marca antes: snapshots em rajada não duplicam busca
    const projectId = environment.firebase.projectId;
    if (!projectId) return;
    try {
      const db = organizerFirestore();
      const teams = await fetchTeamsByIds(db, projectId, ids);
      const profiles = await fetchProfileDisplays(db, [...teams.values()].flatMap(rosterUidsOf));
      if (generation !== this.generation) return;
      this.rosters.update((current) => {
        const next = new Map(current);
        for (const [teamId, team] of teams) next.set(teamId, rosterOf(team, profiles));
        return next;
      });
    } catch {
      if (generation === this.generation) for (const id of ids) this.hydrated.delete(id);
    }
  }
}
