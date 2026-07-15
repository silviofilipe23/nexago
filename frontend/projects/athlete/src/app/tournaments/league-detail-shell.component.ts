import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import type { LeagueDetailView } from './league-detail.models';
import { buildLeagueDetailView } from './tournament-logic';
import { fetchLeagueAthleteRanking, fetchLeagueById, fetchLeagueTeamRanking, fetchTournamentById, type LeagueRankingRowRaw, type TournamentRaw } from './tournament-repository';

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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'LG';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'LG';
}

@Component({
  selector: 'app-league-detail-shell',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './league-detail-shell.component.html',
  styleUrl: './league-detail-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeagueDetailShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
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
  protected readonly league = signal<LeagueDetailView | null>(null);
  protected readonly organizerInitials = computed(() => {
    const name = this.league()?.organizerName;
    return name ? initialsOf(name) : 'LG';
  });

  protected readonly notice = signal<string | null>(null);

  constructor() {
    void this.load();
    this.destroyRef.onDestroy(() => clearTimeout(this.noticeTimeout));
  }

  private async load(): Promise<void> {
    const id = this.leagueId();
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const db = createFirestore();
      const projectId = environment.firebase.projectId;
      if (!db || !projectId) throw new Error('Firebase não configurado');

      const raw = await fetchLeagueById(db, id);
      if (!raw) {
        this.league.set(null);
        return;
      }

      const stageTournamentEntries = await Promise.all(
        raw.stages.map(async (s): Promise<[string, TournamentRaw | null]> => {
          const tId = s.tournamentIds[0];
          if (!tId) return [s.id, null];
          return [s.id, await fetchTournamentById(db, tId)];
        }),
      );
      const tournamentsByStageId = new Map(stageTournamentEntries);

      const teamRanking = await fetchLeagueTeamRanking(db, projectId, id);
      const rankingRaw: LeagueRankingRowRaw[] = teamRanking.length > 0 ? teamRanking : await fetchLeagueAthleteRanking(db, projectId, id);

      this.league.set(buildLeagueDetailView(raw, tournamentsByStageId, rankingRaw));
    } catch {
      this.league.set(null);
    } finally {
      this.loading.set(false);
    }
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
