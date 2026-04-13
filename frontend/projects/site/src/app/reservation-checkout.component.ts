import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import gsap from 'gsap';
import { prefersReducedMotion } from './landing/animations/gsap-setup';

interface Reservation {
  arenaName: string;
  date: string;
  time: string;
  price: number;
  listedPrice: number;
}

export type CheckoutPaymentMethod = 'mp' | 'arena';

@Component({
  selector: 'app-reservation-checkout',
  standalone: true,
  templateUrl: './reservation-checkout.component.html',
  styleUrls: ['./reservation-checkout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationCheckoutComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cardRef = viewChild<HTMLElement>('checkoutCard');
  private countdownTimerId: ReturnType<typeof setInterval> | null = null;
  private readonly holdDurationSec = 5 * 60;

  /** Mercado Pago (online) ou pagamento no local — alinha com status no backend (CONFIRMED vs PAY_AT_ARENA). */
  readonly paymentMethod = signal<CheckoutPaymentMethod>('mp');

  readonly reservation = computed<Reservation>(() => {
    const qp = this.route.snapshot.queryParamMap;
    const price = Math.max(0, Number(qp.get('price') ?? 80) || 0);
    const listedPriceRaw = Number(qp.get('listedPrice') ?? '');
    const listedPrice =
      Number.isFinite(listedPriceRaw) && listedPriceRaw > 0
        ? Math.round(listedPriceRaw)
        : Math.round(price * 1.12);

    return {
      arenaName: qp.get('arena') ?? 'Arena Central',
      date: qp.get('date') ?? '09 Abril',
      time: qp.get('time') ?? '18:00',
      price,
      listedPrice: Math.max(price, listedPrice),
    };
  });
  readonly isLoading = signal(false);
  readonly countdown = signal(this.holdDurationSec);
  readonly countdownLabel = computed(() => {
    const total = this.countdown();
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  });
  readonly isExpired = computed(() => this.countdown() <= 0);
  readonly holdProgress = computed(() => {
    const pct = (this.countdown() / this.holdDurationSec) * 100;
    return `${Math.max(0, Math.min(100, pct)).toFixed(2)}%`;
  });
  readonly timerTone = computed<'safe' | 'warn' | 'danger'>(() => {
    const left = this.countdown();
    if (left <= 60) return 'danger';
    if (left <= 150) return 'warn';
    return 'safe';
  });
  readonly viewersNow = computed(() => {
    const arena = this.reservation().arenaName;
    let hash = 0;
    for (let i = 0; i < arena.length; i++) {
      hash = (hash << 5) - hash + arena.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash % 4) + 2; // 2..5 pessoas
  });

  /** Query `allowArenaPay=0|false` desliga “pagar na arena” (config por arena no backend). */
  get allowPayAtArena(): boolean {
    const ap = this.route.snapshot.queryParamMap.get('allowArenaPay');
    return ap !== '0' && ap !== 'false';
  }

  readonly ctaLabel = computed(() =>
    this.paymentMethod() === 'mp' ? 'Pagar agora' : 'Reservar e pagar na arena',
  );

  constructor() {
    effect(() => {
      if (this.isLoading()) {
        globalThis.onbeforeunload = () =>
          this.paymentMethod() === 'mp'
            ? 'Pagamento em andamento...'
            : 'Finalizando reserva...';
      } else {
        globalThis.onbeforeunload = null;
      }
    });

    if (!this.allowPayAtArena) {
      this.paymentMethod.set('mp');
    }

    this.startCountdown(this.holdDurationSec);
    this.destroyRef.onDestroy(() => {
      globalThis.onbeforeunload = null;
      if (this.countdownTimerId) {
        clearInterval(this.countdownTimerId);
        this.countdownTimerId = null;
      }
    });

    afterNextRender(() => {
      const card = this.cardRef();
      if (!card || prefersReducedMotion()) {
        return;
      }
      gsap.from(card, {
        y: 26,
        opacity: 0,
        duration: 0.5,
        ease: 'power3.out',
      });
    });
  }

  onMouseMove(event: MouseEvent) {
    if (typeof document === 'undefined') return;
    const glow = document.querySelector('.checkout-glow') as HTMLElement | null;
  
    if (!glow) return;
    if (!glow.dataset['gsapAnchored']) {
      gsap.set(glow, { xPercent: -50, yPercent: -50 });
      glow.dataset['gsapAnchored'] = '1';
    }

    const host = event.currentTarget as HTMLElement | null;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    gsap.to(glow, {
      x,
      y,
      duration: 0.18,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }

  selectPayment(method: CheckoutPaymentMethod): void {
    if (method === 'arena' && !this.allowPayAtArena) {
      return;
    }
    this.paymentMethod.set(method);
  }

  confirmPayment(): void {
    if (this.paymentMethod() === 'mp') {
      this.payWithMercadoPago();
    } else {
      this.reservePayAtArena();
    }
  }

  /** Fluxo online: preferência MP + redirect (MVP: simula delay antes da rota de sucesso). */
  private payWithMercadoPago(): void {
    if (this.isLoading() || this.isExpired()) {
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
    this.isLoading.set(true);
    const reservation = this.reservation();

    globalThis.setTimeout(() => {
      this.isLoading.set(false);
      this.router.navigate(['/checkout/sucesso'], {
        queryParams: {
          arena: reservation.arenaName,
          date: reservation.date,
          time: reservation.time,
          price: reservation.price,
          payment: 'online',
          status: 'CONFIRMED',
        },
      });
    }, 1500);
  }

  /** Reserva com pagamento no local — backend: status PAY_AT_ARENA, hold + expiração. */
  private reservePayAtArena(): void {
    if (this.isLoading() || this.isExpired() || !this.allowPayAtArena) {
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
    this.isLoading.set(true);
    const reservation = this.reservation();

    globalThis.setTimeout(() => {
      this.isLoading.set(false);
      this.router.navigate(['/checkout/sucesso'], {
        queryParams: {
          arena: reservation.arenaName,
          date: reservation.date,
          time: reservation.time,
          price: reservation.price,
          payment: 'arena',
          status: 'PAY_AT_ARENA',
        },
      });
    }, 800);
  }

  startCountdown(totalSeconds: number) {
    this.countdown.set(Math.max(0, totalSeconds));
    this.countdownTimerId = globalThis.setInterval(() => {
      this.countdown.update((value) => {
        if (value <= 0) {
          if (this.countdownTimerId) {
            clearInterval(this.countdownTimerId);
            this.countdownTimerId = null;
          }
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  }
}
