import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { fetchPublicProfilesByIds, type AthletePublicProfile } from '../data/public-profiles-repository';
import { fetchLeague, fetchLeagueTeamRanking, type League, type LeagueRankingRow as RepoRankingRow } from '../data/leagues-repository';
import { fetchTeamsByIds, fetchTeamsForAthlete, type ArenaTeam } from '../data/teams-repository';
import { fetchTournamentSummariesByIds, tournamentListingStatus, type TournamentSummary } from '../data/tournaments-repository';
import type { LeagueDetailData, LeagueRankingRow, LeagueStage, LeagueStageStatus } from './league-detail.models';

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

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function countingModeLabel(mode: League['countingStagesMode']): string {
  switch (mode) {
    case 'all_stages':
      return 'Soma todas as etapas';
    case 'best_3_of_5':
      return 'Melhores 3 de 5 etapas';
    default:
      return 'Melhores 4 de 6 etapas';
  }
}

function stageStatusOf(tournament: TournamentSummary | undefined, now: Date): LeagueStageStatus {
  if (!tournament) return 'upcoming';
  const status = tournamentListingStatus(tournament, now);
  if (status === 'ended') return 'finished';
  if (status === 'live') return 'next';
  return 'upcoming';
}

/** Detalhe de liga real: `leagues/{id}` + torneios reais referenciados pelas etapas
 *  (`stage.tournamentIds`) + ranking materializado (`leagueTeamRankings`). Não existe "status da
 *  etapa" salvo — é derivado do status do torneio referenciado, igual ao Flutter. Sem
 *  organizador verificado (não existe essa flag em lugar nenhum — só `organizationName`). */
@Component({
  selector: 'app-league-detail-shell',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, NxPageLoadingComponent],
  templateUrl: './league-detail-shell.component.html',
  styleUrl: './league-detail-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeagueDetailShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly leagueId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  protected readonly loading = signal(true);
  protected readonly league = signal<LeagueDetailData | null>(null);
  protected readonly notice = signal<string | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.noticeTimeout));
    effect(() => {
      const id = this.leagueId();
      void this.loadLeague(id);
    });
  }

  private async loadLeague(id: string): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId || !id) {
      this.league.set(null);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const league = await fetchLeague(db, id);
      if (!league) {
        this.league.set(null);
        return;
      }

      const sortedStages = [...league.stages].sort((a, b) => a.order - b.order);
      const stageTournamentIds = sortedStages.map((s) => s.tournamentIds[0]).filter((tid): tid is string => !!tid);
      const tournaments = await fetchTournamentSummariesByIds(db, stageTournamentIds);

      const now = new Date();
      let sawNext = false;
      const stages: LeagueStage[] = sortedStages.map((stage) => {
        const tournamentId = stage.tournamentIds[0] ?? null;
        const tournament = tournamentId ? tournaments.get(tournamentId) : undefined;
        let status = stageStatusOf(tournament, now);
        if (status === 'upcoming' && !sawNext) {
          status = 'next';
          sawNext = true;
        }
        return {
          id: stage.id,
          order: stage.order,
          name: stage.name,
          city: tournament?.city ?? league.city ?? '',
          dateLabel: stage.dateLabel ?? (tournament?.startAt ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(tournament.startAt) : 'Data a confirmar'),
          status,
          placement: null,
          points: null,
          tournamentId,
        };
      });

      const teamRanking = await fetchLeagueTeamRanking(db, projectId, id, null, league.countingStagesMode);
      const teamIds = teamRanking.map((r) => r.refId);
      const teams = await fetchTeamsByIds(db, projectId, teamIds);
      const profileIds = [...teams.values()].flatMap((t) => [t.player1Id, t.player2Id]);
      const profiles = await fetchPublicProfilesByIds(db, profileIds);

      const uid = this.auth.user()?.uid ?? null;
      let myTeamIds: ReadonlySet<string> = new Set();
      if (uid) {
        const myTeams = await fetchTeamsForAthlete(db, projectId, uid);
        myTeamIds = new Set(myTeams.map((t) => t.id));
      }

      const stageTournamentOrder = stages.map((s) => s.tournamentId);
      const ranking: LeagueRankingRow[] = teamRanking.map((r) => this.rankingRowFrom(r, teams, profiles, myTeamIds, stageTournamentOrder));
      const myRow = ranking.find((r) => r.isViewer) ?? null;
      const myRepoRow = teamRanking.find((r) => myTeamIds.has(r.refId)) ?? null;
      if (myRepoRow) {
        for (const stage of stages) {
          if (stage.status !== 'finished' || !stage.tournamentId) continue;
          const result = myRepoRow.stageResults.find((sr) => sr.tournamentId === stage.tournamentId);
          if (result) {
            stage.points = result.points;
            stage.placement = result.place;
          }
        }
      }
      const nextStage = stages.find((s) => s.status === 'next') ?? null;

      const prizeTotal = 0; // sem campo de prêmio agregado no schema de liga — fica pro detalhe do torneio da etapa
      const cheapestFee = [...tournaments.values()].flatMap((t) => t.categories.map((c) => c.entryFee)).filter((v) => v > 0);
      const nextStageTournament = nextStage?.tournamentId ? tournaments.get(nextStage.tournamentId) : undefined;
      const nextStageFees = (nextStageTournament?.categories ?? []).map((c) => c.entryFee).filter((v) => v > 0);

      this.league.set({
        id: league.id,
        name: league.name,
        statusLabel: this.leagueStatusLabel(league, stages, now),
        formatLabel: `LIGA · ${league.plannedStagesCount ?? league.stages.length} ETAPAS`,
        citiesSummary: [league.city, league.state].filter((v) => v).join(', ') || 'Cidade a confirmar',
        periodLabel: league.seasonLabel ?? this.periodLabelFrom(league) ?? 'Temporada atual',
        aboutText: league.description,
        yourRank: myRow?.rank ?? null,
        yourDuoName: myRow?.duoName ?? null,
        yourPoints: myRow?.total ?? null,
        nextStageLabel: nextStage?.name ?? null,
        stages,
        stagesCompletedLabel: `${stages.filter((s) => s.status === 'finished').length}/${stages.length} etapas concluídas`,
        ranking,
        prizeTotalLabel: prizeTotal > 0 ? formatBRL(prizeTotal) : null,
        nextStagePriceLabel: nextStageFees.length > 0 ? formatBRL(Math.min(...nextStageFees)) : null,
        nextStageTournamentId: nextStage?.tournamentId ?? null,
        categoriesLabel: league.categories.length > 0 ? league.categories.map((c) => c.categoryName).join(', ') : null,
        rankingCalcLabel: countingModeLabel(league.countingStagesMode),
        priceLabel: cheapestFee.length > 0 ? `a partir de ${formatBRL(Math.min(...cheapestFee))}` : null,
        organizerName: league.organizationName ?? 'Organizador da liga',
        organizerInitials: (league.organizationName ?? 'OL').slice(0, 2).toUpperCase(),
      });
    } finally {
      this.loading.set(false);
    }
  }

  private rankingRowFrom(
    r: RepoRankingRow,
    teams: Map<string, ArenaTeam>,
    profiles: Map<string, AthletePublicProfile>,
    myTeamIds: ReadonlySet<string>,
    stageTournamentOrder: readonly (string | null)[],
  ): LeagueRankingRow {
    const team = teams.get(r.refId);
    const p1 = team ? profiles.get(team.player1Id) : undefined;
    const p2 = team ? profiles.get(team.player2Id) : undefined;
    const duoName = team?.teamName ?? (p1 || p2 ? `${p1?.displayName?.split(' ')[0] ?? 'Atleta'} / ${p2?.displayName?.split(' ')[0] ?? 'Atleta'}` : 'Dupla');
    const pointsByStage = stageTournamentOrder.map((tournamentId) => {
      if (!tournamentId) return null;
      const result = r.stageResults.find((sr) => sr.tournamentId === tournamentId);
      return result ? result.points : null;
    });
    return {
      rank: r.rank,
      duoName,
      isViewer: myTeamIds.has(r.refId),
      pointsByStage,
      total: r.effectivePoints,
    };
  }

  private leagueStatusLabel(league: League, stages: LeagueStage[], now: Date): string {
    if (stages.length > 0 && stages.every((s) => s.status === 'finished')) return 'CONCLUÍDA';
    if (stages.some((s) => s.status === 'next')) return 'EM ANDAMENTO';
    if (league.seasonStartAt && now < league.seasonStartAt) return 'PROGRAMADA';
    return 'INSCRIÇÕES ABERTAS';
  }

  private periodLabelFrom(league: League): string | null {
    if (!league.seasonStartAt) return null;
    const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
    return league.seasonEndAt ? `${fmt.format(league.seasonStartAt)} – ${fmt.format(league.seasonEndAt)}` : fmt.format(league.seasonStartAt);
  }

  protected async shareLeague(): Promise<void> {
    const id = this.leagueId();
    const origin = typeof location !== 'undefined' ? location.origin : 'https://nexago.app';
    const url = `${origin}/ligas/${id}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        this.showNotice('Link copiado.');
        return;
      }
      this.showNotice('Copie o link manualmente.');
    } catch {
      this.showNotice('Não foi possível copiar agora.');
    }
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 3500);
  }
}
