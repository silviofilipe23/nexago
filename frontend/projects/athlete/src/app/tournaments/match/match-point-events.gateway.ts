import { Injectable } from '@angular/core';
import { watchPointEvents, type LivePointEvent } from '@nexago/live-scoring';

import { athleteLiveScoringContext } from '../../data/firestore';

/** Leitura da timeline `pointEvents` de UMA partida — a subcoleção append-only que as três mesas
 *  gravam junto de cada ponto (`recordPointTransaction`). Leitura pública pelas rules, então não
 *  depende de o atleta ser da partida nem de estar na equipe do torneio.
 *
 *  Existe como serviço, e não como chamada direta no componente, pelos mesmos dois motivos do
 *  `MesaLiveGateway`: mantém a tela sem detalhe de infra e permite um duplo em teste — assinar
 *  `onSnapshot` no construtor derruba o Karma (ver `SandRankCard`). */
@Injectable({ providedIn: 'root' })
export class MatchPointEventsGateway {
  private readonly scoring = athleteLiveScoringContext();

  /** Sem Firebase configurado (ou sem partida) devolve uma baixa vazia sem nunca emitir: a tela
   *  cai no estado honesto de "sem ponto a ponto". Erro de leitura emite lista vazia pelo mesmo
   *  motivo — melhor declarar que não há timeline do que deixar o card pendurado. */
  watch(matchId: string, onChange: (events: LivePointEvent[]) => void): () => void {
    const ctx = this.scoring;
    if (!ctx || !matchId) return () => undefined;
    return watchPointEvents(ctx, matchId, onChange, () => onChange([]));
  }
}
