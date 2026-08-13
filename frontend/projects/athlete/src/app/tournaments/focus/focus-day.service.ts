import { Injectable, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { fetchMatchesForTeam, fetchTeamsForAthlete } from '../../data/teams-repository';
import { FOCUS_DISMISSED_KEY, focusDayTargetOf, focusMemoKeyOf, isFocusDismissed, type FocusDayTarget } from './focus-day';

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

  /** Marca EM MEMÓRIA (nunca `localStorage`) do dia já oferecido nesta sessão do app. Resolve o
   *  problema que `dismissForToday` não resolve: `router.navigate()` empilha uma entrada de
   *  histórico, então o botão voltar do navegador remonta o painel e chamaria `resolve()` de
   *  novo — sem isto, ofereceria o MESMO alvo de novo e o atleta seria empurrado pro Focus outra
   *  vez, em loop, porque voltar não passa por `dismissForToday` (só o "×" passa). Fica só em
   *  memória de propósito: um recarregamento de página é um gesto deliberado do atleta e deve
   *  reoferecer o Focus — só uma remontagem DENTRO do mesmo app (voltar, um link, etc.) deve
   *  virar no-op. Persistir isto em `localStorage` mataria esse caminho de reload sem querer. */
  private offeredKey: string | null = null;

  private readonly _target = signal<FocusDayTarget | null>(null);
  readonly target = this._target.asReadonly();

  async resolve(now: Date = new Date()): Promise<FocusDayTarget | null> {
    const uid = this.auth.user()?.uid ?? null;
    const key = focusMemoKeyOf(uid ?? '', now);
    if (this.isDismissed(now)) return null;
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

  isDismissed(now: Date = new Date()): boolean {
    const uid = this.auth.user()?.uid ?? '';
    return isFocusDismissed(this.read(), uid, now);
  }

  /** Chamado ao sair do Focus: silencia a entrada AUTOMÁTICA até o dia seguinte — só para ESTE
   *  atleta, para não silenciar o Focus de outra conta no mesmo dispositivo compartilhado.
   *
   *  NÃO zera `target`: esse signal continua valendo como "existe partida hoje" para o botão
   *  manual "Entrar no Focus" do painel (`AthletePainelComponent`) — dispensar a entrada
   *  automática não apaga o fato de que o dia tem jogo, só a decisão de levar o atleta pra lá
   *  sem ele pedir. Zerar `target` aqui faria o único caminho de volta desaparecer bem no
   *  momento em que o atleta sai do Focus e mais precisaria dele. */
  dismissForToday(now: Date = new Date()): void {
    const uid = this.auth.user()?.uid ?? '';
    try {
      localStorage.setItem(FOCUS_DISMISSED_KEY, focusMemoKeyOf(uid, now));
    } catch {
      // Modo privativo ou quota estourada: sem a marca o Focus reabre no próximo painel.
      // Degradar é melhor que estourar na saída do Focus.
    }
    this.pending = null;
    this.pendingKey = null;
  }

  private read(): string | null {
    try {
      return localStorage.getItem(FOCUS_DISMISSED_KEY);
    } catch {
      return null;
    }
  }
}
