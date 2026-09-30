import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ARENA_SPORT_CHIP_OPTIONS, type ArenaSportChip } from '@nexago/arena-discovery';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { NxToastService } from '../shared/feedback';
import { NxPhotoLightboxComponent } from '../shared/media/nx-photo-lightbox.component';
import { levelLabelOf } from '../data/athlete-level';
import { fetchPublicProfilesByIds, type AthletePublicProfile } from '../data/public-profiles-repository';
import { fetchTeamRankingGeneral } from '../data/rankings-repository';
import {
  currentWinStreak,
  fetchMatchesForTeam,
  fetchTeam,
  fetchTeamsByIds,
  formatTeamTogetherLabel,
  matchIsCompleted,
  teamIsLookingForPartner,
  titleTournamentIds,
  type ArenaTeam,
} from '../data/teams-repository';
import { fetchConfirmedRegistrationsForTeam } from '../data/tournament-registrations-repository';
import { fetchTournamentSummariesByIds } from '../data/tournaments-repository';
import { duoNameOf } from '../profile/public-profile-activity';
import type { TeamMatchResult, TeamMemberRef, TeamPublicProfile, TeamTitle } from './team-profile.models';
import { buildTeamMatchResult, buildTeamTournamentRows } from './team-profile-history';

type HistoryTab = 'partidas' | 'torneios';

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
    avatarUrl: profile?.avatarUrl ?? null,
  };
}

/** Perfil público de equipe real: `teams/{id}` + `matches` (vitórias/derrotas/sequência/
 *  títulos, tudo derivado do histórico) + `teamRankings` + `public_profiles` dos dois atletas.
 *  Sem "bio"/"disponibilidade" (não existem no schema — removidos em vez de inventados). */
@Component({
  selector: 'app-team-public-profile',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, NxPageLoadingComponent, NxPhotoLightboxComponent],
  templateUrl: './team-public-profile.component.html',
  styleUrl: './team-public-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPublicProfileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(NxToastService);
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
  protected readonly historyTab = signal<HistoryTab>('partidas');
  /** `null` = lightbox fechado. Objeto (e não índice) pra `@if` aceitar o 0. */
  protected readonly viewerIndex = signal<{ value: number } | null>(null);

  protected readonly memberPhotos = computed(() =>
    (this.team()?.members ?? [])
      .map((m) => m.avatarUrl?.trim() ?? '')
      .filter((url) => url.length > 0),
  );

  protected readonly memberPhotoAlt = computed(() => {
    const name = this.team()?.teamName?.trim();
    return name ? `Fotos da dupla ${name}` : 'Fotos da dupla';
  });

  /** Origem do link, pra "Voltar" devolver o atleta à tela de onde ele veio. */
  protected readonly origin = computed(() => {
    const from = this.route.snapshot.queryParamMap.get('from');
    if (from === 'ranking') return { path: '/ranking', label: 'ranking' };
    if (from === 'atletas') return { path: '/atletas', label: 'atletas' };
    return { path: '/equipes', label: 'equipes' };
  });


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

      const [profiles, matches, generalRanking, registrations] = await Promise.all([
        fetchPublicProfilesByIds(db, [team.player1Id, team.player2Id]),
        fetchMatchesForTeam(db, projectId, teamId),
        fetchTeamRankingGeneral(db, projectId),
        // Sem as inscrições a aba Torneios ainda mostra os torneios onde a equipe jogou.
        fetchConfirmedRegistrationsForTeam(db, projectId, teamId).catch(() => []),
      ]);
      const rankIndex = generalRanking.findIndex((r) => r.id === teamId);
      const ranking = rankIndex >= 0 ? generalRanking[rankIndex] : null;

      const completed = matches.filter(matchIsCompleted);
      const wins = completed.filter((m) => m.winnerId === teamId).length;
      const titleIds = titleTournamentIds(matches, teamId);
      const recent = completed.slice(0, 8);

      // O adversário é resolvido pelo id: o `teamXDescription` da partida é o apelido da VAGA na
      // chave ("Vencedor Jogo #5", "1º Grupo A"), não quem jogou. Falha aqui só tira os nomes.
      const opponentIds = recent.map((m) => (m.teamAId === teamId ? m.teamBId : m.teamAId));
      const [tournaments, opponentTeams] = await Promise.all([
        fetchTournamentSummariesByIds(db, [...matches.map((m) => m.tournamentId), ...registrations.map((r) => r.tournamentId)]),
        fetchTeamsByIds(db, projectId, opponentIds).catch(() => new Map<string, ArenaTeam>()),
      ]);
      const opponentProfiles = await fetchPublicProfilesByIds(
        db,
        [...opponentTeams.values()].flatMap((t) => [t.player1Id, t.player2Id]),
      ).catch(() => new Map<string, AthletePublicProfile>());
      const tournamentNames = new Map([...tournaments].map(([id, t]) => [id, t.name]));
      const opponentName = (id: string, fallback: string | null) => duoNameOf(id, opponentTeams, opponentProfiles, fallback);

      const p1 = profiles.get(team.player1Id);
      const p2 = profiles.get(team.player2Id);

      const titles: TeamTitle[] = titleIds.map((id) => ({ id, name: tournamentNames.get(id) ?? 'Torneio' }));
      const recentMatches: TeamMatchResult[] = recent.map((m) => buildTeamMatchResult(m, teamId, tournamentNames, opponentName));

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
        tournaments: buildTeamTournamentRows({ teamId, registrations, matches, tournaments }),
      });
    } catch {
      this.team.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  protected setHistoryTab(tab: HistoryTab): void {
    this.historyTab.set(tab);
  }

  protected openMemberPhoto(memberIndex: number): void {
    const members = this.team()?.members ?? [];
    if (!members[memberIndex]?.avatarUrl?.trim()) return;
    const start = members.slice(0, memberIndex).filter((m) => m.avatarUrl?.trim()).length;
    this.viewerIndex.set({ value: start });
  }

  protected closeViewer(): void {
    this.viewerIndex.set(null);
  }

  protected sportLabel(chip: ArenaSportChip): string {
    return ARENA_SPORT_CHIP_OPTIONS.find((o) => o.chip === chip)?.label ?? chip;
  }

  protected pointsLabel(points: number): string {
    return `${new Intl.NumberFormat('pt-BR').format(points)} pts`;
  }

  protected sendMessage(): void {
    this.toasts.info('Mensagens diretas ainda não estão no ar', 'Avisamos por aqui assim que a conversa entre equipes for liberada.');
  }

  protected challengeTeam(): void {
    const name = this.team()?.teamName ?? 'esta equipe';
    this.toasts.info('Desafios ainda não estão no ar', `Assim que liberarmos, você vai poder desafiar ${name} por aqui.`);
  }
}
