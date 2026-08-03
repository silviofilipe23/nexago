import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { League } from '@nexago/leagues';
import { countInscriptions } from '../data/inscriptions-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { listTournamentsByLeague } from '../data/tournaments-repository';
import { PanelContextService } from '../shell/panel-context.service';
import { buildLigaEtapaRows, nextLigaEtapa, type LigaEtapaRow } from './liga-stages';

/** Estado das telas da liga (Visão geral · Etapas · Ranking).
 *
 *  As três compartilham o mesmo carregamento — doc da liga (vem do `PanelContextService`, que
 *  já o busca pro card da sidebar), torneios das etapas numa query só e o total de inscritos
 *  por etapa. Trocar de aba não refaz nada; o `reload` existe pras ações que mudam o doc
 *  (encerrar temporada, cancelar, publicar etapa). */
@Injectable({ providedIn: 'root' })
export class LigaStore {
  private readonly ctx = inject(PanelContextService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private readonly tournamentsById = signal<ReadonlyMap<string, OrganizerTournament>>(new Map());
  private readonly inscritosByTournament = signal<ReadonlyMap<string, number>>(new Map());

  /** Id da liga já carregada — evita recarregar ao navegar entre as abas da mesma liga. */
  private loadedLeagueId: string | null = null;

  readonly league = computed<League | null>(() => this.ctx.league());
  readonly leagueBase = computed<string | null>(() => this.ctx.leagueBase());

  readonly rows = computed<LigaEtapaRow[]>(() => {
    const league = this.league();
    if (!league) return [];
    return buildLigaEtapaRows({
      league,
      tournamentsById: this.tournamentsById(),
      inscritosByTournament: this.inscritosByTournament(),
    });
  });

  readonly proximaEtapa = computed<LigaEtapaRow | null>(() => nextLigaEtapa(this.rows()));

  readonly etapasPublicadas = computed(() => this.rows().filter((r) => r.tournamentId != null).length);

  readonly totalInscritos = computed(() => this.rows().reduce((sum, r) => sum + (r.inscritos ?? 0), 0));

  constructor() {
    effect(() => {
      const leagueId = this.ctx.leagueId();
      if (!leagueId) {
        this.loadedLeagueId = null;
        return;
      }
      if (this.loadedLeagueId === leagueId) return;
      this.loadedLeagueId = leagueId;
      this.tournamentsById.set(new Map());
      this.inscritosByTournament.set(new Map());
      void this.load(leagueId);
    });
  }

  /** Recarrega liga + etapas após uma ação que muda o doc. */
  async reload(): Promise<void> {
    const leagueId = this.ctx.leagueId();
    if (!leagueId) return;
    await this.ctx.refreshLeague();
    await this.load(leagueId);
  }

  private async load(leagueId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const tournaments = await listTournamentsByLeague(leagueId);
      this.tournamentsById.set(new Map(tournaments.map((t) => [t.id, t])));

      const counts = await Promise.all(tournaments.map((t) => countInscriptions(t.id)));
      this.inscritosByTournament.set(new Map(tournaments.map((t, i) => [t.id, counts[i]!])));
    } catch (e) {
      this.error.set((e as Error).message || 'Não foi possível carregar as etapas da liga.');
    } finally {
      this.loading.set(false);
    }
  }
}
