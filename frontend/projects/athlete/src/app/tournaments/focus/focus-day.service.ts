import { Injectable, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { fetchMatchesForTeam, fetchTeamsForAthlete } from '../../data/teams-repository';
import { saoPauloDateKey } from '../tournament-live.selectors';
import { FOCUS_DISMISSED_KEY, focusDayTargetOf, isFocusDismissed, type FocusDayTarget } from './focus-day';

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

  readonly target = signal<FocusDayTarget | null>(null);

  async resolve(now: Date = new Date()): Promise<FocusDayTarget | null> {
    if (this.isDismissed(now)) return null;
    this.pending ??= this.load(now);
    const target = await this.pending;
    this.target.set(target);
    return target;
  }

  private async load(now: Date): Promise<FocusDayTarget | null> {
    const db = this.db;
    const uid = this.auth.user()?.uid ?? null;
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

  isDismissed(now: Date = new Date()): boolean {
    return isFocusDismissed(this.read(), now);
  }

  /** Chamado ao sair do Focus: silencia a entrada automática até o dia seguinte. */
  dismissForToday(now: Date = new Date()): void {
    try {
      localStorage.setItem(FOCUS_DISMISSED_KEY, saoPauloDateKey(now));
    } catch {
      // Modo privativo ou quota estourada: sem a marca o Focus reabre no próximo painel.
      // Degradar é melhor que estourar na saída do Focus.
    }
    this.target.set(null);
  }

  private read(): string | null {
    try {
      return localStorage.getItem(FOCUS_DISMISSED_KEY);
    } catch {
      return null;
    }
  }
}
