import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { listMatches, type TournamentMatch } from '../data/matches-repository';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { listMyTournaments } from '../data/tournaments-repository';

/** Estado compartilhado da seção Chaveamento & Jogos (grupos/jogos/agendamento — a "chave"
 *  em si e o placar ficam fora, ver comentários nos componentes correspondentes): torneio e
 *  categoria selecionados na sessão, únicos pras telas que a subnav alterna entre si (cada
 *  rota é lazy-loaded/recriada; sem um singleton `providedIn: 'root'`, trocar de aba resetaria
 *  a seleção). Carrega os torneios do organizador uma única vez por uid autenticado e recarrega
 *  os jogos sempre que o torneio selecionado mudar. Como o serviço é singleton (`providedIn:
 *  'root'`), ele sobrevive a um logout→login; `ensureLoaded()` detecta a troca de uid e reseta
 *  o estado pra não vazar dados do organizador anterior. */
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
  /** uid pro qual o estado atual foi carregado — permite detectar troca de organizador
   *  (logout→login com outro uid) num serviço singleton e resetar antes de recarregar. */
  private loadedUid: string | null = null;

  /** Idempotente por uid — cada tela chama no construtor; só busca de fato na primeira vez
   *  que a seção Chaveamento é visitada na sessão PARA O uid atual (guard de re-entrância
   *  preservado pro mesmo uid). Se o uid autenticado mudou desde o último carregamento (outro
   *  organizador fez login), reseta torneios/seleção/jogos e recarrega do zero pro uid novo. */
  ensureLoaded(): void {
    const uid = this.auth.user()?.uid ?? null;
    if (this.initialized && uid === this.loadedUid) return;
    this.initialized = true;
    this.loadedUid = uid;
    this.tournaments.set([]);
    this.selectedTournamentId.set(null);
    this.selectedCategoryId.set(null);
    this.matches.set([]);
    this.loadingMatches.set(false);
    this.loadingTournaments.set(true);
    if (!uid) {
      this.loadingTournaments.set(false);
      return;
    }
    void this.loadTournaments(uid);
  }

  private async loadTournaments(uid: string): Promise<void> {
    try {
      const tournaments = await listMyTournaments(uid);
      if (uid !== this.loadedUid) return;
      this.tournaments.set(tournaments);
      if (tournaments.length > 0 && !this.selectedTournamentId()) {
        if (uid !== this.loadedUid) return;
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
    const uid = this.loadedUid;
    this.loadingMatches.set(true);
    try {
      const matches = await listMatches(tournamentId);
      if (uid !== this.loadedUid) return;
      this.matches.set(matches);
    } finally {
      this.loadingMatches.set(false);
    }
  }
}
