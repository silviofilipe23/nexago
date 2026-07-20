import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ARENA_SPORT_CHIP_OPTIONS, type ArenaSportChip } from '@nexago/arena-discovery';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { levelLabelOf } from '../data/athlete-level';
import { fetchPublicProfilesByIds, type AthletePublicProfile } from '../data/public-profiles-repository';
import { fetchTeamRankingGeneral } from '../data/rankings-repository';
import {
  currentWinStreak,
  fetchMatchesForTeam,
  fetchTeam,
  formatTeamTogetherLabel,
  matchIsCompleted,
  roundShortLabel,
  teamIsLookingForPartner,
  titleTournamentIds,
  type ArenaMatch,
  type ArenaTeam,
} from '../data/teams-repository';
import { fetchTournamentNamesByIds } from '../data/tournaments-repository';
import type { TeamMatchResult, TeamMemberRef, TeamPublicProfile, TeamTitle } from './team-profile.models';

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

function memberRef(profile: AthletePublicProfile | undefined, uid: string): TeamMemberRef {
  return {
    handle: profile ? uid : null,
    fullName: profile?.displayName ?? 'Atleta',
    levelLabel: levelLabelOf(profile?.levelCode ?? null) ?? '—',
  };
}

/** Perfil público de equipe real: `teams/{id}` + `matches` (vitórias/derrotas/sequência/
 *  títulos, tudo derivado do histórico) + `teamRankings` + `public_profiles` dos dois atletas.
 *  Sem "bio"/"disponibilidade" (não existem no schema — removidos em vez de inventados). */
@Component({
  selector: 'app-team-public-profile',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, NxPageLoadingComponent],
  templateUrl: './team-public-profile.component.html',
  styleUrl: './team-public-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPublicProfileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly teamId = computed(() => this.route.snapshot.paramMap.get('teamId') ?? '');
  protected readonly loading = signal(true);
  protected readonly team = signal<TeamPublicProfile | null>(null);

  protected readonly backPath = computed(() => {
    const from = this.route.snapshot.queryParamMap.get('from');
    return from === 'atletas' ? '/atletas' : '/equipes';
  });

  protected readonly actionNotice = signal<string | null>(null);
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const id = this.teamId();
      void this.loadTeam(id);
    });
  }

  private async loadTeam(teamId: string): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId || !teamId) {
      this.team.set(null);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    try {
      const team = await fetchTeam(db, projectId, teamId);
      if (!team || teamIsLookingForPartner(team)) {
        this.team.set(null);
        return;
      }

      const [profiles, matches, generalRanking] = await Promise.all([
        fetchPublicProfilesByIds(db, [team.player1Id, team.player2Id]),
        fetchMatchesForTeam(db, projectId, teamId),
        fetchTeamRankingGeneral(db, projectId),
      ]);
      const rankIndex = generalRanking.findIndex((r) => r.id === teamId);
      const ranking = rankIndex >= 0 ? generalRanking[rankIndex] : null;

      const completed = matches.filter(matchIsCompleted);
      const wins = completed.filter((m) => m.winnerId === teamId).length;
      const titleIds = titleTournamentIds(matches, teamId);
      const tournamentNames = await fetchTournamentNamesByIds(db, [...titleIds, ...completed.slice(0, 8).map((m) => m.tournamentId)]);

      const p1 = profiles.get(team.player1Id);
      const p2 = profiles.get(team.player2Id);

      const titles: TeamTitle[] = titleIds.map((id) => ({ id, name: tournamentNames.get(id) ?? 'Torneio' }));
      const recentMatches: TeamMatchResult[] = completed.slice(0, 8).map((m) => this.matchResult(m, teamId, tournamentNames));

      this.team.set({
        id: team.id,
        teamName: team.teamName ?? `${p1?.displayName?.split(' ')[0] ?? 'Atleta'} / ${p2?.displayName?.split(' ')[0] ?? 'Atleta'}`,
        sport: p1?.sportChip ?? p2?.sportChip ?? 'beachVolleyball',
        level: levelLabelOf(p1?.levelCode ?? p2?.levelCode ?? null),
        city: p1?.city ?? p2?.city ?? '',
        wins,
        losses: completed.length - wins,
        currentStreakWins: currentWinStreak(completed, teamId),
        rankingPosition: rankIndex >= 0 ? rankIndex + 1 : null,
        rankingPoints: ranking?.totalPoints ?? 0,
        togetherSinceLabel: formatTeamTogetherLabel(team.createdAt),
        members: [memberRef(p1, team.player1Id), memberRef(p2, team.player2Id)],
        titles,
        matches: recentMatches,
      });
    } catch {
      this.team.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  private matchResult(match: ArenaMatch, teamId: string, tournamentNames: Map<string, string>): TeamMatchResult {
    const won = match.winnerId === teamId;
    const isTeamA = match.teamAId === teamId;
    const opponent = (isTeamA ? match.teamBDescription : match.teamADescription) ?? 'Adversário';
    const score = match.resultA && match.resultB ? `${match.resultA} / ${match.resultB}` : '—';
    return {
      id: match.id,
      result: won ? 'V' : 'D',
      opponent,
      contextLabel: `${tournamentNames.get(match.tournamentId) ?? 'Torneio'} · ${roundShortLabel(match.matchType)}`,
      score,
      dateLabel: match.matchEndedAt ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(match.matchEndedAt) : '—',
    };
  }

  protected sportLabel(chip: ArenaSportChip): string {
    return ARENA_SPORT_CHIP_OPTIONS.find((o) => o.chip === chip)?.label ?? chip;
  }

  protected pointsLabel(points: number): string {
    return `${new Intl.NumberFormat('pt-BR').format(points)} pts`;
  }

  protected teamInitials(teamName: string): [string, string] {
    const [a, b] = teamName.split('/').map((part) => part.trim());
    const first = (a ?? teamName).slice(0, 2).toUpperCase();
    const second = (b ?? '').slice(0, 2).toUpperCase() || first;
    return [first, second];
  }

  protected sendMessage(): void {
    this.showNotice('Mensagens diretas chegam em breve por aqui.');
  }

  protected challengeTeam(): void {
    const name = this.team()?.teamName ?? 'esta equipe';
    this.showNotice(`Desafio para ${name} chega em breve por aqui.`);
  }

  private showNotice(message: string): void {
    this.actionNotice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.actionNotice.set(null), 4000);
  }
}
