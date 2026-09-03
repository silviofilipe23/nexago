import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { interval } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { cpfCnpjValidationMessage, formatCpfCnpjDisplay, isValidCpfCnpj, normalizeCpfCnpj } from '../../data/cpf-cnpj';
import { canRegeneratePix } from './registration-hold';
import { athleteFunctions } from '../../data/functions';
import { buildPixBrCode, isLikelyValidPixKey } from '../../data/pix-brcode';
import { pixQrSvgDataUrl, resolvePixQrSrc } from '../../data/pix-qr';
import {
  cancelPendingRegistrationPix,
  confirmFreeRegistration,
  createRegistrationCardPayment,
  createRegistrationPixPayment,
  fetchMyRegistrationForCategory,
  reserveDirectOrganizerRegistration,
  sentPendingInvitesFor,
  TournamentRegistrationError,
  watchMySentInvites,
  watchRegistration,
  type AthleteTournamentRegistration,
  type CardPaymentResult,
  type PixPaymentResult,
  type SentPartnerInvite,
} from '../../data/tournament-registrations-repository';
import { fetchTournament, type TournamentCategoryOffer, type TournamentSummary } from '../../data/tournaments-repository';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import {
  NxBlockingDialogComponent,
  NxFieldErrorComponent,
  NxToastService,
} from '../../shared/feedback';
import { resolveDirectPaymentState, type DirectPaymentState } from './direct-payment-state';
import { RegistrationHoldNoticeComponent } from './registration-hold-notice.component';
import { shouldShowRegistrationHoldCountdown, registrationHoldCountdownView } from './registration-hold';

export type PaymentAmountType = 'share' | 'full';

export type PaymentMethod = 'pix' | 'card';

/** Modo de pagamento do torneio → meios oferecidos ao atleta. Modo ausente é
 *  cobrança pelo app: é o padrão de todo torneio do acervo. */
export function resolvePaymentMethods(
  paymentMode: string | null | undefined,
): ReadonlyArray<PaymentMethod> {
  return paymentMode === 'directWithOrganizer' ? [] : ['pix', 'card'];
}

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  return local ? titleCase(local) : 'Atleta';
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Mesmo fallback do app (`tournamentRegistrationPixExpiryFallback`). */
const PIX_EXPIRY_FALLBACK_MS = 15 * 60_000;

/** Quanto tempo a confirmação fica na tela antes de a navegação acontecer.
 *
 *  Mesmo motivo do reveal da tela de espera: sair no instante em que o pagamento cai esconderia
 *  do atleta o único momento em que ele vê "inscrição confirmada". */
const PAID_REVEAL_MS = 2000;

/** Pagamento real quando `paymentMode==='appPixCard'`: PIX via Asaas
 *  (`createTournamentRegistrationPixPayment`) ou cartão de crédito
 *  (`createTournamentRegistrationCardPayment`), os dois exigindo CPF. O cartão devolve o
 *  `invoiceUrl` do checkout HOSPEDADO do Asaas — nenhum dado de cartão passa por esta tela.
 *
 *  Com `paymentMode==='directWithOrganizer'` não há cobrança online: o acerto é direto com o
 *  organizador e a tela mostra só a chave Pix dele. */
@Component({
  selector: 'app-tournament-payment',
  standalone: true,
  imports: [
    RouterLink,
    AtPanelShellComponent,
    NxPageLoadingComponent,
    NxSpinnerComponent,
    NxFieldErrorComponent,
    NxBlockingDialogComponent,
    RegistrationHoldNoticeComponent,
  ],
  templateUrl: './tournament-payment.component.html',
  styleUrl: './tournament-payment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentPaymentComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  private readonly toasts = inject(NxToastService);

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly tournamentId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');
  protected readonly categoryIdParam = computed(() => this.route.snapshot.queryParamMap.get('categoria'));

  protected readonly backQueryParams = computed(() => ({ categoria: this.categoryIdParam() }));

  protected readonly loading = signal(true);
  protected readonly listing = signal<TournamentSummary | null>(null);
  protected readonly registration = signal<AthleteTournamentRegistration | null>(null);

  protected readonly selectedCategory = computed<TournamentCategoryOffer | null>(() => {
    const cats = this.listing()?.categories ?? [];
    const id = this.categoryIdParam();
    return cats.find((c) => c.id === id) ?? cats[0] ?? null;
  });

  protected readonly amountType = signal<PaymentAmountType>('share');
  /** Depois que o atleta mexe no toggle, a pré-seleção automática não fala mais. */
  private amountTypeTouched = false;
  protected readonly cpfCnpj = signal('');

  /** CPF/CNPJ é exigência do emissor do Pix — erro de campo, então a mensagem
   *  fica colada no input em vez de virar um toast que some. */
  protected readonly documentError = signal<string | null>(null);
  protected readonly processing = signal(false);
  protected readonly pixResult = signal<PixPaymentResult | null>(null);
  /** Cobrança de cartão viva — o pagamento em si acontece no checkout do Asaas. */
  protected readonly cardResult = signal<CardPaymentResult | null>(null);
  protected readonly method = signal<PaymentMethod>('pix');
  protected readonly methods = computed(() => resolvePaymentMethods(this.listing()?.paymentMode));
  /** Uma cobrança viva por vez, seja qual for o meio. */
  protected readonly hasLiveCharge = computed(() => !!this.pixResult() || !!this.cardResult());
  /** Data-URL do QR (Asaas ou gerado no cliente a partir do código copia-e-cola). */
  protected readonly pixQrSrc = signal<string | null>(null);
  /** QR do Pix estático do organizador (`directWithOrganizer`). */
  protected readonly organizerQrSrc = signal<string | null>(null);
  protected readonly pixExpired = signal(false);

  private readonly nowMs = signal(Date.now());
  private readonly pixExpiresAtMs = signal<number | null>(null);
  private expiryTimeout: ReturnType<typeof setTimeout> | undefined;
  private unsubscribeRegistrationWatch: (() => void) | undefined;
  private unsubscribeSentInvitesWatch: (() => void) | undefined;
  private watchedRegistrationId: string | null = null;
  private watchedSentInvitesKey: string | null = null;
  private holdExpiryRedirectHandled = false;

  /** Uma saída só depois do pagamento confirmado — ver `goToMyRegistration`. */
  private paidRedirectArmed = false;
  private paidRedirectTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly sentInvites = signal<readonly SentPartnerInvite[]>([]);

  protected readonly totalPriceReais = computed(() => this.selectedCategory()?.entryFee ?? 0);
  /** Elenco da inscrição (equipe trio+ = 3–5; dupla = 2) — divide a taxa por atleta. */
  protected readonly teamSize = computed(
    () => this.registration()?.teamSize ?? this.selectedCategory()?.teamSize ?? 2,
  );
  protected readonly isTeamRegistration = computed(() => this.teamSize() > 2);
  /** Valor exibido antes de gerar a cobrança — a cota exata (com resto de centavos) é do
   *  servidor; aqui é a divisão simples da taxa pelo elenco. */
  protected readonly amountDueReais = computed(() =>
    this.amountType() === 'share' ? this.totalPriceReais() / this.teamSize() : this.totalPriceReais(),
  );
  /** Copies dos botões de valor — "metade da dupla" vira "cota da equipe" no trio+. */
  protected readonly shareHint = computed(() =>
    this.isTeamRegistration() ? `Sua cota (1/${this.teamSize()} da equipe)` : 'Metade da inscrição da dupla',
  );
  protected readonly fullHint = computed(() => {
    if (this.isTeamRegistration()) return 'Valor total da equipe';
    return this.partnerPending() ? 'Garante sua vaga — o parceiro entra sem taxa' : 'Valor total da dupla';
  });
  protected readonly fullLabel = computed(() => (this.isTeamRegistration() ? 'Total da equipe' : 'Total da dupla'));
  protected readonly cpfCnpjDisplay = computed(() => formatCpfCnpjDisplay(this.cpfCnpj()));

  /** BR Code estático do organizador (QR + copia-e-cola), com valor da parcela escolhida.
   *
   *  Merchant City (campo 60) precisa ser uma cidade de verdade — "BRASIL" é
   *  rejeitado por alguns bancos. Sem cidade na config do Pix do organizador,
   *  usamos a cidade do torneio; "BRASIL" fica só como último recurso.
   *  O TXID identifica o torneio no extrato do organizador (era `***`). */
  protected readonly organizerBrCode = computed(() => {
    const t = this.listing();
    const pix = t?.organizerPix;
    if (t?.paymentMode !== 'directWithOrganizer' || !pix || !isLikelyValidPixKey(pix.key)) return null;
    return buildPixBrCode({
      key: pix.key,
      keyType: pix.keyType,
      recipientName: pix.recipientName || 'RECEBEDOR',
      city: pix.city || t.city || 'BRASIL',
      amount: this.amountDueReais(),
      txid: `INSC${this.tournamentId()}`,
    });
  });

  /** Inscrição solo (dupla sem parceiro ainda). */
  protected readonly partnerPending = computed(() => this.registration()?.partnerPending === true);

  /** Solo pagou o valor integral: vaga garantida, falta convidar o parceiro (entra sem taxa). */
  protected readonly paidAwaitingPartner = computed(
    () => this.registration()?.isPaid === true && this.partnerPending(),
  );

  /** Parcela do atleta já paga (pagamento dividido) — falta só a do parceiro. */
  protected readonly mySharePaid = computed(() => {
    const reg = this.registration();
    const uid = this.auth.user()?.uid;
    return reg != null && !reg.isPaid && uid != null && reg.sharePaidUids.includes(uid);
  });

  /** Estado do pagamento direto com o organizador — regra em `direct-payment-state.ts`.
   *  Antes deste estado a tela não mudava depois do "Já paguei": o ramo de `directWithOrganizer`
   *  era avaliado antes de `mySharePaid()` e engolia tudo, deixando o Pix e o botão na tela como
   *  se nada tivesse acontecido. */
  protected readonly directState = computed<DirectPaymentState>(() => {
    const reg = this.registration();
    if (!reg) return 'idle';
    return resolveDirectPaymentState({ registration: reg, myUid: this.auth.user()?.uid ?? null });
  });

  /** Pix recolhido nos estados pós-declaração (o parceiro ainda pode pedir o código). */
  protected readonly showDeclaredPix = signal(false);
  /** Confirmação antes de declarar: a declaração é irreversível pelo app e aciona o organizador. */
  protected readonly confirmingDeclaration = signal(false);

  /** Contagem regressiva `m:ss` até o Pix expirar (null sem cobrança ativa). */
  protected readonly pixCountdownLabel = computed(() => {
    const expiresAt = this.pixExpiresAtMs();
    if (expiresAt == null) return null;
    const totalSec = Math.floor(Math.max(0, expiresAt - this.nowMs()) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  });

  protected readonly hasLivePartnerInvite = computed(() => {
    const tournamentId = this.tournamentId();
    const categoryId = this.categoryIdParam();
    if (!tournamentId || !categoryId) return false;
    return sentPendingInvitesFor(this.sentInvites(), tournamentId, categoryId).length > 0;
  });

  protected readonly showHoldCountdown = computed(() =>
    shouldShowRegistrationHoldCountdown({
      holdExpiresAt: this.registration()?.holdExpiresAt ?? null,
      isPaid: this.registration()?.isPaid === true,
      hasLivePartnerInvite: this.hasLivePartnerInvite(),
    }),
  );

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.nowMs.set(Date.now()));

    this.destroyRef.onDestroy(() => {
      clearTimeout(this.expiryTimeout);
      clearTimeout(this.paidRedirectTimer);
      this.unsubscribeRegistrationWatch?.();
      this.unsubscribeSentInvitesWatch?.();
    });

    effect(() => {
      const id = this.tournamentId();
      void this.loadData(id);
    });

    effect((onCleanup) => {
      const brCode = this.organizerBrCode();
      if (!brCode) {
        this.organizerQrSrc.set(null);
        return;
      }
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });
      void pixQrSvgDataUrl(brCode).then((src) => {
        if (!cancelled) this.organizerQrSrc.set(src);
      });
    });

    effect(() => {
      if (this.loading() || this.holdExpiryRedirectHandled) return;
      const reg = this.registration();
      const tournamentId = this.tournamentId();
      if (!reg || !tournamentId || reg.isPaid) return;
      if (
        !shouldShowRegistrationHoldCountdown({
          holdExpiresAt: reg.holdExpiresAt,
          isPaid: false,
          hasLivePartnerInvite: this.hasLivePartnerInvite(),
        })
      ) {
        return;
      }
      const view = registrationHoldCountdownView({
        holdExpiresAt: reg.holdExpiresAt!,
        holdMinutes: this.listing()?.registrationHoldMinutes ?? 30,
        now: new Date(this.nowMs()),
      });
      if (!view.expired) return;
      this.holdExpiryRedirectHandled = true;
      void this.onHoldExpired(tournamentId, reg.id);
    });
  }

  private async onHoldExpired(tournamentId: string, registrationId: string): Promise<void> {
    this.clearPixState();
    if (this.pixResult()) {
      try {
        await cancelPendingRegistrationPix(athleteFunctions(), registrationId);
      } catch {
        // Mesmo comportamento do Pix expirado: a vaga já caiu, não vira erro na tela.
      }
    }
    this.toasts.warning(
      'Prazo da vaga encerrado',
      'Sua vaga foi liberada. Volte ao torneio se ainda quiser se inscrever.',
    );
    await this.router.navigate(['/torneios', tournamentId]);
  }

  private async loadData(id: string): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    const uid = this.auth.user()?.uid;
    if (!db || !projectId || !id) {
      this.listing.set(null);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const tournament = await fetchTournament(db, id);
      this.listing.set(tournament);
      const categoryId = this.categoryIdParam() ?? tournament?.categories[0]?.id;
      if (uid && categoryId) {
        const reg = await fetchMyRegistrationForCategory(db, projectId, uid, id, categoryId);
        this.registration.set(reg);
        // Solo de dupla abre em "Integral": quem chega aqui sem parceiro veio garantir a vaga,
        // e a parcela sozinha não garante nada. Em equipe (trio+) fica em 'share' — o integral
        // é o valor da equipe inteira, grande demais para pré-selecionar.
        if (
          !this.amountTypeTouched &&
          reg?.partnerPending === true &&
          !reg.isPaid &&
          reg.teamSize == null
        ) {
          this.amountType.set('full');
        }
        this.startRegistrationWatch(reg?.id ?? null);
        this.startSentInvitesWatch(id, uid);
      }
    } finally {
      this.loading.set(false);
    }
  }

  /** Espelha o listener do app na tela de PIX: `isPaid` fecha o fluxo na hora; parcela do
   *  atleta paga (`sharePaidUids`) derruba o QR e avisa que falta o parceiro. */
  private startRegistrationWatch(registrationId: string | null): void {
    if (this.watchedRegistrationId === registrationId) return;
    this.unsubscribeRegistrationWatch?.();
    this.unsubscribeRegistrationWatch = undefined;
    this.watchedRegistrationId = registrationId;
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId || !registrationId) return;
    this.unsubscribeRegistrationWatch = watchRegistration(db, projectId, registrationId, (snap) => this.onRegistrationUpdate(snap));
  }

  /** Convites pendentes escondem o relógio da vaga — a contagem acompanha o convite. */
  private startSentInvitesWatch(tournamentId: string, uid: string): void {
    const key = `${tournamentId}:${uid}`;
    if (this.watchedSentInvitesKey === key) return;
    this.unsubscribeSentInvitesWatch?.();
    this.unsubscribeSentInvitesWatch = undefined;
    this.watchedSentInvitesKey = key;
    const db = this.firestore;
    if (!db) {
      this.sentInvites.set([]);
      return;
    }
    this.unsubscribeSentInvitesWatch = watchMySentInvites(
      db,
      uid,
      tournamentId,
      (invites) => this.sentInvites.set(invites),
      () => this.sentInvites.set([]),
    );
  }

  private onRegistrationUpdate(snap: AthleteTournamentRegistration | null): void {
    if (!snap) return;
    const previous = this.registration();
    const wasPaid = previous?.isPaid === true;
    this.registration.set(snap);
    if (snap.isPaid) {
      this.clearPixState();
      if (!wasPaid) {
        // Solo pagou o valor integral: a vaga é dele, mas ainda falta o parceiro — o convite
        // (sem taxa) é o próximo passo, não a confirmação da dupla.
        if (snap.partnerPending) {
          this.toasts.success(
            'Vaga garantida!',
            'Você pagou o valor integral — convide seu parceiro, ele entra sem taxa.',
          );
        } else if (this.directState() === 'waitingOrganizer') {
          // No modo direto ninguém viu o dinheiro ainda — a vaga vale, mas quem confirma o
          // recebimento é o organizador. Anunciar "pagamento confirmado" aqui seria adiantar
          // uma etapa que a tela logo abaixo diz que está pendente.
          this.toasts.success(
            'Pagamento informado',
            'A vaga da dupla está garantida. O organizador vai conferir o recebimento e confirmar.',
          );
        } else {
          this.toasts.success('Inscrição confirmada', 'Sua vaga está garantida. As chaves saem quando o organizador publicar.');
        }
      }
      // Pagamento pode cair enquanto o atleta olha a tela (webhook do Pix) — o fluxo acabou
      // aqui, e o lugar dele é a inscrição pronta. Sem isto a tela ficava parada num cartão de
      // confirmação e a aba "Minha inscrição" só aparecia recarregando a página.
      //
      // Só a TRANSIÇÃO de uma inscrição que esta tela já conhecia em aberto: abrir o pagamento
      // de uma inscrição já paga (link antigo, voltar do navegador) não é "confirmou agora", e
      // sequestrar a navegação nesse caso tiraria o atleta de onde ele pediu para estar.
      if (previous != null && !wasPaid && !snap.partnerPending) this.goToMyRegistration();
      return;
    }
    const uid = this.auth.user()?.uid;
    if (uid && snap.sharePaidUids.includes(uid) && this.pixResult()) {
      this.clearPixState();
      this.toasts.success('Sua parte foi paga', 'A inscrição fecha assim que seu parceiro pagar a parte dele.');
    }
  }

  /** Fim do fluxo: a inscrição pronta é a aba "Minha inscrição" do torneio — o mesmo destino
   *  que o porteiro do wizard dá ao passo `sucesso`.
   *
   *  Só depois do reveal, e uma vez só: o listener continua entregando snapshots depois do
   *  pagamento (baixa do organizador, uniforme do parceiro) e cada um rearmaria a navegação. */
  private goToMyRegistration(): void {
    if (this.paidRedirectArmed) return;
    this.paidRedirectArmed = true;
    const tournamentId = this.tournamentId();
    this.paidRedirectTimer = setTimeout(() => {
      void this.router.navigate(['/torneios', tournamentId, 'minha-inscricao'], { replaceUrl: true });
    }, PAID_REVEAL_MS);
  }

  private clearPixState(): void {
    clearTimeout(this.expiryTimeout);
    this.pixResult.set(null);
    this.pixQrSrc.set(null);
    this.cardResult.set(null);
    this.pixExpiresAtMs.set(null);
    this.pixExpired.set(false);
  }

  protected setAmountType(type: PaymentAmountType): void {
    this.amountTypeTouched = true;
    this.amountType.set(type);
    this.clearPixState();
  }

  protected onDocumentInput(value: string): void {
    this.cpfCnpj.set(normalizeCpfCnpj(value).slice(0, 14));
  }

  protected async generatePix(): Promise<void> {
    const reg = this.registration();
    if (!reg || this.processing()) return;
    if (!isValidCpfCnpj(this.cpfCnpj())) {
      this.documentError.set(
        cpfCnpjValidationMessage(this.cpfCnpj()) ?? 'Informe um CPF ou CNPJ válido para gerar o Pix.',
      );
      return;
    }
    this.processing.set(true);
    try {
      const result = await createRegistrationPixPayment(athleteFunctions(), reg.id, this.amountType(), this.cpfCnpj());
      this.pixResult.set(result);
      this.pixQrSrc.set(await resolvePixQrSrc(result));
      this.pixExpired.set(false);
      this.documentError.set(null);
      this.schedulePixExpiry(result.expiresAt);
    } catch (err) {
      this.toasts.error(
        'Não foi possível gerar o Pix',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu. Nenhum valor foi cobrado.',
        { label: 'Tentar novamente', run: () => void this.generatePix() },
      );
    } finally {
      this.processing.set(false);
    }
  }

  protected setMethod(method: PaymentMethod): void {
    if (this.hasLiveCharge()) return;
    this.method.set(method);
    this.documentError.set(null);
  }

  /** Abre a cobrança de cartão. O atleta paga no checkout HOSPEDADO do Asaas —
   *  daqui sai só um link. A confirmação chega pelo webhook, no mesmo listener
   *  que já vira a tela no Pix. */
  protected async generateCardCheckout(): Promise<void> {
    const reg = this.registration();
    if (!reg || this.processing()) return;
    if (!isValidCpfCnpj(this.cpfCnpj())) {
      this.documentError.set(
        cpfCnpjValidationMessage(this.cpfCnpj()) ?? 'Informe um CPF ou CNPJ válido para pagar com cartão.',
      );
      return;
    }
    this.processing.set(true);
    try {
      const result = await createRegistrationCardPayment(athleteFunctions(), reg.id, this.amountType(), this.cpfCnpj());
      // Uma cobrança viva por vez: duas seriam duas chances de pagar a mesma cota.
      this.pixResult.set(null);
      this.pixQrSrc.set(null);
      this.cardResult.set(result);
      this.pixExpired.set(false);
      this.documentError.set(null);
      this.schedulePixExpiry(result.expiresAt);
    } catch (err) {
      this.toasts.error(
        'Não foi possível abrir o checkout',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu. Nenhum valor foi cobrado.',
        { label: 'Tentar novamente', run: () => void this.generateCardCheckout() },
      );
    } finally {
      this.processing.set(false);
    }
  }

  /** `expiresAt` do backend (fallback 15 min, como o app); ao expirar, cancela a cobrança
   *  pendente e volta pro formulário com o aviso de expirado. */
  private schedulePixExpiry(expiresAtIso: string): void {
    clearTimeout(this.expiryTimeout);
    const parsed = Date.parse(expiresAtIso);
    const expiresAt = Number.isFinite(parsed) && parsed > Date.now() ? parsed : Date.now() + PIX_EXPIRY_FALLBACK_MS;
    this.pixExpiresAtMs.set(expiresAt);
    this.expiryTimeout = setTimeout(() => void this.onPixExpired(), expiresAt - Date.now());
  }

  private async onPixExpired(): Promise<void> {
    const reg = this.registration();
    const wasCard = !!this.cardResult();
    if (!this.pixResult() && !wasCard) return;
    this.pixResult.set(null);
    this.pixQrSrc.set(null);
    this.cardResult.set(null);
    this.pixExpiresAtMs.set(null);
    this.pixExpired.set(true);
    // Perto do fim do prazo o servidor recusa abrir outra cobrança: oferecer
    // "gerar novo código" ali mandaria o atleta bater numa porta fechada.
    if (canRegeneratePix({ holdExpiresAt: reg?.holdExpiresAt ?? null })) {
      this.toasts.warning(
        wasCard ? 'O checkout expirou' : 'O código Pix expirou',
        'Nenhum valor foi cobrado e sua vaga segue reservada. Gere uma nova cobrança para pagar.',
        wasCard
          ? { label: 'Abrir novo checkout', run: () => void this.generateCardCheckout() }
          : { label: 'Gerar novo código', run: () => void this.generatePix() },
      );
    } else {
      this.toasts.warning(
        'O prazo da sua vaga acabou',
        'Nenhum valor foi cobrado. Não há mais tempo para concluir o pagamento — a vaga volta para o público.',
      );
    }
    if (reg) {
      try {
        await cancelPendingRegistrationPix(athleteFunctions(), reg.id);
      } catch {
        // Mesmo comportamento do app: expiração não vira erro pro atleta.
      }
    }
  }

  protected async cancelPix(): Promise<void> {
    const reg = this.registration();
    if (!reg) return;
    try {
      await cancelPendingRegistrationPix(athleteFunctions(), reg.id);
      this.clearPixState();
      this.toasts.success('Pix cancelado', 'A cobrança foi desfeita — você pode gerar outra quando quiser.');
    } catch (err) {
      this.toasts.error(
        'Não foi possível cancelar',
        err instanceof TournamentRegistrationError ? err.message : 'A cobrança continua ativa — tente de novo.',
      );
    }
  }

  protected async copyPixCode(): Promise<void> {
    const code = this.pixResult()?.qrCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.toasts.success('Código Pix copiado', 'Cole no app do seu banco para concluir o pagamento.');
    } catch {
      this.toasts.error('Não foi possível copiar', 'Selecione o código na tela e copie manualmente.');
    }
  }

  protected async copyOrganizerPix(): Promise<void> {
    const code = this.organizerBrCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.toasts.success('Código Pix copiado', 'Cole no app do seu banco para concluir o pagamento.');
    } catch {
      this.toasts.error('Não foi possível copiar', 'Selecione o código na tela e copie manualmente.');
    }
  }

  protected async confirmFree(): Promise<void> {
    const reg = this.registration();
    if (!reg || this.processing()) return;
    this.processing.set(true);
    try {
      const result = await confirmFreeRegistration(athleteFunctions(), reg.id);
      this.registration.update((r) => (r ? { ...r, isPaid: result.isPaid } : r));
      if (result.isPaid) {
        this.toasts.success('Inscrição confirmada', 'Sua vaga está garantida neste torneio.');
        // A atualização otimista acima já marcou `isPaid`, então o snapshot seguinte chega ao
        // listener como "já estava pago" e não dispara a saída — ela sai daqui.
        if (!reg.partnerPending) this.goToMyRegistration();
      } else {
        this.toasts.success('Sua parte foi confirmada', 'A inscrição fecha quando seu parceiro confirmar a dele.');
      }
    } catch (err) {
      this.toasts.error(
        'Não foi possível confirmar',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
        { label: 'Tentar novamente', run: () => void this.confirmFree() },
      );
    } finally {
      this.processing.set(false);
    }
  }

  /** Abre a confirmação. Declarar não tem desfazer no app e agora aciona o organizador, então o
   *  clique acidental é caro — vale uma pergunta antes. */
  protected askToDeclare(): void {
    if (this.processing()) return;
    this.confirmingDeclaration.set(true);
  }

  protected cancelDeclaration(): void {
    this.confirmingDeclaration.set(false);
  }

  protected confirmDeclaration(): void {
    this.confirmingDeclaration.set(false);
    void this.reserveDirect();
  }

  protected async reserveDirect(): Promise<void> {
    const reg = this.registration();
    if (!reg || this.processing()) return;
    this.processing.set(true);
    try {
      const wasPartnerPending = reg.partnerPending;
      const result = await reserveDirectOrganizerRegistration(athleteFunctions(), reg.id, this.amountType());
      this.showDeclaredPix.set(false);
      if (result.bothAthletesReserved) {
        if (wasPartnerPending) {
          this.toasts.success(
            'Vaga garantida!',
            'Você informou o pagamento integral — convide seu parceiro, ele entra sem taxa. O organizador vai conferir o recebimento.',
          );
        } else {
          this.toasts.success(
            'Pagamento informado',
            'A vaga da dupla está garantida. O organizador foi avisado e vai confirmar o recebimento.',
          );
        }
      } else {
        this.toasts.success(
          'Sua parte foi informada',
          'A inscrição fecha quando seu parceiro informar o pagamento dele.',
        );
      }
    } catch (err) {
      this.toasts.error(
        'Não foi possível reservar',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
        { label: 'Tentar novamente', run: () => void this.reserveDirect() },
      );
    } finally {
      this.processing.set(false);
    }
  }

  protected readonly formatBRL = formatBRL;

}
