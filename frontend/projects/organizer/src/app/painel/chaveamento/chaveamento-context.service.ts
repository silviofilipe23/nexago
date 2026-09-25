import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { listMatches, resolveCourtNames, watchMatches, type TournamentMatch } from '../data/matches-repository';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { getTournament, listMyTournaments } from '../data/tournaments-repository';
import { tournamentReach } from './tournament-reach';

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
  private readonly matchesLoaded = signal<TournamentMatch[]>([]);

  /** Doc do torneio buscado por id — o caminho do super admin pra um evento alheio
   *  (aba Plataforma), que não aparece em `listMyTournaments`. Ver `tournamentReach`. */
  private readonly fetchedTournament = signal<OrganizerTournament | null>(null);
  /** Id já pedido ao Firestore — evita repetir o `get` (inclusive quando o doc não existe,
   *  caso em que `fetchedTournament` fica nulo e a decisão segue pedindo o mesmo id). */
  private fetchAttemptedId: string | null = null;

  private readonly reach = computed(() =>
    tournamentReach({
      selectedId: this.selectedTournamentId(),
      owned: this.tournaments(),
      loadingOwned: this.loadingTournaments(),
      fetched: this.fetchedTournament(),
      isSuperAdmin: this.auth.isSuperAdmin(),
    }),
  );

  readonly tournament = computed<OrganizerTournament | null>(() => this.reach().tournament);

  /** Jogos do torneio selecionado com o nome da quadra resolvido pelas quadras do torneio —
   *  ver `resolveCourtNames` (jogos auto-agendados antes do fix só têm `courtId`). */
  readonly matches = computed<TournamentMatch[]>(() => resolveCourtNames(this.matchesLoaded(), this.tournament()?.courts ?? []));

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

  constructor() {
    // Busca o doc do torneio quando ele está fora da lista do organizador e quem está
    // vendo é super admin. É o mesmo doc que a sidebar já lê (`PanelContextService`),
    // mas este serviço é singleton de raiz e não pode depender dela (dependência cíclica).
    effect(() => {
      const id = this.reach().fetchId;
      if (!id || id === this.fetchAttemptedId) return;
      this.fetchAttemptedId = id;
      void this.loadTournamentDoc(id);
    });
  }

  /** Esquece o doc alheio (e o id já pedido) — trocar de torneio ou de organizador não
   *  pode deixar o contexto respondendo com o torneio anterior. */
  private resetFetchedTournament(): void {
    this.fetchedTournament.set(null);
    this.fetchAttemptedId = null;
  }

  private async loadTournamentDoc(id: string): Promise<void> {
    try {
      const tournament = await getTournament(id);
      if (this.fetchAttemptedId !== id) return;
      this.fetchedTournament.set(tournament);
    } catch (err) {
      console.warn('Chaveamento: falha ao carregar o doc do torneio', id, err);
    }
  }

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
    this.matchesLoaded.set([]);
    this.resetFetchedTournament();
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
    } catch (err) {
      // Sem isto a falha saía como rejeição pendente do `void loadTournaments(uid)` e as
      // telas de chaveamento ficavam com "nenhum torneio" — indistinguível de não ter
      // torneio nenhum. O item "Financeiro" do menu NÃO depende mais daqui (ver
      // `FinanceiroReachService`), justamente porque ali o silêncio escondia dinheiro.
      console.warn('Chaveamento: falha ao listar os torneios do organizador', err);
    } finally {
      this.loadingTournaments.set(false);
    }
  }

  selectTournament(id: string, opts?: { forceReload?: boolean }): void {
    const same = this.selectedTournamentId() === id;
    if (same && !opts?.forceReload) return;
    if (!same) {
      this.selectedTournamentId.set(id);
      this.selectedCategoryId.set(null);
    }
    // `forceReload` existe pra não operar em cima de cache velho — o doc alheio (quadras,
    // janela do dia) envelhece igual aos jogos, então cai fora junto.
    this.resetFetchedTournament();
    void this.loadMatches(id);
  }

  selectCategory(id: string | null): void {
    this.selectedCategoryId.set(id);
  }

  /** Recarrega os jogos do torneio selecionado — chamado após operações de escrita
   *  (placar/agendamento/geração de chave) e sempre que a rota de chaveamento abre,
   *  pra não operar em cima de cache velho. */
  async reloadMatches(): Promise<void> {
    const id = this.selectedTournamentId();
    if (id) await this.loadMatches(id);
  }

  /** Assina a grade do torneio enquanto a tela de Jogos (ou quem chamar) estiver montada.
   *
   *  Snapshot a cada escrita de QUALQUER partida — só use com a lista aberta. Preserva os
   *  rótulos do join de `listMatches`; se o slot ganhou/perdeu equipe (avanço de chave),
   *  recarrega com join. Assim "Encerrado" e o placar aparecem na hora, sem esperar reload. */
  watchMatchesLive(tournamentId: string): () => void {
    return watchMatches(
      tournamentId,
      (live) => {
        if (this.selectedTournamentId() != null && this.selectedTournamentId() !== tournamentId) {
          return;
        }
        const prev = this.matchesLoaded();
        const byId = new Map(prev.map((m) => [m.id, m]));
        const needsRelabel =
          prev.length === 0 ||
          live.some((m) => {
            const old = byId.get(m.id);
            return !old || old.teamAId !== m.teamAId || old.teamBId !== m.teamBId;
          });
        if (needsRelabel) {
          void this.loadMatches(tournamentId, { quiet: true });
          return;
        }
        this.matchesLoaded.set(
          live.map((m) => {
            const old = byId.get(m.id)!;
            return { ...m, team1Label: old.team1Label, team2Label: old.team2Label };
          }),
        );
      },
      (err) => console.warn('Chaveamento: falha no watch de partidas', err),
    );
  }

  /** Recarrega a lista de torneios (após criar/editar/cancelar torneio ou liga),
   *  preservando a seleção atual quando o torneio ainda existe. */
  async reloadTournaments(): Promise<void> {
    const uid = this.loadedUid;
    if (!uid) return;
    const selected = this.selectedTournamentId();
    this.loadingTournaments.set(true);
    try {
      const tournaments = await listMyTournaments(uid);
      if (uid !== this.loadedUid) return;
      this.tournaments.set(tournaments);
      // Torneio alheio de super admin nunca está nesta lista: trocar a seleção dele pelo
      // primeiro evento próprio tiraria o usuário do evento que ele está operando.
      const alcancaForaDaLista = this.auth.isSuperAdmin();
      if (selected && !alcancaForaDaLista && !tournaments.some((t) => t.id === selected)) {
        this.selectedTournamentId.set(null);
        this.selectedCategoryId.set(null);
        this.matchesLoaded.set([]);
        if (tournaments.length > 0) this.selectTournament(tournaments[0]!.id);
      }
    } finally {
      this.loadingTournaments.set(false);
    }
  }

  private async loadMatches(tournamentId: string, opts?: { quiet?: boolean }): Promise<void> {
    const uid = this.loadedUid;
    if (!opts?.quiet) this.loadingMatches.set(true);
    try {
      const matches = await listMatches(tournamentId);
      if (uid !== this.loadedUid) return;
      this.matchesLoaded.set(matches);
    } finally {
      if (!opts?.quiet) this.loadingMatches.set(false);
    }
  }
}
