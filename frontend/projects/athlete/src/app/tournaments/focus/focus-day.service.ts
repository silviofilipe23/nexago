import { Injectable, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { fetchMatchesForTeam, fetchTeamsForAthlete } from '../../data/teams-repository';
import { focusDayTargetOf, focusMemoKeyOf, type FocusDayTarget } from './focus-day';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/**
 * Descobre se hoje é dia de Focus e para qual torneio.
 *
 * Resolve UMA vez por sessão: o alvo do dia não muda a ponto de justificar reler a cada
 * navegação para o painel. São as mesmas leituras que o painel já faz para montar "próximos
 * jogos", então o custo real é próximo de zero — mas a fronteira fica aqui, e não dentro de um
 * componente de quase mil linhas.
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
   * trava da entrada automática desde que o "silêncio até amanhã" foi removido: no dia de jogo o
   * Focus abre sempre, e o que impede o loop é isto.
   *
   * O que ela resolve: `router.navigate()` empilha uma entrada de histórico, então o botão voltar
   * (e o "×", que devolve o atleta ao painel) remonta o painel e chamaria `resolve()` de novo —
   * sem isto, o mesmo alvo seria oferecido outra vez e o atleta ficaria preso no Focus, sem saída
   * nenhuma dentro do app.
   *
   * Fica só em memória de propósito: recarregar a página é um gesto deliberado do atleta e DEVE
   * reoferecer o Focus — é assim que "sempre abrir no dia de jogo" acontece de verdade. Persistir
   * isto mataria justamente esse caminho.
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

  private async load(uid: string | null, now: Date): Promise<FocusDayTarget | null> {
    const db = this.db;
    if (!db || !this.projectId || !uid) return null;
    try {
      const teams = await fetchTeamsForAthlete(db, this.projectId, uid);
      if (teams.length === 0) return null;
      // Em paralelo de propósito: em série isso vira uma ida ao Firestore por equipe e o
      // painel demora visivelmente para redirecionar.
      const lists = await Promise.all(teams.map((t) => fetchMatchesForTeam(db, this.projectId, t.id)));
      return focusDayTargetOf(lists.flat(), now);
    } catch {
      return null;
    }
  }

}
