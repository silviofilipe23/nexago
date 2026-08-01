import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { interval } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { cpfCnpjValidationMessage, formatCpfCnpjDisplay, isValidCpfCnpj, normalizeCpfCnpj } from '../../data/cpf-cnpj';
import { athleteFunctions } from '../../data/functions';
import { buildPixBrCode, isLikelyValidPixKey } from '../../data/pix-brcode';
import { pixQrSvgDataUrl, resolvePixQrSrc } from '../../data/pix-qr';
import {
  cancelPendingRegistrationPix,
  confirmFreeRegistration,
  createRegistrationPixPayment,
  fetchMyRegistrationForCategory,
  reserveDirectOrganizerRegistration,
  TournamentRegistrationError,
  watchRegistration,
  type AthleteTournamentRegistration,
  type PixPaymentResult,
} from '../../data/tournament-registrations-repository';
import { fetchTournament, type TournamentCategoryOffer, type TournamentSummary } from '../../data/tournaments-repository';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { NxBannerComponent, NxFieldErrorComponent, NxToastService } from '../../shared/feedback';

export type PaymentAmountType = 'share' | 'full';

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

/** Pagamento real: PIX via Asaas (`createTournamentRegistrationPixPayment`, exige CPF) quando
 *  `paymentMode==='appPixCard'`, ou reserva sem cobrança online quando
 *  `paymentMode==='directWithOrganizer'` (o acerto é direto com o organizador, mostrando só a
 *  chave Pix dele). **Não existe pagamento por cartão de crédito em lugar nenhum do fluxo real**
 *  — a opção "cartão" do mock foi removida, não é um corte de escopo, é reflexo do que existe. */
@Component({
  selector: 'app-tournament-payment',
  standalone: true,
  imports: [
    RouterLink,
    AtPanelShellComponent,
    NxPageLoadingComponent,
    NxSpinnerComponent,
    NxFieldErrorComponent,
    NxBannerComponent,
  ],
  templateUrl: './tournament-payment.component.html',
  styleUrl: './tournament-payment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentPaymentComponent {
  private readonly route = inject(ActivatedRoute);
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
  protected readonly cpfCnpj = signal('');

  /** CPF/CNPJ é exigência do emissor do Pix — erro de campo, então a mensagem
   *  fica colada no input em vez de virar um toast que some. */
  protected readonly documentError = signal<string | null>(null);
  protected readonly processing = signal(false);
  protected readonly pixResult = signal<PixPaymentResult | null>(null);
  /** Data-URL do QR (Asaas ou gerado no cliente a partir do código copia-e-cola). */
  protected readonly pixQrSrc = signal<string | null>(null);
  /** QR do Pix estático do organizador (`directWithOrganizer`). */
  protected readonly organizerQrSrc = signal<string | null>(null);
  protected readonly pixExpired = signal(false);

  private readonly nowMs = signal(Date.now());
  private readonly pixExpiresAtMs = signal<number | null>(null);
  private expiryTimeout: ReturnType<typeof setTimeout> | undefined;
  private unsubscribeRegistrationWatch: (() => void) | undefined;
  private watchedRegistrationId: string | null = null;

  protected readonly totalPriceReais = computed(() => this.selectedCategory()?.entryFee ?? 0);
  protected readonly amountDueReais = computed(() => (this.amountType() === 'share' ? this.totalPriceReais() / 2 : this.totalPriceReais()));
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

  /** Parcela do atleta já paga (pagamento dividido) — falta só a do parceiro. */
  protected readonly mySharePaid = computed(() => {
    const reg = this.registration();
    const uid = this.auth.user()?.uid;
    return reg != null && !reg.isPaid && uid != null && reg.sharePaidUids.includes(uid);
  });

  /** Contagem regressiva `m:ss` até o Pix expirar (null sem cobrança ativa). */
  protected readonly pixCountdownLabel = computed(() => {
    const expiresAt = this.pixExpiresAtMs();
    if (expiresAt == null) return null;
    const totalSec = Math.floor(Math.max(0, expiresAt - this.nowMs()) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  });

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.nowMs.set(Date.now()));

    this.destroyRef.onDestroy(() => {
      clearTimeout(this.expiryTimeout);
      this.unsubscribeRegistrationWatch?.();
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
        this.startRegistrationWatch(reg?.id ?? null);
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

  private onRegistrationUpdate(snap: AthleteTournamentRegistration | null): void {
    if (!snap) return;
    const wasPaid = this.registration()?.isPaid === true;
    this.registration.set(snap);
    if (snap.isPaid) {
      this.clearPixState();
      if (!wasPaid) {
        this.toasts.success('Inscrição confirmada', 'Sua vaga está garantida. As chaves saem quando o organizador publicar.');
      }
      return;
    }
    const uid = this.auth.user()?.uid;
    if (uid && snap.sharePaidUids.includes(uid) && this.pixResult()) {
      this.clearPixState();
      this.toasts.success('Sua parte foi paga', 'A inscrição fecha assim que seu parceiro pagar a parte dele.');
    }
  }

  private clearPixState(): void {
    clearTimeout(this.expiryTimeout);
    this.pixResult.set(null);
    this.pixQrSrc.set(null);
    this.pixExpiresAtMs.set(null);
    this.pixExpired.set(false);
  }

  protected setAmountType(type: PaymentAmountType): void {
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
    if (!this.pixResult()) return;
    this.pixResult.set(null);
    this.pixQrSrc.set(null);
    this.pixExpiresAtMs.set(null);
    this.pixExpired.set(true);
    this.toasts.warning(
      'O código Pix expirou',
      'Nenhum valor foi cobrado e sua vaga segue reservada. Gere um novo código para pagar.',
      { label: 'Gerar novo código', run: () => void this.generatePix() },
    );
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

  protected async reserveDirect(): Promise<void> {
    const reg = this.registration();
    if (!reg || this.processing()) return;
    this.processing.set(true);
    try {
      const result = await reserveDirectOrganizerRegistration(athleteFunctions(), reg.id);
      if (result.bothAthletesReserved) {
        this.toasts.success(
          'Reserva confirmada dos dois lados',
          'Avise o organizador do torneio que o pagamento foi feito para ele liberar a vaga.',
        );
      } else {
        this.toasts.success(
          'Sua reserva foi registrada',
          'Avise o organizador do torneio que o pagamento foi feito para ele liberar a vaga.',
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
