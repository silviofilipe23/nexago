import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { athleteFirestore, athleteProjectId } from '../../data/firestore';
import { fetchPublicProfilesByIds } from '../../data/public-profiles-repository';
import { fetchTournamentRosterRows } from '../../data/tournament-registrations-repository';
import {
  buildEnrolledTeams,
  filterEnrolledTeamsByCategory,
  groupEnrolledTeamsByCategory,
  inscriptionMemberUids,
  isConfirmedInscription,
  type RosterProfile,
  type RosterRow,
} from '../enrolled-teams';
import { TournamentLiveStore } from '../tournament-live.store';

interface CategoryChip {
  id: string;
  name: string;
}

const ALL_CATEGORIES = '';

/**
 * Aba "Equipes": quem já tem vaga confirmada no torneio, agrupado por categoria — a irmã web da
 * tela "Equipes inscritas" do app, com a mesma lógica (`enrolled-teams.ts` espelha o Dart).
 *
 * Quem decide se ela existe é o organizador (`enrolledTeamsVisible`). A aba já some do cabeçalho
 * por `visibleTabsOf`, mas a rota continua aberta a quem tem o link — por isso o portão também
 * mora aqui, e com ele nem a busca do roster acontece.
 */
@Component({
  selector: 'app-enrolled-teams-tab',
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './enrolled-teams-tab.component.html',
  styleUrl: './enrolled-teams-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnrolledTeamsTabComponent {
  protected readonly store = inject(TournamentLiveStore);

  private readonly db = athleteFirestore();
  private readonly projectId = athleteProjectId();
  private loadedTournamentId = '';

  private readonly rows = signal<readonly RosterRow[]>([]);
  private readonly profiles = signal<ReadonlyMap<string, RosterProfile>>(new Map());
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly selectedCategoryId = signal(ALL_CATEGORIES);

  /** Torneio ainda não carregado não é "escondido": é "não sei ainda" — daí o `!= null`. */
  protected readonly hidden = computed(() => {
    const tournament = this.store.tournament();
    return tournament != null && !tournament.enrolledTeamsVisible;
  });

  private readonly teams = computed(() =>
    buildEnrolledTeams({
      rows: this.rows(),
      profiles: this.profiles(),
      categories: this.store.tournament()?.categories ?? [],
    }),
  );

  protected readonly groups = computed(() =>
    groupEnrolledTeamsByCategory(filterEnrolledTeamsByCategory(this.teams(), this.selectedCategoryId())),
  );

  /** "Todas" + as categorias do torneio. Com uma categoria só os chips seriam decoração. */
  protected readonly chips = computed<CategoryChip[]>(() => {
    const categories = (this.store.tournament()?.categories ?? []).filter((c) => c.id.trim().length > 0);
    if (categories.length < 2) return [];
    return [{ id: ALL_CATEGORIES, name: 'Todas' }, ...categories.map((c) => ({ id: c.id, name: c.categoryName }))];
  });

  protected readonly total = computed(() => this.teams().length);

  private readonly rosterLoader = effect(() => {
    const tournamentId = this.store.tournamentId();
    if (this.hidden()) {
      this.loading.set(false);
      return;
    }
    if (!tournamentId || tournamentId === this.loadedTournamentId) return;
    this.loadedTournamentId = tournamentId;
    void this.loadRoster(tournamentId);
  });

  private async loadRoster(tournamentId: string): Promise<void> {
    const db = this.db;
    if (!db) {
      this.loading.set(false);
      this.failed.set(true);
      return;
    }

    this.loading.set(true);
    this.failed.set(false);
    try {
      const rows = await fetchTournamentRosterRows(db, this.projectId, tournamentId);
      // Só os perfis de quem aparece na lista: a inscrição pendente não vira linha e não precisa
      // de nome nem de foto.
      const uids = [
        ...new Set(
          rows
            .filter((r) => isConfirmedInscription(r.inscription))
            .flatMap((r) => inscriptionMemberUids({ inscription: r.inscription, team: r.team })),
        ),
      ];
      const profiles = uids.length > 0 ? await fetchPublicProfilesByIds(db, uids) : new Map<string, RosterProfile>();
      this.rows.set(rows);
      this.profiles.set(profiles);
    } catch {
      this.failed.set(true);
      this.loadedTournamentId = '';
    } finally {
      this.loading.set(false);
    }
  }

  protected selectCategory(id: string): void {
    this.selectedCategoryId.set(id);
  }

  protected membersLine(displayName: string, members: readonly { name: string }[]): string {
    const joined = members.map((m) => m.name).join(' / ');
    // Sem nome próprio o título JÁ é a lista de atletas — repeti-la abaixo vira eco.
    return joined && joined !== displayName ? joined : '';
  }
}
