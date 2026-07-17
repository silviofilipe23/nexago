import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { athleteFunctions } from '../../data/functions';
import {
  cancelPendingRegistrationPix,
  confirmFreeRegistration,
  createRegistrationPixPayment,
  fetchMyRegistrationForCategory,
  reserveDirectOrganizerRegistration,
  TournamentRegistrationError,
  type AthleteTournamentRegistration,
  type PixPaymentResult,
} from '../../data/tournament-registrations-repository';
import { fetchTournament, type TournamentCategoryOffer, type TournamentSummary } from '../../data/tournaments-repository';

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

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '');
}

/** Pagamento real: PIX via Asaas (`createTournamentRegistrationPixPayment`, exige CPF) quando
 *  `paymentMode==='appPixCard'`, ou reserva sem cobrança online quando
 *  `paymentMode==='directWithOrganizer'` (o acerto é direto com o organizador, mostrando só a
 *  chave Pix dele). **Não existe pagamento por cartão de crédito em lugar nenhum do fluxo real**
 *  — a opção "cartão" do mock foi removida, não é um corte de escopo, é reflexo do que existe. */
@Component({
  selector: 'app-tournament-payment',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './tournament-payment.component.html',
  styleUrl: './tournament-payment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentPaymentComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

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
  protected readonly cpf = signal('');
  protected readonly notice = signal<string | null>(null);
  protected readonly processing = signal(false);
  protected readonly pixResult = signal<PixPaymentResult | null>(null);

  protected readonly totalPriceReais = computed(() => this.selectedCategory()?.entryFee ?? 0);
  protected readonly amountDueReais = computed(() => (this.amountType() === 'share' ? this.totalPriceReais() / 2 : this.totalPriceReais()));

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.noticeTimeout));
    effect(() => {
      const id = this.tournamentId();
      void this.loadData(id);
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
        this.registration.set(await fetchMyRegistrationForCategory(db, projectId, uid, id, categoryId));
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected setAmountType(type: PaymentAmountType): void {
    this.amountType.set(type);
    this.pixResult.set(null);
  }

  protected onCpfInput(value: string): void {
    this.cpf.set(onlyDigits(value).slice(0, 11));
  }

  protected async generatePix(): Promise<void> {
    const reg = this.registration();
    if (!reg || this.processing()) return;
    if (this.cpf().length !== 11) {
      this.showNotice('Informe um CPF válido (11 dígitos) para gerar o Pix.');
      return;
    }
    this.processing.set(true);
    try {
      const result = await createRegistrationPixPayment(athleteFunctions(), reg.id, this.amountType(), this.cpf());
      this.pixResult.set(result);
    } catch (err) {
      this.showNotice(err instanceof TournamentRegistrationError ? err.message : 'Não foi possível gerar o Pix.');
    } finally {
      this.processing.set(false);
    }
  }

  protected async cancelPix(): Promise<void> {
    const reg = this.registration();
    if (!reg) return;
    try {
      await cancelPendingRegistrationPix(athleteFunctions(), reg.id);
      this.pixResult.set(null);
      this.showNotice('Pix cancelado.');
    } catch (err) {
      this.showNotice(err instanceof TournamentRegistrationError ? err.message : 'Não foi possível cancelar.');
    }
  }

  protected async copyPixCode(): Promise<void> {
    const code = this.pixResult()?.qrCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.showNotice('Código Pix copiado.');
    } catch {
      this.showNotice('Não foi possível copiar — copie manualmente.');
    }
  }

  protected async confirmFree(): Promise<void> {
    const reg = this.registration();
    if (!reg || this.processing()) return;
    this.processing.set(true);
    try {
      const result = await confirmFreeRegistration(athleteFunctions(), reg.id);
      this.registration.update((r) => (r ? { ...r, isPaid: result.isPaid } : r));
      this.showNotice(result.isPaid ? 'Inscrição confirmada!' : 'Sua parte foi confirmada — aguardando seu parceiro.');
    } catch (err) {
      this.showNotice(err instanceof TournamentRegistrationError ? err.message : 'Não foi possível confirmar.');
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
      this.showNotice(result.bothAthletesReserved ? 'Reserva confirmada dos dois lados!' : 'Sua reserva foi registrada — combine o pagamento com o organizador.');
    } catch (err) {
      this.showNotice(err instanceof TournamentRegistrationError ? err.message : 'Não foi possível reservar.');
    } finally {
      this.processing.set(false);
    }
  }

  protected readonly formatBRL = formatBRL;

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}
