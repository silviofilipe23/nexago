import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import type { TeamMatchRow, TeamProfileView } from './team-profile.models';
import { buildMatchRow, computeRecord, displayNameFrom, initialsFrom, levelLabelForRank, levelRankFromLabel, teamDisplayName } from './teams-logic';
import {
  fetchPublicProfilesLite,
  fetchTeamById,
  fetchTeamMatches,
  fetchTeamRankings,
  fetchTeamsByIds,
  type TeamProfileLite,
} from './teams-repository';

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

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function athleteLevelRank(profile: TeamProfileLite | undefined): number | null {
  const sportId = profile?.primarySportId;
  if (!sportId) return null;
  return levelRankFromLabel(profile?.levelsBySport?.[sportId] ?? null);
}

/** Perfil público real de uma dupla (`teams` + `teamRankings` + `matches` + `public_profiles`),
 *  espelhando `team_public_profile_page.dart` — sem o agrupamento por campanha/head-to-head do
 *  app (lista simples de partidas) e sem bio/conquistas/disponibilidade, que não existem no
 *  dado real (eram conteúdo do mock). Ações de seguir/mensagem/desafiar ficam fora do escopo —
 *  sem backend hoje. */
@Component({
  selector: 'app-team-public-profile',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './team-public-profile.component.html',
  styleUrl: './team-public-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPublicProfileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly teamId = computed(() => this.route.snapshot.paramMap.get('teamId') ?? '');
  protected readonly backPath = computed(() => {
    const from = this.route.snapshot.queryParamMap.get('from');
    return from === 'atletas' ? '/atletas' : '/equipes';
  });

  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly team = signal<TeamProfileView | null>(null);
  protected readonly levelLabel = signal<string | null>(null);

  constructor() {
    effect(() => {
      void this.load(this.teamId());
    });
  }

  protected retry(): void {
    void this.load(this.teamId());
  }

  protected levelLabelForRank = levelLabelForRank;

  private async load(teamId: string): Promise<void> {
    if (!teamId) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.notFound.set(false);
    try {
      const db = createFirestore();
      const projectId = environment.firebase.projectId;
      if (!db || !projectId) throw new Error('Firebase não configurado');

      const team = await fetchTeamById(db, projectId, teamId);
      if (!team) {
        this.notFound.set(true);
        return;
      }

      const [profiles, rankings, matches] = await Promise.all([
        fetchPublicProfilesLite(db, [team.player1Id, team.player2Id].filter((id): id is string => id != null)),
        fetchTeamRankings(db, projectId, [teamId]),
        fetchTeamMatches(db, projectId, teamId),
      ]);

      const opponentIds = [...new Set(matches.map((m) => (m.teamAId === teamId ? m.teamBId : m.teamAId)).filter(Boolean))];
      const opponentTeams = await fetchTeamsByIds(db, projectId, opponentIds);
      const opponentAthleteIds = [...opponentTeams.values()].flatMap((t) => [t.player1Id, t.player2Id]).filter((id): id is string => id != null);
      const opponentProfiles = opponentAthleteIds.length > 0 ? await fetchPublicProfilesLite(db, opponentAthleteIds) : new Map<string, TeamProfileLite>();

      const p1 = team.player1Id ? profiles.get(team.player1Id) : undefined;
      const p2 = team.player2Id ? profiles.get(team.player2Id) : undefined;
      const ranking = rankings.get(teamId);
      const record = computeRecord(matches, teamId);

      const r1 = athleteLevelRank(p1);
      const r2 = athleteLevelRank(p2);
      const teamLevelRank = r1 == null ? r2 : r2 == null ? r1 : Math.max(r1, r2);
      this.levelLabel.set(teamLevelRank != null ? levelLabelForRank(teamLevelRank) : null);

      const matchRows: TeamMatchRow[] = matches.slice(0, 20).map((m) => {
        const opponentId = m.teamAId === teamId ? m.teamBId : m.teamAId;
        const opponentTeam = opponentTeams.get(opponentId);
        const op1 = opponentTeam?.player1Id ? opponentProfiles.get(opponentTeam.player1Id) : undefined;
        const op2 = opponentTeam?.player2Id ? opponentProfiles.get(opponentTeam.player2Id) : undefined;
        const opponentName = opponentTeam ? teamDisplayName(opponentTeam.teamName, op1?.fullName, op2?.fullName) : 'Equipe adversária';
        return buildMatchRow(m, teamId, opponentName);
      });

      this.team.set({
        teamId,
        displayName: teamDisplayName(team.teamName, p1?.fullName, p2?.fullName),
        player1Name: displayNameFrom(p1?.fullName, team.player1Id ?? ''),
        player2Name: displayNameFrom(p2?.fullName, team.player2Id ?? ''),
        player1Initials: team.player1Id ? initialsFrom(p1?.fullName, team.player1Id) : '--',
        player2Initials: team.player2Id ? initialsFrom(p2?.fullName, team.player2Id) : '--',
        city: p1?.city ?? p2?.city ?? null,
        points: ranking?.points ?? 0,
        tournamentsCount: ranking?.tournamentsCount ?? 0,
        wins: record.wins,
        losses: record.losses,
        matches: matchRows,
      });
    } catch {
      this.errorMessage.set('Não foi possível carregar a equipe.');
    } finally {
      this.loading.set(false);
    }
  }
}
