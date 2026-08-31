import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { athleteFunctions } from '../../data/functions';
import { fetchPublicProfilesByIds, searchAthleteDirectory } from '../../data/public-profiles-repository';
import {
  cancelMyRegistration,
  fetchTournamentOrganizerContact,
  registrationCancellable,
  requestRegistrationCancellation,
  sendSubstitutionInvite,
  TournamentRegistrationError,
  type AthleteTournamentRegistration,
  type RegistrationUniformSlot,
} from '../../data/tournament-registrations-repository';
import type { TournamentCategoryOffer } from '../../data/tournaments-repository';
import { NxBlockingDialogComponent, NxToastService } from '../../shared/feedback';
import {
  pickRegistrationSharePhrase,
  registrationShareDateLabel,
  registrationShareFooter,
  registrationShareLocationLine,
  registrationShareSlotLabel,
  registrationShareable,
  type RegistrationShareData,
} from '../registration/registration-share';
import { campaignShareDataOf, type CampaignShareData } from '../campaign/campaign-share';
import { CampaignShareDialogComponent } from '../campaign/campaign-share-dialog.component';
import { RegistrationShareDialogComponent } from '../registration/registration-share-dialog.component';
import { TournamentLiveStore } from '../tournament-live.store';
import { registrationRosterView } from './registration-roster-cta';
import { substitutionSlots } from './substitution-view';
import { SubstitutionDialogComponent, type SubstitutionSendRequest } from './substitution-dialog.component';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

interface ShareAthleteProfile {
  name: string;
  photo: string | null;
}

export type RegistrationPaymentState = 'paid' | 'share-paid' | 'pending' | 'waitlist';

export interface RegistrationCard {
  id: string;
  categoryName: string;
  categoryId: string;
  entryFee: string;
  teamName: string;
  /** "Equipe" (trio+) ou "Dupla" — rótulo do fato no card. */
  teamLabel: string;
  /** "Elenco 2/4" / "convite pendente" enquanto o elenco está aberto. */
  rosterFlag: string | null;
  /** CTA que leva ao shell de inscrição pra convidar; `null` = sem CTA. */
  inviteLabel: string | null;
  /** Integrante (não capitão) de equipe incompleta: quem convida é o capitão. */
  captainOnlyHint: string | null;
  paymentState: RegistrationPaymentState;
  paymentLabel: string;
  paymentHint: string;
  uniform: RegistrationUniformSlot | null;
  uniformRequired: boolean;
  /** Cancelamento direto pelo atleta: só sem NENHUM pagamento na inscrição. */
  canCancel: boolean;
  /** Inscrição fechada e paga — só aí o card compartilhável pode sair dizendo "confirmada". */
  canShare: boolean;
  /** A campanha desta categoria pode virar imagem: há partida encerrada e não é categoria de
   *  equipe. Diferente de `canShare`, que é do card de INSCRIÇÃO. */
  canShareCampaign: boolean;
  /** Com pagamento o caminho é pedir ao organizador — estes três estados. */
  cancellationState: 'none' | 'pending' | 'declined';
  cancellationResponseNote: string;
  /** Vagas que o atleta logado pode substituir; vazio = ação oculta. */
  substitutionSlots: { uid: string; name: string }[];
  substitutionHistory: { outName: string; inName: string }[];
}

/** Texto que aparece em TODO ponto do fluxo: a plataforma não devolve dinheiro. */
export const REFUND_OUTSIDE_PLATFORM_NOTICE =
  'A nexaGO não processa o reembolso. Ao aprovar, o organizador libera sua vaga — ' +
  'a devolução do valor pago é combinada diretamente com ele, fora da plataforma.';

export const REFUND_PENDING_NOTICE =
  'Aguardando o organizador. Combine a devolução do valor diretamente com ele.';

/** Aba "Minha inscrição": o que o atleta já contratou neste torneio. Só aparece pra quem tem
 *  inscrição, então não precisa de estado vazio de "você não está inscrito". */
@Component({
  selector: 'app-registration-tab',
  imports: [
    RouterLink,
    NxBlockingDialogComponent,
    RegistrationShareDialogComponent,
    CampaignShareDialogComponent,
    SubstitutionDialogComponent,
  ],
  templateUrl: './registration-tab.component.html',
  styleUrl: './registration-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationTabComponent {
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(NxToastService);
  protected readonly store = inject(TournamentLiveStore);

  protected readonly cancelTarget = signal<RegistrationCard | null>(null);
  protected readonly cancelling = signal(false);

  protected readonly cards = computed<RegistrationCard[]>(() => {
    const t = this.store.tournament();
    if (!t) return [];
    return this.store.myRegistrations().map((r) => this.cardOf(r, t.categories.find((c) => c.id === r.categoryId) ?? null));
  });

  private cardOf(r: AthleteTournamentRegistration, category: TournamentCategoryOffer | null): RegistrationCard {
    const uid = this.auth.user()?.uid ?? null;
    const isPlayer1 = uid != null && (r.player1Id === uid || r.participantUids[0] === uid);
    const isTeam = r.teamSize != null;
    const paymentState = this.paymentStateOf(r, uid);
    // Equipe nomeada (trio+): o nome vem da própria inscrição e o uniforme é por uid.
    const teamName =
      r.teamName ??
      (r.teamId ? this.store.duoNameOf(r.teamId) : isTeam ? 'Equipe a definir' : 'Dupla a definir');
    const uniform = isTeam
      ? (uid != null ? (r.uniformByUid[uid] ?? null) : null)
      : isPlayer1
        ? r.uniformPlayer1
        : r.uniformPlayer2;
    const paymentHint =
      isTeam && paymentState === 'share-paid'
        ? 'Faltam os demais atletas quitarem as cotas deles para a vaga ser confirmada.'
        : PAYMENT_HINT[paymentState];
    const roster = registrationRosterView(r, uid);
    const bracketPublished = this.store.matches().some((m) => m.categoryId === r.categoryId);
    const profiles = this.athleteProfiles();
    const slots = bracketPublished
      ? []
      : substitutionSlots(r, uid).map((slotUid) => ({
          uid: slotUid,
          name: profiles.get(slotUid)?.name ?? this.fallbackNameOf(slotUid),
        }));
    return {
      id: r.id,
      categoryId: r.categoryId,
      categoryName: category?.categoryName ?? r.categoryId,
      entryFee: category ? formatBRL(category.entryFee) : '—',
      teamName,
      teamLabel: roster.teamLabel,
      rosterFlag: roster.rosterFlag,
      inviteLabel: roster.inviteLabel,
      captainOnlyHint: roster.captainOnlyHint,
      paymentState,
      paymentLabel: PAYMENT_LABEL[paymentState],
      paymentHint,
      uniform,
      uniformRequired: category?.uniformType != null && category.uniformType !== 'none',
      canCancel: registrationCancellable(r),
      canShare: registrationShareable(r),
      canShareCampaign: !isTeam && this.campaignDataOf(r.categoryId, r.teamId) != null,
      cancellationState: r.cancellationRequest?.status ?? 'none',
      cancellationResponseNote: r.cancellationRequest?.responseNote ?? '',
      substitutionSlots: slots,
      substitutionHistory: r.substitutionHistory.map((h) => ({ outName: h.outName, inName: h.inName })),
    };
  }

  // ——— Compartilhar a inscrição (card instagramável) ———

  private readonly db = createFirestore();

  /** Nome/foto dos participantes das MINHAS inscrições. O `profiles` do store é hidratado a
   *  partir das partidas — antes de existir chave ele está vazio, e é justamente aí que o card
   *  é compartilhado. Por isso esta aba busca os perfis por conta própria. */
  private readonly athleteProfiles = signal<ReadonlyMap<string, ShareAthleteProfile>>(new Map());
  private loadedProfilesKey = '';

  /** Busca os perfis assim que as inscrições chegam, e não no clique: o diálogo desenha o card
   *  na abertura, e esperar a rede ali deixaria os nomes saírem genéricos no primeiro traço. */
  private readonly profilesLoader = effect(() => {
    const uids = [...new Set(this.store.myRegistrations().flatMap((r) => r.participantUids))]
      .filter((uid) => uid.length > 0)
      .sort();
    const key = uids.join(',');
    if (key.length === 0 || key === this.loadedProfilesKey) return;
    this.loadedProfilesKey = key;
    void this.loadAthleteProfiles(uids);
  });

  private async loadAthleteProfiles(uids: string[]): Promise<void> {
    const db = this.db;
    if (!db) return;
    try {
      const profiles = await fetchPublicProfilesByIds(db, uids);
      this.athleteProfiles.set(
        new Map(
          [...profiles].map(([uid, profile]) => [uid, { name: profile.displayName, photo: profile.avatarUrl ?? null }]),
        ),
      );
    } catch {
      // Sem os perfis o card cai no nome da conta e em "Atleta" — ver `fallbackNameOf`.
      this.loadedProfilesKey = '';
    }
  }

  /** Inscrição aberta no diálogo (id), `null` = diálogo fechado. */
  protected readonly shareTargetId = signal<string | null>(null);

  protected readonly shareData = computed<RegistrationShareData | null>(() => {
    const id = this.shareTargetId();
    const t = this.store.tournament();
    if (!id || !t) return null;

    const registration = this.store.myRegistrations().find((r) => r.id === id);
    if (!registration) return null;
    const category = t.categories.find((c) => c.id === registration.categoryId) ?? null;

    const profiles = this.athleteProfiles();
    const athletes = registration.participantUids.map((uid) => ({
      name: profiles.get(uid)?.name ?? this.fallbackNameOf(uid),
      photo: profiles.get(uid)?.photo ?? null,
    }));

    return {
      headline: pickRegistrationSharePhrase(registration.id, { team: registration.teamSize != null }),
      slotLabel: registrationShareSlotLabel(
        category ? (this.store.enrolledByCategory().get(category.id) ?? null) : null,
        category?.maxTeams ?? 0,
      ),
      tournamentName: t.name,
      dateLabel: registrationShareDateLabel(t.startAt, t.endAt, t.dateLabel),
      categoryName: category?.categoryName ?? registration.categoryId,
      locationLine: registrationShareLocationLine(t.location, t.city),
      footerLabel: registrationShareFooter(t.startAt),
      athletes: athletes.length > 0 ? athletes : [{ name: this.fallbackNameOf(this.auth.user()?.uid ?? ''), photo: null }],
      teamName: registration.teamName,
    };
  });

  /** Perfil que não veio: o próprio atleta vira o nome da conta, os outros ficam genéricos —
   *  melhor um card com um nome faltando do que nenhum card. */
  private fallbackNameOf(uid: string): string {
    if (uid.length > 0 && uid === this.auth.user()?.uid) {
      const displayName = this.auth.user()?.displayName?.trim();
      if (displayName) return displayName;
    }
    return 'Atleta';
  }

  protected readonly campaignTargetId = signal<string | null>(null);

  /** Os dados do card da categoria, ou `null` quando não há campanha para contar (nenhuma
   *  partida encerrada) ou falta o time da inscrição. */
  private campaignDataOf(categoryId: string, teamId: string | null): CampaignShareData | null {
    const tournament = this.store.tournament();
    const category = tournament?.categories.find((c) => c.id === categoryId) ?? null;
    if (!tournament || !category || !teamId) return null;
    const data = campaignShareDataOf({
      matches: this.store.matches(),
      categoryId,
      myTeamIds: this.store.myTeamIds(),
      duoNameOf: (id, fallback) => this.store.duoNameOf(id, fallback),
      teamName: this.store.duoNameOf(teamId),
      players: this.store.duoPlayersOf(teamId),
      categoryName: category.categoryName,
      teamSize: category.teamSize,
      tournamentName: tournament.name,
      locationName: tournament.location || null,
      startAt: tournament.startAt,
      endAt: tournament.endAt,
    });
    return data.trajectory.rows.length > 0 ? data : null;
  }

  protected readonly campaignData = computed<CampaignShareData | null>(() => {
    const id = this.campaignTargetId();
    if (!id) return null;
    const registration = this.store.myRegistrations().find((r) => r.id === id);
    return registration ? this.campaignDataOf(registration.categoryId, registration.teamId) : null;
  });

  protected openCampaignShare(card: RegistrationCard): void {
    this.campaignTargetId.set(card.id);
  }

  protected closeCampaignShare(): void {
    this.campaignTargetId.set(null);
  }

  protected openShare(card: RegistrationCard): void {
    this.shareTargetId.set(card.id);
  }

  protected closeShare(): void {
    this.shareTargetId.set(null);
  }

  // ——— Pedido de cancelamento (inscrição paga) ———

  protected readonly requestFormFor = signal<string | null>(null);
  protected readonly requestReason = signal('');
  protected readonly requestSending = signal(false);
  protected readonly organizerContactBusy = signal(false);

  protected readonly refundNotice = REFUND_OUTSIDE_PLATFORM_NOTICE;
  protected readonly refundPendingNotice = REFUND_PENDING_NOTICE;

  protected openRequestForm(card: RegistrationCard): void {
    this.requestReason.set('');
    this.requestFormFor.set(card.id);
  }

  protected closeRequestForm(): void {
    if (!this.requestSending()) this.requestFormFor.set(null);
  }

  protected onReasonInput(event: Event): void {
    this.requestReason.set((event.target as HTMLTextAreaElement).value);
  }

  protected async submitRequest(card: RegistrationCard): Promise<void> {
    const reason = this.requestReason().trim();
    if (!reason || this.requestSending()) return;
    this.requestSending.set(true);
    try {
      await requestRegistrationCancellation(athleteFunctions(), card.id, reason);
      // Atualiza a lista local: o doc muda no servidor, mas a aba só recarrega
      // o torneio inteiro numa navegação nova.
      this.store.myRegistrations.update((list) =>
        list.map((r) =>
          r.id === card.id
            ? { ...r, cancellationRequest: { status: 'pending' as const, reason, responseNote: '' } }
            : r,
        ),
      );
      this.requestFormFor.set(null);
      this.toasts.success('Pedido enviado', 'O organizador foi avisado e vai responder.');
    } catch (err) {
      this.toasts.error(
        'Não foi possível enviar o pedido',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
      );
    } finally {
      this.requestSending.set(false);
    }
  }

  /** Abre o WhatsApp do organizador — é por ali que o reembolso é acertado. */
  protected async contactOrganizer(card: RegistrationCard): Promise<void> {
    if (this.organizerContactBusy()) return;
    this.organizerContactBusy.set(true);
    try {
      const contact = await fetchTournamentOrganizerContact(athleteFunctions(), this.store.tournamentId());
      if (!contact.whatsappPhone) {
        this.toasts.warning(
          'Organizador sem WhatsApp cadastrado',
          contact.email ? `Fale por e-mail: ${contact.email}` : 'Tente pelos canais do torneio.',
        );
        return;
      }
      const text = encodeURIComponent(
        `Olá! Sou atleta inscrito em ${this.store.tournament()?.name ?? 'seu torneio'} ` +
          `(${card.categoryName}) e pedi o cancelamento da inscrição.`,
      );
      window.open(`https://wa.me/${contact.whatsappPhone}?text=${text}`, '_blank', 'noopener');
    } catch (err) {
      this.toasts.error(
        'Não foi possível abrir o contato',
        err instanceof TournamentRegistrationError ? err.message : 'Tente de novo em instantes.',
      );
    } finally {
      this.organizerContactBusy.set(false);
    }
  }

  protected askCancel(card: RegistrationCard): void {
    this.cancelTarget.set(card);
  }

  protected closeCancel(): void {
    if (!this.cancelling()) this.cancelTarget.set(null);
  }

  protected async confirmCancel(): Promise<void> {
    const target = this.cancelTarget();
    if (!target || this.cancelling()) return;
    this.cancelling.set(true);
    try {
      await cancelMyRegistration(athleteFunctions(), target.id);
      // O backend deletou o doc; tira da lista local em vez de recarregar o torneio inteiro.
      this.store.myRegistrations.update((list) => list.filter((r) => r.id !== target.id));
      this.cancelTarget.set(null);
      this.toasts.success('Inscrição cancelada', 'Sua vaga foi liberada para outro atleta.');
    } catch (err) {
      this.toasts.error(
        'Não foi possível cancelar',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
      );
    } finally {
      this.cancelling.set(false);
    }
  }

  // ——— Substituir atleta (dupla: qualquer membro; equipe: só o capitão) ———

  protected readonly substitutionTarget = signal<RegistrationCard | null>(null);
  protected readonly substitutionSending = signal(false);

  /** Busca do dialog: diretório público menos quem já está na inscrição. */
  protected readonly substitutionSearchFn = async (term: string) => {
    const db = this.db;
    const target = this.substitutionTarget();
    if (!db || !target) return [];
    const registration = this.store.myRegistrations().find((r) => r.id === target.id);
    const memberUids = new Set(registration?.participantUids ?? []);
    const results = await searchAthleteDirectory(db, term);
    return results
      .filter((p) => !memberUids.has(p.id))
      .map((p) => ({ uid: p.id, name: p.displayName }));
  };

  protected openSubstitution(card: RegistrationCard): void {
    this.substitutionTarget.set(card);
  }

  protected closeSubstitution(): void {
    if (!this.substitutionSending()) this.substitutionTarget.set(null);
  }

  protected async sendSubstitution(request: SubstitutionSendRequest): Promise<void> {
    const target = this.substitutionTarget();
    if (!target || this.substitutionSending()) return;
    this.substitutionSending.set(true);
    try {
      await sendSubstitutionInvite(athleteFunctions(), {
        registrationId: target.id,
        replacedUid: request.replacedUid,
        replacedName: request.replacedName,
        inviteeUid: request.inviteeUid,
        inviteeName: request.inviteeName,
        inviterName: this.auth.user()?.displayName?.trim() || 'Atleta',
      });
      this.substitutionTarget.set(null);
      this.toasts.success(
        'Convite enviado',
        `A troca acontece quando ${request.inviteeName} aceitar.`,
      );
    } catch (err) {
      this.toasts.error(
        'Não foi possível enviar o convite',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
      );
    } finally {
      this.substitutionSending.set(false);
    }
  }

  /** `isPaid` cobre a inscrição inteira; `sharePaidUids` é o pagamento dividido, em que cada
   *  atleta quita a própria metade. */
  private paymentStateOf(r: AthleteTournamentRegistration, uid: string | null): RegistrationPaymentState {
    if (r.waitlist) return 'waitlist';
    if (r.isPaid) return 'paid';
    if (uid != null && r.sharePaidUids.includes(uid)) return 'share-paid';
    return 'pending';
  }

  protected uniformSummary(slot: RegistrationUniformSlot | null): string | null {
    if (!slot) return null;
    const parts: string[] = [];
    if (slot.sizeTop) parts.push(`Camisa ${slot.sizeTop}`);
    if (slot.sizeShorts) parts.push(`Shorts ${slot.sizeShorts}`);
    if (slot.jerseyNumber != null) parts.push(`Nº ${slot.jerseyNumber}`);
    if (slot.jerseyName) parts.push(slot.jerseyName);
    return parts.length > 0 ? parts.join(' · ') : null;
  }
}

const PAYMENT_LABEL: Record<RegistrationPaymentState, string> = {
  paid: 'Pagamento confirmado',
  'share-paid': 'Sua parte está paga',
  pending: 'Pagamento pendente',
  waitlist: 'Na lista de espera',
};

const PAYMENT_HINT: Record<RegistrationPaymentState, string> = {
  paid: 'Sua vaga está garantida.',
  'share-paid': 'Falta o seu parceiro quitar a parte dele para a vaga ser confirmada.',
  pending: 'A vaga só é confirmada depois do pagamento.',
  waitlist: 'Você entra assim que uma vaga for liberada — avisamos por notificação.',
};
