import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { SQUAD_API, squadErrorMessage } from './squad-api';
import { composeSquadView, type AmbassadorView, type ApplicationAnswers, type CandidateView, type SquadAthleteView } from './squad-view';

/** Depois disto, voltar ao Squad relê em segundo plano (a tela segue mostrando o que tinha). */
const STALE_MS = 60_000;

/**
 * Estado das telas do Squad. Provido na rota-mãe componentless (`squad.routes.ts`), então
 * Painel, Ganhos e Nível dividem UMA leitura: trocar de aba não chama o servidor de novo.
 *
 * O injetor da rota sobrevive a sair e entrar de conta na mesma aba, então o cache é da conta
 * que leu: outra conta começa do zero, nunca vê o Squad de quem saiu.
 */
@Injectable()
export class SquadStore {
  private readonly api = inject(SQUAD_API);
  private readonly auth = inject(AuthService);

  readonly view = signal<SquadAthleteView | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly ambassador = computed<AmbassadorView | null>(() => {
    const v = this.view();
    return v?.kind === 'ambassador' ? v : null;
  });
  readonly candidate = computed<CandidateView | null>(() => {
    const v = this.view();
    return v?.kind === 'candidate' ? v : null;
  });

  private loadedUid: string | null | undefined = undefined;
  private loadedAt = 0;
  /** Só a leitura mais recente escreve: a resposta atrasada de outra conta é descartada. */
  private ticket = 0;

  /** Chamado por toda aba ao montar: primeira leitura, troca de conta ou dado velho. */
  ensureLoaded(): void {
    const uid = this.auth.user()?.uid ?? null;
    if (uid !== this.loadedUid) {
      this.loadedUid = uid;
      this.view.set(null);
      void this.reload();
      return;
    }
    if (!this.loading() && Date.now() - this.loadedAt > STALE_MS) void this.reload();
  }

  async reload(): Promise<void> {
    const ticket = ++this.ticket;
    this.loading.set(true);
    this.error.set(null);
    if (!this.api) {
      this.loading.set(false);
      this.error.set('O Squad não está disponível neste ambiente.');
      return;
    }
    try {
      // O ranking só responde a quem tem contrato vivo: para os outros a recusa é esperada e vira `null`.
      const [mySquad, portal, ranking] = await Promise.all([
        this.api.fetchMySquad(),
        this.api.fetchPortalInfo(),
        this.api.fetchRanking().catch(() => null),
      ]);
      const view = composeSquadView(mySquad, portal, ranking);
      if (ticket !== this.ticket) return;
      if (!view) throw new Error('Resposta inesperada do servidor.');
      this.view.set(view);
      this.loadedAt = Date.now();
    } catch (e) {
      if (ticket !== this.ticket) return;
      this.error.set(squadErrorMessage(e, 'Não foi possível carregar o Squad agora. Tente de novo em instantes.'));
    } finally {
      if (ticket === this.ticket) this.loading.set(false);
    }
  }

  /** Envia a candidatura e relê (a tela passa a mostrar "em análise"). Erro sobe com a mensagem pronta. */
  async submitApplication(answers: ApplicationAnswers): Promise<void> {
    if (!this.api) throw new Error('O Squad não está disponível neste ambiente.');
    try {
      await this.api.submitApplication(answers);
    } catch (e) {
      throw new Error(squadErrorMessage(e, 'Não foi possível enviar a candidatura agora. Tente de novo em instantes.'));
    }
    await this.reload();
  }
}
