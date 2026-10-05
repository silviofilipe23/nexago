import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { DEFAULT_BROADCAST_CONTROL, type BroadcastControl, type BroadcastInterview } from '../data/broadcast-control';
import {
  saveBroadcastControl,
  saveInterviewOnAir,
  saveInterviewQueue,
  watchBroadcastControl,
  watchInterviewQueue,
  type BroadcastControlPatch,
} from '../data/broadcast-control-repository';
import { EMPTY_INTERVIEW_QUEUE, type InterviewQueue } from '../data/interview-queue';
import { organizerFirestore } from '../data/firestore';
import { watchMatches, type TournamentMatch } from '../data/matches-repository';
import type { RankingParticipant } from '../data/ranking-positions';
import { fetchRankingParticipants, rankingSportOf } from '../data/rankings-repository';
import { fetchInterviewProfiles, fetchTeamsByIds } from '../data/teams-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { watchTournament } from '../data/tournaments-repository';
import type { AthleteDetails } from './interview-card';
import { rosterOf, rosterUidsOf, teamIdsOfMatch, type TeamRoster } from './transmissao-selectors';

/** Estado ao vivo da tela Transmissão: doc do torneio, partidas, controle, os elencos (nome e
 *  foto por atleta) e o resto do perfil e o ranking geral que o card de entrevista usa. SEM `providedIn` — a tela provê a própria instância, os
 *  listeners morrem com ela, e o spec troca por um dublê. */
@Injectable()
export class TransmissaoDataService {
  private readonly auth = inject(AuthService);

  readonly tournamentId = signal<string | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(null);
  readonly matches = signal<TournamentMatch[]>([]);
  readonly control = signal<BroadcastControl>(DEFAULT_BROADCAST_CONTROL);
  /** Fila de entrevistas (`broadcast/interviewQueue`) — a mesma pra todo operador. */
  readonly queue = signal<InterviewQueue>(EMPTY_INTERVIEW_QUEUE);
  readonly rosters = signal<ReadonlyMap<string, TeamRoster>>(new Map());
  /** Cidade/UF e nível por atleta, dos MESMOS docs de perfil que montam os elencos. */
  readonly details = signal<ReadonlyMap<string, AthleteDetails>>(new Map());
  /** Ranking geral — vazio até `ensureRanking()`, e vazio de novo se a leitura falhar (o card
   *  sai sem chip de ranking, não quebra). */
  readonly athleteRanking = signal<readonly RankingParticipant[]>([]);
  readonly teamRanking = signal<readonly RankingParticipant[]>([]);
  /** Última escrita recusada/sem rede. A chave volta sozinha (o listener devolve o valor real). */
  readonly saveError = signal(false);

  private generation = 0;
  private readonly hydrated = new Set<string>();
  private rankingLoad: Promise<void> | null = null;
  /** Esporte da leitura em curso/feita (`null` = total somado). */
  private rankingSport: string | null = null;
  /** Alguém vai montar entrevista: a leitura espera o torneio dizer o esporte. */
  private readonly rankingWanted = signal(false);

  constructor() {
    effect(() => {
      if (this.rankingWanted()) this.loadRanking();
    });
    effect((onCleanup) => {
      const id = this.tournamentId();
      this.generation++;
      this.tournament.set(null);
      this.matches.set([]);
      this.control.set(DEFAULT_BROADCAST_CONTROL);
      this.queue.set(EMPTY_INTERVIEW_QUEUE);
      this.rosters.set(new Map());
      this.details.set(new Map());
      this.hydrated.clear();
      // Ranking é do esporte do torneio: o do anterior não pode sobrar no card enquanto o novo
      // doc chega, e outro torneio só lê de novo se alguém for montar entrevista nele.
      this.rankingWanted.set(false);
      this.rankingLoad = null;
      this.rankingSport = null;
      this.athleteRanking.set([]);
      this.teamRanking.set([]);
      if (!id) return;
      const unsubTournament = watchTournament(id, (t) => this.tournament.set(t), () => {});
      const unsubMatches = watchMatches(
        id,
        (ms) => {
          this.matches.set(ms);
          void this.hydrate(ms, this.generation);
        },
        () => {},
      );
      const unsubControl = watchBroadcastControl(id, (c) => this.control.set(c), () => {});
      const unsubQueue = watchInterviewQueue(id, (q) => this.queue.set(q), () => {});
      onCleanup(() => {
        unsubTournament();
        unsubMatches();
        unsubControl();
        unsubQueue();
      });
    });
  }

  async save(patch: BroadcastControlPatch): Promise<void> {
    await this.write((id, uid) => saveBroadcastControl(id, patch, uid));
  }

  /** Edição da fila (escalar, reordenar, pauta, repórter). Aplica na tela antes da volta do
   *  servidor: digitar e ver a pauta sumir até o snapshot voltar seria pior. Falha volta sozinha
   *  pelo listener. */
  async saveQueue(queue: InterviewQueue): Promise<void> {
    this.queue.set(queue);
    await this.write((id, uid) => saveInterviewQueue(id, queue, uid));
  }

  /** Tarja no ar (ou `null`) e, quando muda, o cursor da fila — numa escrita só. */
  async saveAir(interview: BroadcastInterview | null, queue: InterviewQueue | null): Promise<void> {
    if (queue) this.queue.set(queue);
    await this.write((id, uid) => saveInterviewOnAir(id, interview, queue, uid));
  }

  private async write(op: (tournamentId: string, uid: string) => Promise<void>): Promise<void> {
    const id = this.tournamentId();
    const uid = this.auth.user()?.uid;
    if (!id || !uid) return;
    try {
      await op(id, uid);
      this.saveError.set(false);
    } catch {
      this.saveError.set(true);
    }
  }

  /** O ranking é a coleção INTEIRA do esporte do torneio (é assim que o app numera) — só se lê
   *  quando alguém vai montar uma entrevista, e uma vez por esporte. Falha libera nova tentativa. */
  ensureRanking(): void {
    this.rankingWanted.set(true);
    // Quem chama costuma estar num effect: ler `tournament` aqui não pode virar dependência dele.
    untracked(() => this.loadRanking());
  }

  private loadRanking(): void {
    const sport = rankingSportOf(this.tournament());
    if (sport === undefined) return; // torneio ainda não chegou: o effect tenta de novo
    if (this.rankingLoad && this.rankingSport === sport) return;
    const projectId = environment.firebase.projectId;
    if (!projectId) return;
    this.rankingSport = sport;
    this.athleteRanking.set([]);
    this.teamRanking.set([]);
    const load: Promise<void> = fetchRankingParticipants(organizerFirestore(), projectId, sport)
      .then(({ athletes, teams }) => {
        if (this.rankingLoad !== load) return; // trocou o esporte no meio: resposta velha
        this.athleteRanking.set(athletes);
        this.teamRanking.set(teams);
      })
      .catch(() => {
        if (this.rankingLoad === load) this.rankingLoad = null;
      });
    this.rankingLoad = load;
  }

  private async hydrate(matches: TournamentMatch[], generation: number): Promise<void> {
    const ids = [...new Set(matches.flatMap(teamIdsOfMatch))].filter((id) => !this.hydrated.has(id));
    if (ids.length === 0) return;
    for (const id of ids) this.hydrated.add(id); // marca antes: snapshots em rajada não duplicam busca
    const projectId = environment.firebase.projectId;
    if (!projectId) return;
    try {
      const db = organizerFirestore();
      const teams = await fetchTeamsByIds(db, projectId, ids);
      const profiles = await fetchInterviewProfiles(db, [...teams.values()].flatMap(rosterUidsOf));
      if (generation !== this.generation) return;
      this.rosters.update((current) => {
        const next = new Map(current);
        for (const [teamId, team] of teams) next.set(teamId, rosterOf(team, profiles));
        return next;
      });
      this.details.update((current) => {
        const next = new Map(current);
        for (const [uid, p] of profiles) next.set(uid, { city: p.city, state: p.state, levelsBySport: p.levelsBySport, legacyLevel: p.legacyLevel });
        return next;
      });
    } catch {
      if (generation === this.generation) for (const id of ids) this.hydrated.delete(id);
    }
  }
}
