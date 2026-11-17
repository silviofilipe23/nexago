import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { nameFromEmail } from '../../profile/profile-format';
import {
  clubErrorMessage,
  clubVisible,
  defaultLeadSuccessMessage,
  masterSponsor,
  partnerForRank,
  visiblePartners,
  type ClubSource,
  type Partner,
  type ValidLead,
} from '../clube.logic';
import { CLUB_API, type ClubAthleteProfile, type ClubEventType } from './clube-api';
import { ClubAccessService } from './clube-access.service';

/** Depois disto, voltar ao clube relê em segundo plano (a tela segue mostrando o que tinha). */
const STALE_MS = 60_000;

const LOAD_ERROR = 'Não foi possível carregar o clube agora. Tente de novo.';
const LEAD_ERROR = 'Não foi possível enviar agora. Tente de novo.';
const CLAIM_ERROR = 'Não foi possível carregar seu cupom agora. Tente de novo.';

/**
 * Estado das telas do clube, provido na rota-mãe componentless (`clube.routes.ts`): a lista e o
 * parceiro dividem UMA leitura da vitrine e do perfil, e o SDK fica fora do bundle inicial.
 *
 * O injetor da rota sobrevive a sair e entrar de conta na mesma aba, então o cache é da conta que
 * leu: outra conta começa do zero e nunca vê a vitrine (ou os parceiros em teste) de quem saiu.
 */
@Injectable()
export class ClubStore {
  private readonly api = inject(CLUB_API);
  private readonly auth = inject(AuthService);
  private readonly access = inject(ClubAccessService);

  /**
   * A vitrine desta pessoa (janela de validade, público, cidade e ordem já aplicados), com o
   * desconto da faixa do elo dela no selo e no título (`partnerForRank`).
   */
  readonly partners = signal<Partner[]>([]);
  readonly profile = signal<ClubAthleteProfile | null>(null);
  /** Flag desligada e a pessoa não testa: a tela mostra "em breve" em vez da vitrine. */
  readonly closed = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly sponsor = computed(() => masterSponsor(this.partners()));
  readonly uid = computed(() => this.auth.user()?.uid ?? '');
  /** Nome no rodapé da casca do painel. */
  readonly accountLabel = computed(() => {
    const user = this.auth.user();
    return user?.displayName?.trim() || nameFromEmail(user?.email);
  });

  private loadedUid: string | null | undefined = undefined;
  private loadedAt = 0;
  /** Só a leitura mais recente escreve: a resposta atrasada de outra conta é descartada. */
  private ticket = 0;

  /** Chamado pela lista e pelo parceiro ao montar: primeira leitura, troca de conta ou dado velho. */
  ensureLoaded(): void {
    const uid = this.auth.user()?.uid ?? null;
    if (uid !== this.loadedUid) {
      this.loadedUid = uid;
      this.partners.set([]);
      this.profile.set(null);
      void this.reload();
      return;
    }
    if (!this.loading() && Date.now() - this.loadedAt > STALE_MS) void this.reload();
  }

  partner(id: string): Partner | null {
    return this.partners().find((p) => p.id === id) ?? null;
  }

  async reload(): Promise<void> {
    const ticket = ++this.ticket;
    const api = this.api;
    const uid = this.auth.user()?.uid ?? null;
    this.loading.set(true);
    this.error.set(null);
    if (!api || !uid) {
      this.loading.set(false);
      this.error.set('O clube não está disponível neste ambiente.');
      return;
    }
    try {
      const [access, partners, profile] = await Promise.all([
        this.access.current(),
        api.fetchPartners(),
        api.fetchProfile(uid).catch(() => null),
      ]);
      if (ticket !== this.ticket) return;
      if (!access || access.uid !== uid) throw new Error('Sem acesso ao clube.');
      this.closed.set(!clubVisible(access.config, access.tester));
      this.profile.set(profile);
      const rank = profile?.sandRank ?? 'INICIANTE';
      this.partners.set(
        visiblePartners(partners, access.tester, profile?.city, Date.now()).map((p) => partnerForRank(p, rank)),
      );
      this.loadedAt = Date.now();
    } catch {
      if (ticket === this.ticket) this.error.set(LOAD_ERROR);
    } finally {
      if (ticket === this.ticket) this.loading.set(false);
    }
  }

  /** Funil do clube: dispara e esquece. Falhar aqui nunca pode quebrar a tela. */
  track(type: ClubEventType, source: ClubSource, partnerId: string | null = null): void {
    const api = this.api;
    if (!api) return;
    try {
      void api.track({ type, partnerId, source }).catch(() => undefined);
    } catch {
      // A porta não deveria lançar fora da promise, mas o funil nunca derruba a tela.
    }
  }

  /** Pede o cupom à `claimBenefit` (`couponViaClaim`). Lança `Error` com a mensagem para a tela. */
  async claimCoupon(partnerId: string, source: ClubSource): Promise<string | null> {
    const api = this.api;
    if (!api) throw new Error(CLAIM_ERROR);
    try {
      return await api.claimBenefit(partnerId, source);
    } catch (error) {
      throw new Error(clubErrorMessage(error, CLAIM_ERROR));
    }
  }

  /** Envia o lead. Devolve a mensagem de sucesso ou lança `Error` com a mensagem para a tela. */
  async submitLead(partner: Partner, lead: ValidLead, source: ClubSource): Promise<string> {
    const api = this.api;
    if (!api) throw new Error(LEAD_ERROR);
    try {
      const result = await api.submitLead(lead, source);
      return result.successMessage ?? partner.leadSuccessMessage ?? defaultLeadSuccessMessage(partner.name);
    } catch (error) {
      throw new Error(clubErrorMessage(error, LEAD_ERROR));
    }
  }
}
