import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from '../../painel/data/firestore';
import { isKingOfCourtMatchType, normalizeMatchType } from '../../painel/data/koc';
import {
  listMatches,
  watchMatch,
  watchMatches,
  type TournamentMatch,
} from '../../painel/data/matches-repository';
import { nextFinishMemoryOf, type MatchFinishMemory } from '../../painel/telao/telao-finished';
import { overlayCourtContextOf } from './overlay-court';
import { fetchProfileDisplays, fetchTeamsByIds } from '../../painel/data/teams-repository';
import type { OrganizerTournament } from '../../painel/data/tournament.model';
import { watchTournament } from '../../painel/data/tournaments-repository';
import { overlayTeamIdsOf } from './overlay-selectors';

export interface OverlayTeam {
  label: string;
  players: [string, string];
}

/** Costura entre a tela do overlay e o Firestore.
 *
 *  Existe como classe própria por dois motivos: assinar `onSnapshot` dentro do componente
 *  derruba o Karma, e a tela precisa de um dublê no spec. SEM `providedIn` — a página provê a
 *  própria instância e os listeners morrem com ela.
 *
 *  Regra de transmissão embutida aqui: erro de rede NÃO limpa o estado. Se a conexão cai no
 *  meio do jogo, o último placar conhecido continua no ar em vez de o overlay sumir. */
@Injectable()
export class OverlayLiveGateway {
  readonly match = signal<TournamentMatch | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(null);
  readonly teams = signal<ReadonlyMap<string, OverlayTeam>>(new Map<string, OverlayTeam>());
  /** Total de rodadas da fase, pro "Rodada 3/7" do KOTC. Zero = não foi possível contar, e a
   *  faixa simplesmente omite o total. Contado UMA vez, não é listener. */
  readonly totalRounds = signal(0);
  /** Partidas da MESMA categoria, da leitura única acima — a classificação da rodada precisa
   *  delas pra saber destino das vagas e próxima rodada. */
  readonly categoryMatches = signal<readonly TournamentMatch[]>([]);

  private readonly hydrated = new Set<string>();
  private countedRounds = false;
  private finishMemory: ReadonlyMap<string, MatchFinishMemory> = new Map();
  /** Evita reler a categoria a cada snapshot — só quando a partida desta tela encerra. */
  private lastMatchStatus: string | null = null;

  start(matchId: string): () => void {
    let unsubTournament: (() => void) | null = null;
    let watchedTournamentId: string | null = null;

    const unsubMatch = watchMatch(
      matchId,
      (m) => {
        this.match.set(m);
        if (!m) return;
        void this.hydrateTeams(m);
        void this.ensureCategoryMatches(m);
        if (m.tournamentId && m.tournamentId !== watchedTournamentId) {
          watchedTournamentId = m.tournamentId;
          unsubTournament?.();
          unsubTournament = watchTournament(
            m.tournamentId,
            (t) => this.tournament.set(t),
            () => {},
          );
        }
      },
      () => {},
    );

    return () => {
      unsubMatch();
      unsubTournament?.();
    };
  }

  /** Nome POR ATLETA, não só o rótulo combinado: a faixa do KOTC desenha uma linha por atleta.
   *  Mesmo join que o telão faz (`teams` → `public_profiles`). */
  /** Modo QUADRA: segue o que está acontecendo numa quadra em vez de uma partida fixa.
   *
   *  É o que permite o overlay emendar a rodada seguinte sozinho, em vez de alguém trocar a URL
   *  no meio da transmissão. Custa assinar as partidas do torneio — como o telão já faz — em vez
   *  do doc único do modo partida. A escolha de QUAL partida é do `courtNowOf`, e a memória de
   *  fim de partida é o que segura a recém-encerrada na tela tempo suficiente pras telas de fim. */
  startCourt(tournamentId: string, courtId: string): () => void {
    const unsubTournament = watchTournament(
      tournamentId,
      (t) => this.tournament.set(t),
      () => {},
    );

    let ultimas: TournamentMatch[] = [];
    const resolver = () => {
      const agora = Date.now();
      this.finishMemory = nextFinishMemoryOf(this.finishMemory, ultimas, agora);
      const ctx = overlayCourtContextOf(ultimas, courtId, agora, this.finishMemory);
      this.match.set(ctx.match);
      this.categoryMatches.set(ctx.categoryMatches);
      this.totalRounds.set(ctx.totalRounds);
      if (!ctx.match) return;
      void this.hydrateTeams(ctx.match);
      // Mesma razão do modo partida: sem resolver as classificadas de rodadas ANTERIORES, o
      // quadro verde fica com nome só na última vaga. `hydrateTeamIds` já ignora id conhecido,
      // então chamar a cada resolução não custa leitura.
      this.hydrateQualifiedTeams(ctx.categoryMatches);
    };

    const unsubMatches = watchMatches(
      tournamentId,
      (ms) => {
        ultimas = ms;
        resolver();
      },
      () => {},
    );

    // O `courtNowOf` depende do relógio (partida recém-encerrada sai de cena sozinha), então a
    // resolução precisa reavaliar mesmo sem snapshot novo.
    const relogio = setInterval(resolver, 1000);

    return () => {
      clearInterval(relogio);
      unsubMatches();
      unsubTournament();
    };
  }

  private async hydrateTeams(match: TournamentMatch): Promise<void> {
    await this.hydrateTeamIds(overlayTeamIdsOf(match));
  }

  /** Classificadas de rodadas anteriores já saíram da chave atual — sem isto o quadro verde
   *  só mostra nome na última vaga (as outras linhas ficam sem atletas resolvidos). */
  private async hydrateTeamIds(ids: readonly string[]): Promise<void> {
    const missing = ids.filter((id) => id !== '' && !this.hydrated.has(id));
    if (missing.length === 0) return;
    for (const id of missing) this.hydrated.add(id); // marca antes: rajada de snapshots não duplica busca
    const projectId = environment.firebase.projectId;
    if (!projectId) return;
    try {
      const db = organizerFirestore();
      const teams = await fetchTeamsByIds(db, projectId, missing);
      const playerIds = [...teams.values()]
        .flatMap((t) => [t.player1Id, t.player2Id])
        .filter((id) => id !== '');
      const profiles = await fetchProfileDisplays(db, playerIds);
      this.teams.update((current) => {
        const next = new Map(current);
        for (const [teamId, team] of teams) {
          // Ordem dos SLOTS (`player1Id`, `player2Id`) — é a ordem que a dupla usa em quadra.
          const players: [string, string] = [
            profiles.get(team.player1Id)?.name ?? '',
            profiles.get(team.player2Id)?.name ?? '',
          ];
          const named = players.filter((n) => n !== '');
          next.set(teamId, {
            label: team.teamName ?? (named.length > 0 ? named.join(' / ') : ''),
            players,
          });
        }
        return next;
      });
    } catch {
      // Falha de rede: segue com o rótulo do doc e tenta de novo no próximo snapshot.
      for (const id of missing) this.hydrated.delete(id);
    }
  }

  /** Partidas da categoria + nomes de TODAS as classificadas da fase. */
  private async ensureCategoryMatches(match: TournamentMatch): Promise<void> {
    if (!isKingOfCourtMatchType(match.matchType)) return;

    const statusMudouParaEncerrada =
      match.status === 'completed' && this.lastMatchStatus !== 'completed';
    this.lastMatchStatus = match.status;

    const precisaLer = !this.countedRounds || statusMudouParaEncerrada;
    if (!precisaLer) {
      void this.hydrateQualifiedTeams(this.categoryMatches());
      return;
    }

    try {
      const all = await listMatches(match.tournamentId);
      const daCategoria = all.filter((m) => m.categoryId === match.categoryId);
      const phase = normalizeMatchType(match.matchType);
      this.categoryMatches.set(daCategoria);
      this.totalRounds.set(
        daCategoria.filter((m) => normalizeMatchType(m.matchType) === phase).length,
      );
      this.countedRounds = true;
      void this.hydrateQualifiedTeams(daCategoria);
    } catch {
      this.countedRounds = false; // tenta de novo no próximo snapshot
    }
  }

  private hydrateQualifiedTeams(matches: readonly TournamentMatch[]): void {
    const ids = matches.flatMap((m) => overlayTeamIdsOf(m));
    void this.hydrateTeamIds(ids);
  }
}
