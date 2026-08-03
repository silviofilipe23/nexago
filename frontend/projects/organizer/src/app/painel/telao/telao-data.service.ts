import { effect, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from '../data/firestore';
import { watchMatches, type TournamentMatch } from '../data/matches-repository';
import { initialsOf } from '../data/mock-data';
import { fetchProfileDisplays, fetchTeamsByIds, type OrganizerTeamPlayers, type ProfileDisplay } from '../data/teams-repository';
import { watchTournament } from '../data/tournaments-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { teamShortLabel } from './telao-selectors';
import { nextStreakOf, type TeamStreak } from './telao-streaks';

/** Dupla resolvida pro telão: rótulo completo, curto ("Lucas / Paula"), sublinha com os nomes
 *  inteiros e avatares (foto quando o perfil tem). */
export interface TelaoTeamDisplay {
  label: string;
  short: string;
  sub: string | null;
  players: { initials: string; photoUrl: string | null }[];
}

/** Enquanto `teams`/`public_profiles` não respondem, o card usa a descrição do slot
 *  ("Vencedor Jogo #1") ou "A definir" que veio no doc da partida. */
export function fallbackTeamDisplay(label: string): TelaoTeamDisplay {
  return { label, short: teamShortLabel(label), sub: null, players: [] };
}

function buildTeamDisplay(team: OrganizerTeamPlayers, profiles: ReadonlyMap<string, ProfileDisplay>): TelaoTeamDisplay | null {
  const p1 = team.player1Id ? profiles.get(team.player1Id) : undefined;
  const p2 = team.player2Id && team.player2Id !== team.player1Id ? profiles.get(team.player2Id) : undefined;
  const names = [p1?.name, p2?.name].filter((n): n is string => !!n);
  const label = team.teamName ?? (names.length > 0 ? names.join(' / ') : null);
  if (!label) return null;
  return {
    label,
    short: teamShortLabel(label),
    sub: names.length > 0 ? names.join(' · ') : null,
    players: [p1, p2].filter((p): p is ProfileDisplay => !!p).map((p) => ({ initials: initialsOf(p.name), photoUrl: p.photoUrl })),
  };
}

/** Estado ao vivo do telão — 2 listeners (doc do torneio + partidas do torneio) e a
 *  hidratação incremental de nomes/fotos (`teams` → `public_profiles`). SEM `providedIn`:
 *  cada página host (config ou TV) provê a própria instância e os listeners morrem com ela. */
@Injectable()
export class TelaoDataService {
  readonly tournamentId = signal<string | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(null);
  readonly matches = signal<TournamentMatch[]>([]);
  readonly teams = signal<ReadonlyMap<string, TelaoTeamDisplay>>(new Map());
  /** Sequência de pontos seguidos por partida ao vivo ("em chamas") — derivada dos deltas
   *  entre snapshots, ver `telao-streaks.ts`. */
  readonly streaks = signal<ReadonlyMap<string, TeamStreak>>(new Map());
  /** Algum snapshot já chegou nesta transmissão (vira o "TRANSMITINDO" do preview). */
  readonly connected = signal(false);
  readonly error = signal(false);

  /** Invalida hidratações em voo quando o evento muda — resposta velha não pode pintar o
   *  mapa do evento novo. */
  private generation = 0;
  private readonly hydrated = new Set<string>();

  constructor() {
    effect((onCleanup) => {
      const id = this.tournamentId();
      this.generation++;
      this.tournament.set(null);
      this.matches.set([]);
      this.teams.set(new Map());
      this.streaks.set(new Map());
      this.hydrated.clear();
      this.connected.set(false);
      this.error.set(false);
      if (!id) return;
      const unsubTournament = watchTournament(
        id,
        (t) => {
          this.tournament.set(t);
          this.connected.set(true);
          this.error.set(false);
        },
        () => this.error.set(true),
      );
      const unsubMatches = watchMatches(
        id,
        (ms) => {
          this.matches.set(ms);
          this.updateStreaks(ms);
          this.connected.set(true);
          this.error.set(false);
          void this.hydrateTeams(ms, this.generation);
        },
        () => this.error.set(true),
      );
      onCleanup(() => {
        unsubTournament();
        unsubMatches();
      });
    });
  }

  private updateStreaks(matches: TournamentMatch[]): void {
    const next = new Map<string, TeamStreak>();
    const prevMap = this.streaks();
    for (const m of matches) {
      const streak = nextStreakOf(prevMap.get(m.id) ?? null, m);
      if (streak) next.set(m.id, streak);
    }
    this.streaks.set(next);
  }

  private async hydrateTeams(matches: TournamentMatch[], generation: number): Promise<void> {
    const ids = [...new Set(matches.flatMap((m) => [m.teamAId, m.teamBId]))].filter((id) => id.length > 0 && !this.hydrated.has(id));
    if (ids.length === 0) return;
    for (const id of ids) this.hydrated.add(id); // marca antes: snapshots em rajada não duplicam fetch
    try {
      const db = organizerFirestore();
      const projectId = environment.firebase.projectId;
      if (!projectId) return;
      const teams = await fetchTeamsByIds(db, projectId, ids);
      const playerIds = [...teams.values()].flatMap((t) => [t.player1Id, t.player2Id]).filter((x) => x.length > 0);
      const profiles = await fetchProfileDisplays(db, playerIds);
      if (generation !== this.generation) return;
      this.teams.update((current) => {
        const next = new Map(current);
        for (const [teamId, team] of teams) {
          const display = buildTeamDisplay(team, profiles);
          if (display) next.set(teamId, display);
        }
        return next;
      });
    } catch {
      // Falha de rede: fica no fallback e tenta de novo no próximo snapshot.
      if (generation === this.generation) for (const id of ids) this.hydrated.delete(id);
    }
  }
}
