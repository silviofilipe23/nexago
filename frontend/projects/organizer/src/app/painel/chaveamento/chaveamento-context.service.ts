import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { listMatches, type TournamentMatch } from '../data/matches-repository';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { listMyTournaments } from '../data/tournaments-repository';

/** Estado compartilhado da seção Chaveamento & Jogos (grupos/jogos/agendamento — a "chave"
 *  em si e o placar ficam fora, ver comentários nos componentes correspondentes): torneio e
 *  categoria selecionados na sessão, únicos pras telas que a subnav alterna entre si (cada
 *  rota é lazy-loaded/recriada; sem um singleton `providedIn: 'root'`, trocar de aba resetaria
 *  a seleção). Carrega os torneios do organizador uma única vez e recarrega os jogos sempre
 *  que o torneio selecionado mudar. */
@Injectable({ providedIn: 'root' })
export class ChaveamentoContextService {
  private readonly auth = inject(AuthService);

  readonly loadingTournaments = signal(true);
  readonly tournaments = signal<OrganizerTournament[]>([]);
  readonly selectedTournamentId = signal<string | null>(null);
  /** null = "todas as categorias". */
  readonly selectedCategoryId = signal<string | null>(null);

  readonly loadingMatches = signal(false);
  readonly matches = signal<TournamentMatch[]>([]);

  readonly tournament = computed<OrganizerTournament | null>(
    () => this.tournaments().find((t) => t.id === this.selectedTournamentId()) ?? null,
  );

  readonly categories = computed<OrganizerTournamentCategory[]>(() => this.tournament()?.categories ?? []);

  readonly categoryName = computed<string | null>(() => {
    const catId = this.selectedCategoryId();
    if (!catId) return null;
    return this.categories().find((c) => c.id === catId)?.name ?? null;
  });

  /** Jogos do torneio selecionado, já filtrados pela categoria selecionada (todas quando nula). */
  readonly matchesFiltered = computed<TournamentMatch[]>(() => {
    const catId = this.selectedCategoryId();
    const ms = this.matches();
    return catId ? ms.filter((m) => m.categoryId === catId) : ms;
  });

  private initialized = false;

  /** Idempotente — cada tela chama no construtor; só busca de fato na primeira vez que a
   *  seção Chaveamento é visitada na sessão. */
  ensureLoaded(): void {
    if (this.initialized) return;
    this.initialized = true;
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.loadingTournaments.set(false);
      return;
    }
    void this.loadTournaments(uid);
  }

  private async loadTournaments(uid: string): Promise<void> {
    try {
      const tournaments = await listMyTournaments(uid);
      this.tournaments.set(tournaments);
      if (tournaments.length > 0 && !this.selectedTournamentId()) {
        this.selectTournament(tournaments[0]!.id);
      }
    } finally {
      this.loadingTournaments.set(false);
    }
  }

  selectTournament(id: string): void {
    if (this.selectedTournamentId() === id) return;
    this.selectedTournamentId.set(id);
    this.selectedCategoryId.set(null);
    void this.loadMatches(id);
  }

  selectCategory(id: string | null): void {
    this.selectedCategoryId.set(id);
  }

  private async loadMatches(tournamentId: string): Promise<void> {
    this.loadingMatches.set(true);
    try {
      const matches = await listMatches(tournamentId);
      this.matches.set(matches);
    } finally {
      this.loadingMatches.set(false);
    }
  }
}
