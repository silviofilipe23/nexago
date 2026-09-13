import { Injectable, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { fetchMatchesForTournament } from '../../data/matches-repository';
import { fetchMyRegistrations } from '../../data/tournament-registrations-repository';
import { fetchTournamentSummariesByIds } from '../../data/tournaments-repository';
import { focusDayTargetOf, focusMemoKeyOf, tournamentRunsToday, type FocusDayTarget } from './focus-day';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/**
 * Descobre se hoje é dia de torneio do atleta e para qual torneio abrir o Focus.
 *
 * Resolve UMA vez por sessão: o alvo do dia não muda a ponto de justificar reler a cada
 * navegação para o painel.
 *
 * Toda falha degrada para `null`: não é dia de Focus. Nenhum erro daqui pode quebrar o painel.
 */
@Injectable({ providedIn: 'root' })
export class FocusDayService {
  private readonly auth = inject(AuthService);
  private readonly db = createFirestore();
  private readonly projectId = environment.firebase.projectId ?? '';

  private pending: Promise<FocusDayTarget | null> | null = null;
  private pendingKey: string | null = null;

  /**
   * Marca EM MEMÓRIA (nunca `localStorage`) do dia já oferecido nesta sessão do app — a ÚNICA
   * trava da entrada automática desde que o "silêncio até amanhã" foi removido: no dia do
   * torneio o Focus abre sempre, e o que impede o loop é isto.
   *
   * O que ela resolve: `router.navigate()` empilha uma entrada de histórico, então o botão voltar
   * (e o "×", que devolve o atleta ao painel) remonta o painel e chamaria `resolve()` de novo —
   * sem isto, o mesmo alvo seria oferecido outra vez e o atleta ficaria preso no Focus, sem saída
   * nenhuma dentro do app.
   *
   * Fica só em memória de propósito: recarregar a página é um gesto deliberado do atleta e DEVE
   * reoferecer o Focus — é assim que "sempre abrir no dia do torneio" acontece de verdade.
   * Persistir isto mataria justamente esse caminho.
   */
  private offeredKey: string | null = null;

  private readonly _target = signal<FocusDayTarget | null>(null);
  readonly target = this._target.asReadonly();

  async resolve(now: Date = new Date()): Promise<FocusDayTarget | null> {
    const uid = this.auth.user()?.uid ?? null;
    const key = focusMemoKeyOf(uid ?? '', now);
    if (this.offeredKey === key) return null;
    if (key !== this.pendingKey) {
      this.pending = null;
      this.pendingKey = key;
    }
    this.pending ??= this.load(uid, now);
    const target = await this.pending;
    this._target.set(target);
    if (target) this.offeredKey = key;
    return target;
  }

  /**
   * As leituras do dia, na ordem mais barata possível.
   *
   * O gatilho é o DIA DO EVENTO, não "tem partida agendada hoje" — por isso a pergunta começa
   * pelas inscrições, e não pelas partidas: no primeiro dia a chave costuma sair depois de o
   * atleta chegar na arena, e quem perguntasse pelas partidas não acharia nada.
   *
   * O filtro por `tournamentRunsToday` fica ANTES da leitura das partidas de propósito: no dia
   * comum do atleta nenhum torneio dele roda hoje e a função para com duas idas ao Firestore,
   * sem tocar em `matches`. Só no dia de jogo (quase sempre um torneio) ela paga a terceira.
   */
  private async load(uid: string | null, now: Date): Promise<FocusDayTarget | null> {
    const db = this.db;
    if (!db || !this.projectId || !uid) return null;
    try {
      const registrations = await fetchMyRegistrations(db, this.projectId, uid);
      const eligible = registrations.filter((r) => r.isPaid && (r.teamId ?? '').trim().length > 0);
      if (eligible.length === 0) return null;

      const tournamentIds = [...new Set(eligible.map((r) => r.tournamentId))];
      const summaries = await fetchTournamentSummariesByIds(db, tournamentIds);
      const runningToday = tournamentIds.filter((id) => {
        const t = summaries.get(id);
        return t != null && tournamentRunsToday(t, now);
      });
      if (runningToday.length === 0) return null;

      // Em paralelo de propósito: em série isso vira uma ida ao Firestore por torneio e o painel
      // demora visivelmente para redirecionar.
      const matchLists = await Promise.all(
        runningToday.map(
          async (id) => [id, await fetchMatchesForTournament(db, this.projectId, id)] as const,
        ),
      );

      return focusDayTargetOf(eligible, summaries, new Map(matchLists), now);
    } catch {
      return null;
    }
  }
}
