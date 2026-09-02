import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../auth/auth.service';
import { athleteFunctions } from '../../../../data/functions';
import { fetchPublicProfilesByIds } from '../../../../data/public-profiles-repository';
import {
  cancelSentPartnerInvite,
  TournamentRegistrationError,
  type SentPartnerInvite,
} from '../../../../data/tournament-registrations-repository';
import { NxPageLoadingComponent } from '../../../../shared/loading/nx-page-loading.component';
import { NxBlockingDialogComponent, NxToastService } from '../../../../shared/feedback';
import { RegistrationWizardShellComponent } from '../registration-wizard-shell.component';
import { RegistrationWizardStore } from '../registration-wizard.store';
import { bindWizardParams, wizardQueryParams } from '../wizard-params';

/** Quanto tempo a virada fica na tela antes de a navegação acontecer.
 *
 *  Pular direto para o pagamento no instante do aceite esconde do atleta o único momento em que
 *  ele descobre que a dupla fechou. */
const ACCEPTED_REVEAL_MS = 1500;

/** Carência antes de declarar que não há convite nenhum nesta tela.
 *
 *  O convite nasce numa callable, no SERVIDOR: o doc só chega aqui pelo push do listener, que
 *  pode perder a corrida para a navegação que a própria tela de parceiro acabou de fazer.
 *  Desistir no primeiro build devolvia o atleta ao porteiro que — sem enxergar o convite —
 *  o mandava para o consentimento ou de volta à BUSCA de parceiro. E nenhuma dessas duas telas
 *  reagia ao aceite: quem convidou ficava lá até recarregar a página. */
const MISSING_INVITE_GRACE_MS = 3000;

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function firstNameOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'seu parceiro';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/** Quanto ainda resta do convite, em texto: "48 horas", "3 horas", "1 hora". */
export function inviteRemainingLabel(expiresAt: Date | null, now = new Date()): string {
  if (expiresAt == null) return 'algumas horas';
  const minutes = Math.floor((expiresAt.getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return 'poucos minutos';
  const hours = Math.ceil(minutes / 60);
  return hours <= 1 ? '1 hora' : `${hours} horas`;
}

/** Passo 5 do wizard: **aguardando a dupla**.
 *
 *  Entre o parceiro (4) e o uniforme (6). Antes desta tela, quem enviava o convite voltava ao
 *  porteiro e caía de novo na busca de parceiro — com o campo aberto, logo depois de ter
 *  escolhido alguém.
 *
 *  Neste momento normalmente **não existe inscrição**: o backend só a cria quando o convidado
 *  aceita. Daí as duas consequências que governam a tela:
 *
 *  - **"Cancelar" cancela o CONVITE**, não a inscrição — não há inscrição a cancelar. Volta ao
 *    passo do parceiro, onde dá para convidar outra pessoa.
 *  - **O aceite chega pelo mesmo listener que desenha a tela.** `watchMySentInvites` traz os
 *    convites em qualquer status, e o aceite carimba `registrationId` no próprio convite: não é
 *    preciso um segundo listener para descobrir a inscrição que acabou de nascer.
 *
 *  E quando o convite sai do ar, o mesmo listener diz o DESFECHO (recusado, cancelado,
 *  expirado). Recusa de convite comum não gera notificação nenhuma — sem isto, um salto
 *  silencioso para trás era tudo o que o atleta veria. */
@Component({
  selector: 'app-registration-waiting',
  imports: [RegistrationWizardShellComponent, NxPageLoadingComponent, NxBlockingDialogComponent],
  templateUrl: './registration-waiting.component.html',
  styleUrls: ['../wizard-step.scss', './registration-waiting.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationWaitingComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(NxToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  protected readonly store = inject(RegistrationWizardStore);
  protected readonly params = bindWizardParams(this.store);

  protected readonly cancelling = signal(false);
  protected readonly confirmingCancel = signal(false);
  protected readonly partnerPhotoUrl = signal<string | null>(null);

  /** Uma passagem só. Sem esta guarda, cada snapshot novo rearmaria o timer e a navegação nunca
   *  chegaria a acontecer. */
  private advanceArmed = false;
  private advanceTimer: ReturnType<typeof setTimeout> | undefined;

  /** A tela já está de saída — o cancelamento apaga o convite, e o snapshot seguinte chegaria
   *  aqui como "convite sumiu"; sem a guarda, a volta ao porteiro correria com a volta ao passo
   *  do parceiro, que é o destino certo desse caso. */
  private leaving = false;

  /** Ligado quando a carência vence sem nenhum convite aparecer. */
  private readonly inviteLooksMissing = signal(false);
  private missingTimer: ReturnType<typeof setTimeout> | undefined;

  /** Enquanto o convite ainda pode estar a caminho, a tela ESPERA em vez de piscar vazia. */
  protected readonly loading = computed(
    () =>
      !this.store.tournamentLoaded() ||
      !this.store.sentInvitesLoaded() ||
      (this.invite() == null && !this.inviteLooksMissing()),
  );
  protected readonly tournament = computed(() => this.store.tournament());
  protected readonly category = computed(() => this.store.categoryById(this.params().categoryId));
  protected readonly registration = computed(
    () =>
      this.store.registrationById(this.params().registrationId) ??
      this.store.registrationFor(this.params().categoryId),
  );

  /** O convite que esta tela acompanha.
   *
   *  Preferência para o id que a rota afirma; depois o pendente mais RECENTE; e, por fim, um
   *  ACEITO da categoria — este último é o que sustenta a virada, já que filtrar por pendentes
   *  esvaziaria a tela no pior momento.
   *
   *  O mais recente, e não o mais antigo, porque a tela abre logo depois da ação: com dois
   *  convites em voo, quem acabou de convidar o Carlos não pode ler "aguardando Bruno" nem
   *  cancelar o convite errado. */
  protected readonly invite = computed<SentPartnerInvite | null>(() => {
    const p = this.params();
    const all = this.store.sentInvites();
    if (p.inviteId) {
      const match = all.find((i) => i.id === p.inviteId);
      if (match) return match;
    }
    const mine = all.filter((i) => i.tournamentId === p.tournamentId && i.categoryId === p.categoryId);
    const pending = mine.filter((i) => i.status === 'pending');
    if (pending.length > 0) {
      return [...pending].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)).at(-1) ?? null;
    }
    return mine.find((i) => i.status === 'accepted') ?? mine.at(-1) ?? null;
  });

  protected readonly accepted = computed(() => this.invite()?.status === 'accepted');

  /** O convite existe mas não está mais aguardando nem foi aceito. */
  protected readonly gone = computed(() => {
    const invite = this.invite();
    return invite != null && invite.status !== 'pending' && invite.status !== 'accepted';
  });

  protected readonly partnerName = computed(() => this.invite()?.inviteeName?.trim() || 'Parceiro');
  protected readonly partnerInitials = computed(() => initialsOf(this.partnerName()));
  protected readonly partnerFirstName = computed(() => firstNameOf(this.partnerName()));
  protected readonly remainingLabel = computed(() => inviteRemainingLabel(this.invite()?.expiresAt ?? null));

  protected readonly myInitials = computed(() => {
    const profile = this.store.profile();
    return initialsOf(profile?.nickname ?? profile?.fullName ?? this.store.accountLabel());
  });

  protected readonly myPhotoUrl = computed(() => {
    const profile = this.store.profile();
    if (profile?.profilePhotoUrl?.trim()) return profile.profilePhotoUrl.trim();
    return this.auth.user()?.photoURL ?? null;
  });

  protected readonly goneCopy = computed<{ title: string; body: string }>(() => {
    const invite = this.invite();
    const who = firstNameOf(invite?.inviteeName ?? '');
    switch (invite?.status) {
      case 'declined':
        return {
          title: `${who} não aceitou`,
          body: 'Sua vaga continua livre para outra dupla — convide outra pessoa.',
        };
      case 'cancelled':
        return { title: 'Convite cancelado', body: 'Este convite foi cancelado. Convide outra pessoa para formar a dupla.' };
      case 'expired':
        return {
          title: 'O convite expirou',
          body: `${who} não respondeu a tempo. Convide de novo, ou chame outra pessoa.`,
        };
      default:
        return {
          title: 'Convite indisponível',
          body: 'Ele não está mais aguardando resposta. Convide outra pessoa para formar a dupla.',
        };
    }
  });

  /** Reserva solo em aberto e ainda não paga: pagar o INTEGRAL garante a vaga desde já.
   *
   *  A ação viaja junto com o atleta que veio da reserva solo — deixá-la para trás na tela do
   *  parceiro a tornaria inalcançável, porque o porteiro nunca honra `step=pagamento` com
   *  parceiro pendente. */
  protected readonly canGuaranteeSpot = computed(() => {
    const reg = this.registration();
    const category = this.category();
    if (!reg || !category) return false;
    return category.entryFee > 0 && reg.partnerPending && !reg.isPaid && !this.accepted();
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.advanceTimer);
      clearTimeout(this.missingTimer);
    });

    effect((onCleanup) => {
      const uid = this.invite()?.inviteeUid?.trim() ?? '';
      const db = this.firestore;
      if (!uid || !db) {
        this.partnerPhotoUrl.set(null);
        return;
      }
      let cancelled = false;
      void fetchPublicProfilesByIds(db, [uid]).then((profiles) => {
        if (cancelled) return;
        this.partnerPhotoUrl.set(profiles.get(uid)?.avatarUrl ?? null);
      });
      onCleanup(() => {
        cancelled = true;
      });
    });

    effect(() => {
      if (this.leaving || !this.store.sentInvitesLoaded() || !this.store.tournamentLoaded()) return;
      const invite = this.invite();

      if (invite == null) {
        // Pode ser um convite recém-criado que o listener ainda não entregou — a carência
        // separa isso de "nunca houve convite aqui" (link direto, categoria errada).
        if (!this.inviteLooksMissing()) {
          this.armMissingTimer();
          return;
        }
        // Sem notícia a dar; o porteiro sabe para onde ir.
        this.leaving = true;
        this.backToGate();
        return;
      }
      // Zerar o campo, e não só o timer: `armMissingTimer` é idempotente pelo campo, e deixá-lo
      // preso travaria a tela no loader se o convite sumisse de novo.
      clearTimeout(this.missingTimer);
      this.missingTimer = undefined;

      if (invite.status === 'accepted') this.armAdvance(invite);
    });
  }

  private armMissingTimer(): void {
    if (this.missingTimer != null) return;
    this.missingTimer = setTimeout(() => this.inviteLooksMissing.set(true), MISSING_INVITE_GRACE_MS);
  }

  /** Agenda a saída da tela depois da virada. Idempotente de propósito: roda a cada snapshot.
   *
   *  O destino é o PORTEIRO com a inscrição recém-nascida na rota, não uma tela escolhida aqui:
   *  ele deriva o passo do Firestore e cobre de graça o caso de quem já tinha pago o integral
   *  na reserva solo — para esse, "o próximo passo" é a inscrição pronta, não o pagamento. */
  private armAdvance(invite: SentPartnerInvite): void {
    if (this.advanceArmed) return;
    this.advanceArmed = true;
    const registrationId = (invite.registrationId ?? this.registration()?.id ?? '').trim();
    this.advanceTimer = setTimeout(() => {
      // Aceite sem id conhecido: inventar um seria pior que perguntar ao porteiro sem ele, que
      // ainda assim deriva o passo do Firestore.
      this.leaving = true;
      this.backToGate(registrationId || null);
    }, ACCEPTED_REVEAL_MS);
  }

  // ── navegação ────────────────────────────────────────────────────────────

  /** Sair do fluxo. **Nunca** um "voltar".
   *
   *  Voltar cairia exatamente na busca de parceiro, com o campo aberto — que é o que esta etapa
   *  existe para evitar. E não há passo a desfazer: o convite já está em voo. Por isso o
   *  cabeçalho mostra um "X", não uma seta. */
  protected exit(): void {
    void this.router.navigate(['/torneios', this.params().tournamentId]);
  }

  /** Volta ao porteiro, que decide sozinho a etapa certa.
   *
   *  O aceite LGPD tem de ATRAVESSAR — sem inscrição criada ele só existe como parâmetro de
   *  rota, e perdê-lo faria a callable seguinte gravar a inscrição sem o consentimento. */
  private backToGate(registrationId: string | null = null): void {
    const p = this.params();
    void this.router.navigate(['/torneios', p.tournamentId, 'inscricao'], {
      queryParams: wizardQueryParams({
        categoryId: p.categoryId,
        registrationId,
        lgpdAccepted: p.lgpdAccepted,
      }),
      replaceUrl: true,
    });
  }

  /** Convite encerrado: o lugar do atleta é a busca de parceiro, para chamar outra pessoa. */
  protected backToPartnerStep(): void {
    const p = this.params();
    this.leaving = true;
    void this.router.navigate(['/torneios', p.tournamentId, 'inscricao', 'parceiro'], {
      queryParams: wizardQueryParams({
        categoryId: p.categoryId,
        registrationId: this.registration()?.id ?? null,
        lgpdAccepted: p.lgpdAccepted,
      }),
      replaceUrl: true,
    });
  }

  protected goToPayment(): void {
    const reg = this.registration();
    const p = this.params();
    if (!reg) return;
    void this.router.navigate(['/torneios', p.tournamentId, 'inscricao', 'pagamento'], {
      queryParams: wizardQueryParams({ categoryId: p.categoryId, registrationId: reg.id }),
    });
  }

  // ── ações ────────────────────────────────────────────────────────────────

  protected askCancel(): void {
    this.confirmingCancel.set(true);
  }

  protected dismissCancel(): void {
    this.confirmingCancel.set(false);
  }

  protected async cancelInvite(): Promise<void> {
    const invite = this.invite();
    if (!invite || this.cancelling()) return;
    this.confirmingCancel.set(false);
    this.cancelling.set(true);
    try {
      await cancelSentPartnerInvite(athleteFunctions(), invite.id);
      this.toasts.success('Convite cancelado', `${this.partnerFirstName()} não vai mais receber o pedido de dupla.`);
      // O convite acabou de sumir da coleção; quem manda no destino é esta ação, não o ramo
      // genérico de "convite encerrado".
      this.backToPartnerStep();
    } catch (err) {
      this.toasts.error(
        'Não foi possível cancelar o convite',
        err instanceof TournamentRegistrationError ? err.message : 'O convite continua valendo — tente de novo.',
      );
    } finally {
      this.cancelling.set(false);
    }
  }
}
