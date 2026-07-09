import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { MOCK_DISCOVERY_TOURNAMENTS } from '../tournament-discovery.mock';
import type { DiscoveryTournament } from '../tournament-discovery.models';
import { getTournamentDetailExtra, type TournamentCategoryOffer } from '../tournament-detail.mock';
import type { DuoOption, PaymentSplitOption } from './tournament-registration-shell.component';

export type TournamentPaymentMethod = 'pix' | 'card';

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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AT';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

function parsePriceLabelToReais(label: string): number {
  const digits = label.replace(/\D/g, '');
  if (!digits) return 0;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

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
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly tournamentId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  protected readonly queryParams = computed(() => {
    const qp = this.route.snapshot.queryParamMap;
    return {
      categoria: qp.get('categoria'),
      duo: qp.get('duo'),
      payment: (qp.get('payment') === 'full' ? 'full' : 'split') as PaymentSplitOption,
    };
  });

  protected readonly listing = computed<DiscoveryTournament | null>(() => {
    const id = this.tournamentId();
    return MOCK_DISCOVERY_TOURNAMENTS.find((t) => t.id === id) ?? null;
  });

  protected readonly categories = computed<TournamentCategoryOffer[]>(() => {
    const listing = this.listing();
    if (!listing) return [];
    return getTournamentDetailExtra(listing.id, listing).categories;
  });

  protected readonly selectedCategory = computed<TournamentCategoryOffer | null>(() => {
    const cats = this.categories();
    if (cats.length === 0) return null;
    const id = this.queryParams().categoria;
    return cats.find((c) => c.id === id) ?? cats[0] ?? null;
  });

  protected readonly duoOptions = computed<DuoOption[]>(() => {
    const me = this.accountLabel();
    return [
      {
        id: 'duo-fixed-1',
        label: `${me} & Bruno V.`,
        meta: 'Dupla fixa · Intermediário',
        initialsA: initialsOf(me),
        initialsB: 'BR',
      },
      {
        id: 'duo-fixed-2',
        label: `${me} & Enzo`,
        meta: 'Dupla fixa · Iniciante',
        initialsA: initialsOf(me),
        initialsB: 'EN',
      },
    ];
  });

  protected readonly duoLabel = computed(() => {
    const duoId = this.queryParams().duo;
    if (duoId === 'invite') return 'Convite pendente';
    return this.duoOptions().find((d) => d.id === duoId)?.label ?? '—';
  });

  protected readonly totalPriceReais = computed(() => {
    const cat = this.selectedCategory();
    return cat ? parsePriceLabelToReais(cat.priceLabel) : 0;
  });

  protected readonly installmentPriceReais = computed(() => {
    const total = this.totalPriceReais();
    return this.queryParams().payment === 'split' ? Math.max(1, Math.round(total / 2)) : total;
  });

  protected readonly selectedMethod = signal<TournamentPaymentMethod>('pix');
  protected readonly notice = signal<string | null>(null);

  protected readonly backQueryParams = computed(() => {
    const p = this.queryParams();
    return { categoria: p.categoria };
  });

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.noticeTimeout));
  }

  protected selectMethod(method: TournamentPaymentMethod): void {
    this.selectedMethod.set(method);
  }

  protected copyPixCode(): void {
    this.showNotice('O código Pix ainda não está disponível — em breve por aqui.');
  }

  protected confirmPayment(): void {
    this.showNotice(
      'A confirmação de pagamento chega em breve por aqui. Por enquanto, combine com o organizador do torneio.',
    );
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}
