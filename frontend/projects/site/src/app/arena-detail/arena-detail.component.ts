import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import gsap from 'gsap';

import { SharedTransitionService } from '../core/shared-transition.service';
import { GalleryOverlayService } from '../core/gallery-overlay.service';
import { ArenaFavoritesStore } from '../core/arena-favorites.store';
import {
  calculateDynamicPrice,
  mockDemandFactor,
  mockOccupancy,
  type ArenaPricingResult,
} from '../core/arena-dynamic-pricing';
import { SlotVacancyAlertsStore } from '../core/slot-vacancy-alerts.store';
import { MOCK_ARENAS, type ArenaPreview } from '../landing/data/arenas.mock';
import { prefersReducedMotion } from '../landing/animations/gsap-setup';

const SLOT_TIMES = ['07:00', '09:00', '11:00', '14:00', '18:00', '20:00', '21:00'] as const;

@Component({
  selector: 'app-arena-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './arena-detail.component.html',
  styleUrl: './arena-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArenaDetailComponent {
  private static readonly swipeCloseThresholdPx = 140;
  private static readonly swipeVelocityCloseThreshold = 0.6;
  private static readonly swipeMinDyForVelocityClose = 18;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transition = inject(SharedTransitionService);
  private readonly galleryOverlay = inject(GalleryOverlayService);
  readonly favorites = inject(ArenaFavoritesStore);
  private readonly slotAlerts = inject(SlotVacancyAlertsStore);

  /** Dependência explícita para o template reagir a alertas de vaga (OnPush). */
  readonly slotVacancyAlertsTick = computed(() => this.slotAlerts.alerts().length);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hero = viewChild<ElementRef<HTMLElement>>('hero');
  private readonly heroParallax = viewChild<ElementRef<HTMLElement>>('heroParallax');
  private readonly galleryModal = viewChild<ElementRef<HTMLElement>>('galleryModal');
  private readonly galleryStage = viewChild<ElementRef<HTMLElement>>('galleryStage');

  private swipeStartY = 0;
  private swipeDy = 0;
  private swipeActive = false;
  private swipePointerId: number | null = null;
  private swipeLastClientY = 0;
  private swipeLastTime = 0;
  /** px/ms — positivo = dedo indo para baixo */
  private swipeVelocity = 0;

  private gallerySwipeStartX = 0;
  private galleryWheelHandler: ((e: WheelEvent) => void) | null = null;
  private galleryStageMoveHandler: ((e: PointerEvent) => void) | null = null;
  private galleryStageMoveAttached: HTMLElement | null = null;

  /** Gestão de arraste vertical (fechar) vs horizontal (trocar foto). */
  private galleryStagePointerId: number | null = null;
  private galleryStageStartX = 0;
  private galleryStageStartY = 0;
  private galleryGestureCommitted = false;
  private galleryGestureVertical = false;

  /** Pinch zoom (touch). */
  private touchPinchActive = false;
  private pinchInitialDistance = 0;
  private pinchInitialZoom = 1;

  /** Direção da última navegação para animação de slide. */
  private gallerySlideDirection: 'next' | 'prev' | null = null;

  /** Clone em transição para fullscreen (permite cancelar com Escape). */
  private galleryMorphFlyingEl: HTMLImageElement | null = null;

  readonly isGalleryOpen = signal(false);
  /** Durante morph da miniatura → fullscreen; UI do modal fica inerte. */
  readonly galleryMorphing = signal(false);
  readonly activeIndex = signal(0);
  readonly modalGalleryUrls = signal<string[]>([]);
  readonly galleryZoom = signal(1);
  /** Arraste vertical para fechar (combinado com escala leve). */
  readonly galleryDismissY = signal(0);
  readonly galleryDismissScaleMul = signal(1);

  readonly galleryZoomWrapTransform = computed(() => {
    const z = this.galleryZoom();
    const dy = this.galleryDismissY();
    const mul = this.galleryDismissScaleMul();
    return `translate3d(0, ${dy}px, 0) scale(${z * mul})`;
  });

  readonly arenaId = signal(this.route.snapshot.paramMap.get('id') ?? '');
  readonly selectedDateIso = signal(this.route.snapshot.queryParamMap.get('date') ?? '');
  readonly selectedSlotTime = signal(
    this.route.snapshot.queryParamMap.get('time') ?? '18:00',
  );

  readonly arena = computed(() => MOCK_ARENAS.find((a) => a.id === this.arenaId()) ?? null);
  readonly slotTimes = SLOT_TIMES;

  constructor() {
    afterNextRender(() => {
      requestAnimationFrame(() => this.runHeroTransition());
      this.setupHeroParallax();
      this.setupSwipeToClose();
    });
    this.destroyRef.onDestroy(() => {
      this.detachGalleryWheelListener();
      this.detachGalleryStageMoveListener();
      this.abortGalleryMorphFlying();
      this.galleryOverlay.setOpen(false);
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  onGalleryDocumentKeydown(e: KeyboardEvent): void {
    if (this.galleryMorphing()) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.abortGalleryMorphFlying();
      }
      return;
    }
    if (!this.isGalleryOpen()) {
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.closeGallery();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.galleryPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.galleryNext();
    }
  }

  readonly listQueryParams = computed(() => ({
    date: this.selectedDateIso() || undefined,
    time: this.selectedSlotTime() || undefined,
  }));

  /**
   * Preço dinâmico do horário selecionado (demanda + ocupação + faixa premium).
   */
  readonly pricingSnapshot = computed((): ArenaPricingResult | null => {
    const a = this.arena();
    if (!a) {
      return null;
    }
    const time = this.selectedSlotTime();
    const dateIso = this.resolveBookingDateIso();
    if (!a.available) {
      return {
        rounded: a.pricePerHourReais,
        baseListed: a.pricePerHourReais,
        isHighDemand: false,
      };
    }
    return calculateDynamicPrice({
      basePrice: a.pricePerHourReais,
      demandFactor: mockDemandFactor(a.id, time, dateIso),
      occupancy: mockOccupancy(a.id, time, dateIso),
      timeSlot: time,
    });
  });

  readonly checkoutQueryParams = computed(() => {
    const a = this.arena();
    if (!a) return {};
    const snap = this.pricingSnapshot();
    const price = snap?.rounded ?? a.pricePerHourReais;
    return {
      arena: a.name,
      date: this.selectedDateIso() || undefined,
      time: this.selectedSlotTime() || undefined,
      price,
    };
  });

  readonly pricingUrgencyHint = computed(() => {
    if (!this.pricingSnapshot()?.isHighDemand) {
      return '';
    }
    return '🔥 Alta procura neste horário — o preço pode subir em breve.';
  });

  readonly slotsUrgencyLine = computed(() => {
    const a = this.arena();
    if (!a?.available) {
      return '';
    }
    const n = SLOT_TIMES.filter((t) => this.slotIsOpen(a, t)).length;
    if (n <= 0 || n > 3) {
      return '';
    }
    return `Apenas ${n} horário${n === 1 ? '' : 's'} restante${n === 1 ? '' : 's'} hoje nesta arena.`;
  });

  readonly bookingDateLabel = computed(() => {
    const iso = this.selectedDateIso();
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      return '';
    }
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).format(new Date(y, m - 1, d));
  });

  /** Lista de badges com dependência explícita de favoritos (OnPush). */
  readonly detailBadgeRows = computed(() => {
    const a = this.arena();
    if (!a) {
      return [] as string[];
    }
    this.favorites.ids();
    return this.detailBadges(a);
  });

  readonly ctaSubtitle = computed(() => {
    const a = this.arena();
    if (!a) {
      return '';
    }
    if (!a.available) {
      return 'Indisponível nesta data — tente outro dia na busca';
    }
    const date = this.bookingDateLabel();
    const t = this.selectedSlotTime();
    if (date && t) {
      return `${date} · ${t}`;
    }
    return t ? `Horário ${t}` : 'Escolha um horário abaixo';
  });

  descriptionFor(a: ArenaPreview): string {
    if (a.description?.trim()) {
      return a.description;
    }
    return `Quadra premium em ${a.city} com padrão NexaGO. Ambiente preparado para jogos intensos, com estrutura profissional e reserva rápida. ${
      a.available ? 'Garanta seu horário e entre em jogo.' : 'Confira outras datas disponíveis.'
    }`;
  }

  detailBadges(a: ArenaPreview): string[] {
    const badges: string[] = [];
    if (this.favorites.has(a.id)) {
      badges.push('❤️ Favorita');
    }
    if (a.badge === 'popular') {
      badges.push('🔥 Mais reservada');
    }
    if (a.badge === 'rating') {
      badges.push('⭐ Alto desempenho');
    }
    const nearest = [...MOCK_ARENAS].sort((x, y) => x.distanceKm - y.distanceKm)[0];
    if (nearest?.id === a.id) {
      badges.push('📍 Mais próxima');
    }
    const top = [...MOCK_ARENAS].sort((x, y) => y.rating - x.rating)[0];
    if (top?.id === a.id) {
      badges.push('⭐ Melhor avaliada');
    }
    const cheap = [...MOCK_ARENAS].sort((x, y) => x.pricePerHourReais - y.pricePerHourReais)[0];
    if (cheap?.id === a.id) {
      badges.push('💰 Melhor preço');
    }
    return badges;
  }

  amenitiesFor(a: ArenaPreview): { icon: string; label: string }[] {
    const seed = Number.parseInt(a.id, 10);
    const items: { icon: string; label: string }[] = [];
    if (seed % 2 === 1) {
      items.push({ icon: '🅿️', label: 'Estacionamento' });
    }
    if (seed % 3 !== 0) {
      items.push({ icon: '🚿', label: 'Vestiário' });
    }
    if (seed % 4 !== 0) {
      items.push({ icon: '💡', label: 'Iluminação noturna' });
    }
    items.push({ icon: '🏐', label: 'Rede regulamentar' });
    items.push({ icon: '🧴', label: 'Água e kit 1º socorros' });
    return items;
  }

  private resolveBookingDateIso(): string {
    const iso = this.selectedDateIso();
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      return iso;
    }
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  hasSlotAlert(arenaId: string, time: string): boolean {
    return this.slotAlerts.has(arenaId, this.resolveBookingDateIso(), time);
  }

  subscribeSlotAlert(arenaId: string, time: string): void {
    const date = this.resolveBookingDateIso();
    this.slotAlerts.subscribe({ arenaId, date, time });
    const label = this.bookingDateLabel() || date;
    if (typeof globalThis.alert === 'function') {
      globalThis.alert(
        `🔔 Inscrição salva! Avisaremos se o horário ${time} liberar em ${label}.`,
      );
    }
  }

  slotIsOpen(a: ArenaPreview, time: string): boolean {
    if (!a.available) {
      return false;
    }
    const hour = Number.parseInt(time.split(':')[0] ?? '', 10);
    const seed = Number.parseInt(a.id, 10);
    if (!Number.isFinite(hour)) {
      return false;
    }
    return (seed + hour) % 4 !== 0;
  }

  /** URLs da galeria (modal + lista); fallback na capa. */
  galleryImagesFor(a: ArenaPreview): string[] {
    const raw = a.galleryImageUrls?.filter(Boolean) ?? [];
    if (raw.length > 0) {
      return [...new Set(raw)];
    }
    return [a.imageUrl];
  }

  /** 5 células no grid estilo Airbnb (repete a última se precisar). */
  galleryGridImages(a: ArenaPreview): string[] {
    const src = this.galleryImagesFor(a);
    if (src.length === 0) {
      return [];
    }
    const out: string[] = [];
    for (let i = 0; i < 5; i++) {
      out.push(src[Math.min(i, src.length - 1)]);
    }
    return out;
  }

  preloadGalleryImages(urls: string[]): void {
    if (typeof window === 'undefined') {
      return;
    }
    for (const src of urls) {
      const img = new Image();
      img.src = src;
    }
  }

  /** Pré-carrega só vizinhos do índice atual (evita lag no swipe). */
  preloadGalleryNeighbors(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const urls = this.modalGalleryUrls();
    const i = this.activeIndex();
    for (const j of [i - 1, i + 1]) {
      const src = urls[j];
      if (src) {
        const img = new Image();
        img.src = src;
      }
    }
  }

  private resetGalleryDismissVisuals(): void {
    this.galleryDismissY.set(0);
    this.galleryDismissScaleMul.set(1);
    const modal = this.galleryModal()?.nativeElement;
    if (modal) {
      modal.style.opacity = '';
    }
  }

  private clearGalleryGestureState(): void {
    this.galleryGestureCommitted = false;
    this.galleryGestureVertical = false;
    this.galleryStagePointerId = null;
  }

  /** Cancela o morph (clone em voo) — Escape ou destroy. */
  private abortGalleryMorphFlying(): void {
    const el = this.galleryMorphFlyingEl;
    if (!el) {
      return;
    }
    gsap.killTweensOf(el);
    el.remove();
    this.galleryMorphFlyingEl = null;
    this.galleryMorphing.set(false);
    this.isGalleryOpen.set(false);
    this.galleryOverlay.setOpen(false);
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }

  private getTouchDistance(touches: TouchList): number {
    if (touches.length < 2) {
      return 0;
    }
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  private attachGalleryListenersDeferred(): void {
    queueMicrotask(() =>
      setTimeout(() => {
        this.attachGalleryWheelListener();
        this.attachGalleryStageMoveListener();
      }, 0),
    );
  }

  openGallery(a: ArenaPreview, index: number, ev?: Event): void {
    const urls = this.galleryImagesFor(a);
    if (urls.length === 0) {
      return;
    }
    this.preloadGalleryImages(urls);
    this.modalGalleryUrls.set(urls);
    this.galleryZoom.set(1);
    this.resetGalleryDismissVisuals();
    this.clearGalleryGestureState();
    this.touchPinchActive = false;
    this.pinchInitialDistance = 0;
    this.activeIndex.set(Math.min(Math.max(0, index), urls.length - 1));
    this.preloadGalleryNeighbors();

    const body = typeof document !== 'undefined' ? document.body : null;

    const finishOpenPlain = (): void => {
      this.galleryMorphing.set(false);
      this.isGalleryOpen.set(true);
      this.galleryOverlay.setOpen(true);
      if (body) {
        body.style.overflow = 'hidden';
      }
      if (!prefersReducedMotion()) {
        queueMicrotask(() =>
          requestAnimationFrame(() => {
            this.animateGalleryOpen(false);
          }),
        );
      }
      this.attachGalleryListenersDeferred();
    };

    if (prefersReducedMotion()) {
      finishOpenPlain();
      return;
    }

    const opener = ev?.currentTarget as HTMLElement | undefined;
    const thumbImg = opener?.querySelector('img') as HTMLImageElement | undefined;

    if (!thumbImg || typeof document === 'undefined') {
      finishOpenPlain();
      return;
    }

    this.galleryMorphing.set(true);
    this.isGalleryOpen.set(true);
    this.galleryOverlay.setOpen(true);
    document.body.style.overflow = 'hidden';

    const rect = thumbImg.getBoundingClientRect();
    const flying = thumbImg.cloneNode(true) as HTMLImageElement;
    flying.src = thumbImg.currentSrc || thumbImg.src;
    flying.alt = '';
    flying.decoding = 'async';
    Object.assign(flying.style, {
      position: 'fixed',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: '10001',
      objectFit: 'cover',
      borderRadius: '12px',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      margin: '0',
      padding: '0',
    });
    document.body.appendChild(flying);
    this.galleryMorphFlyingEl = flying;

    const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0;

    gsap.to(flying, {
      top: 0,
      left: 0,
      width: vw || '100%',
      height: vh || '100%',
      borderRadius: 0,
      duration: 0.45,
      ease: 'power4.out',
      onComplete: () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            flying.remove();
            this.galleryMorphFlyingEl = null;
            this.galleryMorphing.set(false);
            this.preloadGalleryNeighbors();
            this.animateGalleryOpen(true);
            this.attachGalleryListenersDeferred();
          });
        });
      },
    });
  }

  closeGallery(): void {
    this.detachGalleryWheelListener();
    this.detachGalleryStageMoveListener();
    this.touchPinchActive = false;
    this.pinchInitialDistance = 0;
    this.clearGalleryGestureState();
    this.galleryMorphing.set(false);
    this.resetGalleryDismissVisuals();
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
    if (!this.isGalleryOpen()) {
      this.galleryOverlay.setOpen(false);
      return;
    }
    const root = this.galleryModal()?.nativeElement;
    if (!root || prefersReducedMotion()) {
      this.isGalleryOpen.set(false);
      this.galleryZoom.set(1);
      this.galleryOverlay.setOpen(false);
      return;
    }
    gsap.to(root, {
      opacity: 0,
      duration: 0.25,
      ease: 'power2.in',
      onComplete: () => {
        this.isGalleryOpen.set(false);
        this.galleryZoom.set(1);
        this.galleryOverlay.setOpen(false);
        gsap.set(root, { clearProps: 'opacity' });
      },
    });
  }

  onGalleryBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      this.closeGallery();
    }
  }

  galleryNext(): void {
    const n = this.modalGalleryUrls().length;
    if (n <= 1) {
      return;
    }
    this.gallerySlideDirection = 'next';
    this.resetGalleryDismissVisuals();
    this.galleryZoom.set(1);
    this.activeIndex.update((i) => Math.min(i + 1, n - 1));
    this.preloadGalleryNeighbors();
    this.animateGallerySlideChange();
  }

  galleryPrev(): void {
    const n = this.modalGalleryUrls().length;
    if (n <= 1) {
      return;
    }
    this.gallerySlideDirection = 'prev';
    this.resetGalleryDismissVisuals();
    this.galleryZoom.set(1);
    this.activeIndex.update((i) => Math.max(i - 1, 0));
    this.preloadGalleryNeighbors();
    this.animateGallerySlideChange();
  }

  onGalleryStagePointerDown(e: PointerEvent): void {
    if (!this.isGalleryOpen() || this.galleryMorphing()) {
      return;
    }
    if (this.touchPinchActive) {
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) {
      return;
    }
    this.gallerySwipeStartX = e.clientX;
    this.galleryStageStartX = e.clientX;
    this.galleryStageStartY = e.clientY;
    this.galleryStagePointerId = e.pointerId;
    this.galleryGestureCommitted = false;
    this.galleryGestureVertical = false;
  }

  onGalleryStagePointerMove(e: PointerEvent): void {
    if (!this.isGalleryOpen() || this.galleryMorphing() || this.touchPinchActive) {
      return;
    }
    if (this.galleryStagePointerId !== null && e.pointerId !== this.galleryStagePointerId) {
      return;
    }
    const dx = e.clientX - this.galleryStageStartX;
    const dy = e.clientY - this.galleryStageStartY;

    if (!this.galleryGestureCommitted && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
      this.galleryGestureCommitted = true;
      this.galleryGestureVertical =
        dy > 0 && Math.abs(dy) > Math.abs(dx) && this.galleryZoom() <= 1.05;
    }

    if (this.galleryGestureVertical && this.galleryZoom() <= 1.05) {
      e.preventDefault();
      const pull = Math.max(0, dy);
      this.galleryDismissY.set(pull);
      this.galleryDismissScaleMul.set(Math.max(0.88, 1 - pull / 600));
      const modal = this.galleryModal()?.nativeElement;
      if (modal) {
        modal.style.opacity = String(Math.max(0.38, 1 - pull / 480));
      }
    }
  }

  onGalleryStagePointerUp(e: PointerEvent): void {
    if (!this.isGalleryOpen() || this.galleryMorphing()) {
      return;
    }
    if (this.touchPinchActive) {
      if (this.galleryStagePointerId === e.pointerId) {
        this.galleryStagePointerId = null;
      }
      return;
    }
    if (this.galleryStagePointerId !== null && e.pointerId !== this.galleryStagePointerId) {
      return;
    }

    const wasVertical = this.galleryGestureVertical;
    const dismissY = this.galleryDismissY();
    this.galleryStagePointerId = null;

    if (wasVertical && dismissY > 0) {
      if (dismissY > 120) {
        this.clearGalleryGestureState();
        this.closeGallery();
        return;
      }
      this.clearGalleryGestureState();
      this.snapBackGalleryDismiss();
      return;
    }

    if (this.galleryZoom() <= 1.05) {
      const dx = e.clientX - this.gallerySwipeStartX;
      if (dx > 50) {
        this.galleryPrev();
      } else if (dx < -50) {
        this.galleryNext();
      }
    }

    this.clearGalleryGestureState();
  }

  onGalleryTouchStart(e: TouchEvent): void {
    if (!this.isGalleryOpen() || this.galleryMorphing()) {
      return;
    }
    if (e.touches.length === 2) {
      this.touchPinchActive = true;
      this.pinchInitialDistance = this.getTouchDistance(e.touches);
      this.pinchInitialZoom = this.galleryZoom();
      this.galleryGestureVertical = false;
    }
  }

  onGalleryTouchMove(e: TouchEvent): void {
    if (!this.isGalleryOpen() || this.galleryMorphing()) {
      return;
    }
    if (e.touches.length === 2 && this.pinchInitialDistance > 0) {
      e.preventDefault();
      const d = this.getTouchDistance(e.touches);
      const ratio = d / this.pinchInitialDistance;
      this.galleryZoom.set(Math.min(4, Math.max(1, this.pinchInitialZoom * ratio)));
    }
  }

  onGalleryTouchEnd(e: TouchEvent): void {
    if (e.touches.length < 2) {
      this.touchPinchActive = false;
      this.pinchInitialDistance = 0;
    }
  }

  private snapBackGalleryDismiss(): void {
    if (prefersReducedMotion()) {
      this.resetGalleryDismissVisuals();
      return;
    }
    const modal = this.galleryModal()?.nativeElement;
    const y = this.galleryDismissY();
    const s = this.galleryDismissScaleMul();
    let startOp = 1;
    if (modal?.style.opacity) {
      const parsed = Number.parseFloat(modal.style.opacity);
      if (Number.isFinite(parsed)) {
        startOp = parsed;
      }
    }
    const proxy = { y, s, o: startOp };
    gsap.to(proxy, {
      y: 0,
      s: 1,
      o: 1,
      duration: 0.45,
      ease: 'elastic.out(1, 0.55)',
      onUpdate: () => {
        this.galleryDismissY.set(proxy.y);
        this.galleryDismissScaleMul.set(proxy.s);
        if (modal) {
          modal.style.opacity = String(proxy.o);
        }
      },
      onComplete: () => {
        this.resetGalleryDismissVisuals();
      },
    });
  }

  private attachGalleryWheelListener(): void {
    this.detachGalleryWheelListener();
    if (!this.isGalleryOpen()) {
      return;
    }
    const stage = this.galleryStage()?.nativeElement;
    if (!stage) {
      return;
    }
    const handler = (ev: WheelEvent): void => {
      if (!this.isGalleryOpen()) {
        return;
      }
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.1 : 0.9;
      this.galleryZoom.update((z) => Math.min(4, Math.max(1, z * factor)));
    };
    stage.addEventListener('wheel', handler, { passive: false });
    this.galleryWheelHandler = handler;
  }

  private detachGalleryWheelListener(): void {
    const stage = this.galleryStage()?.nativeElement;
    if (stage && this.galleryWheelHandler) {
      stage.removeEventListener('wheel', this.galleryWheelHandler);
    }
    this.galleryWheelHandler = null;
  }

  private attachGalleryStageMoveListener(): void {
    this.detachGalleryStageMoveListener();
    if (!this.isGalleryOpen()) {
      return;
    }
    const stage = this.galleryStage()?.nativeElement;
    if (!stage) {
      return;
    }
    const handler = (ev: PointerEvent): void => {
      this.onGalleryStagePointerMove(ev);
    };
    stage.addEventListener('pointermove', handler, { passive: false });
    this.galleryStageMoveHandler = handler;
    this.galleryStageMoveAttached = stage;
  }

  private detachGalleryStageMoveListener(): void {
    if (this.galleryStageMoveAttached && this.galleryStageMoveHandler) {
      this.galleryStageMoveAttached.removeEventListener('pointermove', this.galleryStageMoveHandler);
    }
    this.galleryStageMoveHandler = null;
    this.galleryStageMoveAttached = null;
  }

  private animateGalleryOpen(afterMorph: boolean): void {
    if (!this.isGalleryOpen() || prefersReducedMotion()) {
      return;
    }
    const root = this.galleryModal()?.nativeElement;
    const img = root?.querySelector('.arena-detail-gallery-modal__img') as HTMLElement | undefined;
    if (root) {
      if (afterMorph) {
        gsap.set(root, { opacity: 1 });
      } else {
        gsap.set(root, { opacity: 0 });
        gsap.to(root, { opacity: 1, duration: 0.3, ease: 'power2.out' });
      }
    }
    if (img) {
      gsap.fromTo(
        img,
        { opacity: afterMorph ? 0.94 : 0.85, y: afterMorph ? 6 : 0 },
        { opacity: 1, y: 0, duration: afterMorph ? 0.28 : 0.4, ease: 'power3.out' },
      );
    }
  }

  private animateGallerySlideChange(): void {
    if (prefersReducedMotion() || !this.isGalleryOpen()) {
      return;
    }
    const img = this.galleryModal()?.nativeElement?.querySelector(
      '.arena-detail-gallery-modal__img',
    ) as HTMLElement | null;
    if (!img) {
      return;
    }
    const dir = this.gallerySlideDirection;
    this.gallerySlideDirection = null;
    const fromX = dir === 'next' ? 48 : dir === 'prev' ? -48 : 0;
    gsap.fromTo(
      img,
      { x: fromX, opacity: 0.62 },
      { x: 0, opacity: 1, duration: 0.35, ease: 'power3.out' },
    );
  }

  toggleFavoriteDetail(ev: Event, arenaId: string): void {
    ev.preventDefault();
    this.favorites.toggle(arenaId);
    const btn = ev.currentTarget as HTMLElement | undefined;
    if (btn && !prefersReducedMotion()) {
      gsap.fromTo(
        btn,
        { scale: 0.84 },
        { scale: 1.14, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' },
      );
    }
  }

  pickSlot(time: string, a: ArenaPreview): void {
    if (!this.slotIsOpen(a, time)) {
      return;
    }
    this.selectedSlotTime.set(time);
    if (
      !prefersReducedMotion() &&
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      navigator.vibrate(10);
    }
  }

  private readonly onSwipePointerDown = (e: PointerEvent): void => {
    if (prefersReducedMotion() || typeof window === 'undefined') {
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) {
      return;
    }
    if (window.scrollY > 0) {
      return;
    }
    const el = this.hero()?.nativeElement;
    if (!el) {
      return;
    }
    this.swipeActive = true;
    this.swipePointerId = e.pointerId;
    this.swipeStartY = e.clientY;
    this.swipeDy = 0;
    this.swipeVelocity = 0;
    this.swipeLastClientY = e.clientY;
    this.swipeLastTime = performance.now();
    try {
      if (e.pointerType === 'mouse') {
        el.setPointerCapture(e.pointerId);
      }
    } catch {
      this.swipeActive = false;
      this.swipePointerId = null;
    }
  };

  private readonly onSwipePointerMove = (e: PointerEvent): void => {
    if (!this.swipeActive || this.swipePointerId !== e.pointerId) {
      return;
    }
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      this.abortSwipeGestureDueToScroll(e);
      return;
    }
    const rawDy = e.clientY - this.swipeStartY;
    if (rawDy < -12) {
      this.releaseSwipePointerIfNeeded(e, this.hero()?.nativeElement);
      this.swipeActive = false;
      this.swipePointerId = null;
      this.swipeDy = 0;
      this.swipeVelocity = 0;
      this.clearSwipeDismissChrome();
      return;
    }
    if (rawDy > 6) {
      e.preventDefault();
    }
    if (rawDy < 0) {
      this.swipeDy = 0;
      this.swipeVelocity = 0;
      this.applySwipeToHero(0);
      return;
    }
    const now = performance.now();
    const dt = Math.max(now - this.swipeLastTime, 1);
    this.swipeVelocity = (e.clientY - this.swipeLastClientY) / dt;
    this.swipeLastClientY = e.clientY;
    this.swipeLastTime = now;
    this.swipeDy = rawDy;
    this.applySwipeToHero(rawDy);
  };

  private readonly onSwipePointerUp = (e: PointerEvent): void => {
    if (!this.swipeActive || this.swipePointerId !== e.pointerId) {
      return;
    }
    const heroEl = this.hero()?.nativeElement;
    try {
      heroEl?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const dy = this.swipeDy;
    const v = this.swipeVelocity;
    this.swipePointerId = null;
    this.swipeActive = false;
    this.swipeDy = 0;
    this.swipeVelocity = 0;

    if (!heroEl) {
      this.clearSwipeDismissChrome();
      return;
    }

    const shouldClose =
      dy > ArenaDetailComponent.swipeCloseThresholdPx ||
      (v > ArenaDetailComponent.swipeVelocityCloseThreshold &&
        dy > ArenaDetailComponent.swipeMinDyForVelocityClose);

    if (shouldClose && dy > 4) {
      this.finishSwipeWithPhysicsThrow(heroEl, v, dy);
      return;
    }
    if (dy > 8) {
      this.cancelSwipeGesturePhysics(heroEl);
    } else {
      this.clearSwipeDismissChrome();
    }
  };

  private readonly onSwipePointerCancel = (e: PointerEvent): void => {
    if (!this.swipeActive || this.swipePointerId !== e.pointerId) {
      return;
    }
    const heroEl = this.hero()?.nativeElement;
    try {
      heroEl?.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    const dy = this.swipeDy;
    const v = this.swipeVelocity;
    this.swipePointerId = null;
    this.swipeActive = false;
    this.swipeDy = 0;
    this.swipeVelocity = 0;

    if (!heroEl) {
      this.clearSwipeDismissChrome();
      return;
    }

    const shouldClose =
      dy > ArenaDetailComponent.swipeCloseThresholdPx ||
      (v > ArenaDetailComponent.swipeVelocityCloseThreshold &&
        dy > ArenaDetailComponent.swipeMinDyForVelocityClose);

    if (shouldClose && dy > 4) {
      this.finishSwipeWithPhysicsThrow(heroEl, v, dy);
      return;
    }
    if (dy > 8) {
      this.cancelSwipeGesturePhysics(heroEl);
    } else {
      this.clearSwipeDismissChrome();
    }
  };

  private releaseSwipePointerIfNeeded(e: PointerEvent, el: HTMLElement | undefined): void {
    if (e.pointerType !== 'mouse' || !el) {
      return;
    }
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
  }

  private abortSwipeGestureDueToScroll(e: PointerEvent): void {
    const el = this.hero()?.nativeElement;
    try {
      el?.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    this.swipePointerId = null;
    this.swipeActive = false;
    const dy = this.swipeDy;
    const heroEl = this.hero()?.nativeElement;
    this.swipeDy = 0;
    this.swipeVelocity = 0;
    if (dy > 8 && heroEl) {
      this.cancelSwipeGesturePhysics(heroEl);
    } else {
      this.clearSwipeDismissChrome();
    }
  }

  private applySwipeToHero(rawDy: number): void {
    const el = this.hero()?.nativeElement;
    if (!el) {
      return;
    }
    if (rawDy <= 0) {
      gsap.set(el, { y: 0, scale: 1, borderRadius: 0, boxShadow: 'none' });
      el.style.boxShadow = '';
      document.body.style.opacity = '1';
      document.body.style.filter = 'none';
      return;
    }
    const resistanceFactor = 1 - Math.exp(-rawDy / 200);
    let visualY = rawDy * resistanceFactor;
    const rubberStart = 300;
    if (rawDy > rubberStart) {
      const over = rawDy - rubberStart;
      visualY += 52 * (1 - Math.exp(-over / 88));
    }
    const p = Math.min(Math.max(rawDy / 300, 0), 1);
    const scaleR = Math.pow(p, 0.75);
    el.style.boxShadow = `0 ${10 + rawDy * 0.1}px ${40 + rawDy * 0.2}px rgba(0,0,0,0.5)`;
    gsap.set(el, {
      y: visualY,
      scale: 1 - scaleR * 0.05,
      borderRadius: scaleR * 16,
      boxShadow: 'none',
    });
    document.body.style.opacity = String(1 - p * 0.2);
    document.body.style.filter = `blur(${Math.min(visualY / 100, 4)}px)`;
  }

  /** Arremesso com inércia antes do morph / navigate (intenção = distância + velocidade). */
  private finishSwipeWithPhysicsThrow(
    el: HTMLElement,
    velocityPxPerMs: number,
    releaseDy: number,
  ): void {
    gsap.killTweensOf(el);
    const distanceCommit = releaseDy > ArenaDetailComponent.swipeCloseThresholdPx;
    const vFloor = distanceCommit ? 0.28 : 0.12;
    const v = Math.max(velocityPxPerMs, vFloor);
    const momentum = v * 200;
    const viewH = typeof window !== 'undefined' ? window.innerHeight : 820;
    const targetY = viewH + Math.max(momentum, 96);
    document.body.style.opacity = '0.8';
    document.body.style.filter = `blur(${Math.min(2 + v * 4, 6)}px)`;
    gsap.to(el, {
      y: targetY,
      scale: 0.92,
      borderRadius: 24,
      duration: 0.45,
      ease: 'power3.out',
      onComplete: () => {
        const thrown = el.getBoundingClientRect();
        this.clearSwipeDismissChrome();
        this.runBackFromDetail(thrown);
      },
    });
  }

  /** Cancelamento com “mola” (snap elástico). */
  private cancelSwipeGesturePhysics(el: HTMLElement): void {
    gsap.killTweensOf(el);
    document.body.style.opacity = '1';
    document.body.style.filter = 'none';
    gsap.to(el, {
      y: 0,
      scale: 1,
      borderRadius: 0,
      duration: 0.4,
      ease: 'elastic.out(1, 0.6)',
      onComplete: () => {
        el.style.boxShadow = '';
      },
    });
  }

  /** Limpa estilos do gesto de arrastar antes de navegar ou animar o morph. */
  private clearSwipeDismissChrome(): void {
    const el = this.hero()?.nativeElement;
    if (el) {
      gsap.killTweensOf(el);
      gsap.set(el, {
        y: 0,
        scale: 1,
        borderRadius: 0,
        boxShadow: 'none',
      });
      el.style.boxShadow = '';
    }
    document.body.style.opacity = '';
    document.body.style.filter = '';
  }

  private setupSwipeToClose(): void {
    if (typeof window === 'undefined' || prefersReducedMotion() || !this.arena()) {
      return;
    }
    const el = this.hero()?.nativeElement;
    if (!el) {
      return;
    }

    el.addEventListener('pointerdown', this.onSwipePointerDown);
    el.addEventListener('pointermove', this.onSwipePointerMove, { passive: false });
    el.addEventListener('pointerup', this.onSwipePointerUp);
    el.addEventListener('pointercancel', this.onSwipePointerCancel);

    this.destroyRef.onDestroy(() => {
      el.removeEventListener('pointerdown', this.onSwipePointerDown);
      el.removeEventListener('pointermove', this.onSwipePointerMove);
      el.removeEventListener('pointerup', this.onSwipePointerUp);
      el.removeEventListener('pointercancel', this.onSwipePointerCancel);
    });
  }

  private setupHeroParallax(): void {
    if (typeof window === 'undefined' || prefersReducedMotion() || !this.arena()) {
      return;
    }
    const onScroll = (): void => {
      const el = this.heroParallax()?.nativeElement;
      if (!el) {
        return;
      }
      const y = window.scrollY * 0.2;
      el.style.transform = `translate3d(0, ${y}px, 0)`;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    this.destroyRef.onDestroy(() => window.removeEventListener('scroll', onScroll));
  }

  canCheckout(a: ArenaPreview): boolean {
    return a.available && this.slotIsOpen(a, this.selectedSlotTime());
  }

  goBack(): void {
    this.clearSwipeDismissChrome();
    this.runBackFromDetail();
  }

  /**
   * Volta para a lista / morph. Se `heroLayoutRect` for passado (ex.: após arremesso), usa-o no lugar do rect atual do hero — útil porque `clearSwipeDismissChrome` repõe o transform.
   */
  private runBackFromDetail(heroLayoutRect?: DOMRectReadOnly): void {
    const snap = this.transition.getSnapshot();
    const id = this.arenaId();
    const qp = this.listQueryParams();

    if (!snap || snap.arenaId !== id) {
      if (snap && snap.arenaId !== id) {
        this.transition.clearSnapshot();
      }
      void this.router.navigate(['/disponibilidade'], { queryParams: qp });
      return;
    }

    if (prefersReducedMotion()) {
      this.transition.flagReturnFromDetail(snap.scrollY, false, snap.arenaId);
      this.transition.clearSnapshot();
      void this.router.navigate(['/disponibilidade'], { queryParams: qp });
      return;
    }

    const heroRef = this.hero();
    if (!heroRef) {
      this.transition.flagReturnFromDetail(snap.scrollY, false, snap.arenaId);
      this.transition.clearSnapshot();
      void this.router.navigate(['/disponibilidade'], { queryParams: qp });
      return;
    }

    const flying = this.transition.buildFlyingCardFromSnapshot();
    if (!flying) {
      this.transition.flagReturnFromDetail(snap.scrollY, false, snap.arenaId);
      this.transition.clearSnapshot();
      void this.router.navigate(['/disponibilidade'], { queryParams: qp });
      return;
    }

    const heroEl = heroRef.nativeElement;
    const heroRect = heroLayoutRect ?? heroEl.getBoundingClientRect();
    const section = heroEl.closest('section.arena-detail') as HTMLElement | null;

    const prevPe = document.body.style.pointerEvents;
    const prevOp = document.body.style.opacity;

    document.body.style.pointerEvents = 'none';
    document.body.style.opacity = '0.97';

    this.transition.positionFlyingCard(
      flying,
      {
        top: heroRect.top,
        left: heroRect.left,
        width: heroRect.width,
        height: heroRect.height,
      },
      '0',
      '0 28px 90px rgba(0,0,0,0.55)',
    );
    document.body.appendChild(flying);

    if (section) {
      section.style.visibility = 'hidden';
    }

    const finish = (): void => {
      flying.remove();
      document.body.style.pointerEvents = prevPe;
      document.body.style.opacity = prevOp;
      this.transition.flagReturnFromDetail(snap.scrollY, true, snap.arenaId);
      this.transition.clearSnapshot();
      void this.router.navigate(['/disponibilidade'], { queryParams: qp });
    };

    gsap.to(flying, {
      top: snap.rect.top,
      left: snap.rect.left,
      width: snap.rect.width,
      height: snap.rect.height,
      borderRadius: snap.borderRadius,
      duration: 0.5,
      ease: 'power4.out',
      boxShadow: '0 20px 80px rgba(0,0,0,0.55)',
      onUpdate: () => {
        flying.style.filter = 'blur(2px)';
      },
      onComplete: () => {
        flying.style.filter = '';
        finish();
      },
    });
  }

  private runHeroTransition(): void {
    const heroRef = this.hero();
    const id = this.arenaId();

    if (!heroRef) {
      return;
    }

    const target = heroRef.nativeElement;
    const snap = this.transition.getSnapshot();

    if (!snap || snap.arenaId !== id) {
      if (snap && snap.arenaId !== id) {
        this.transition.clearSnapshot();
      }
      target.style.opacity = '1';
      this.revealContent(true);
      return;
    }

    if (prefersReducedMotion()) {
      target.style.opacity = '1';
      this.revealContent(false);
      return;
    }

    const flying = this.transition.buildFlyingCardFromSnapshot();
    if (!flying) {
      target.style.opacity = '1';
      this.revealContent(true);
      return;
    }

    this.transition.positionFlyingCard(
      flying,
      snap.rect,
      snap.borderRadius,
      '0 20px 80px rgba(0,0,0,0.55)',
    );
    document.body.appendChild(flying);

    target.style.opacity = '0';
    const targetRect = target.getBoundingClientRect();

    gsap.to(flying, {
      top: targetRect.top,
      left: targetRect.left,
      width: targetRect.width,
      height: targetRect.height,
      borderRadius: 0,
      duration: 0.48,
      ease: 'power4.out',
      boxShadow: '0 28px 90px rgba(0,0,0,0.55)',
      onUpdate: () => {
        flying.style.filter = 'blur(2px)';
      },
      onComplete: () => {
        flying.style.filter = '';
        flying.remove();
        target.style.opacity = '1';
        this.revealContent(false);
      },
    });
  }

  /** Entrada do conteúdo após o hero; `directEntry` = sem morph do card (snapshot ausente). */
  private revealContent(directEntry: boolean): void {
    if (prefersReducedMotion()) {
      return;
    }
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    if (directEntry) {
      tl.from(
        '.arena-detail__hero',
        { scale: 1.04, opacity: 0.85, duration: 0.45, ease: 'power3.out' },
        0,
      );
    }
    tl.from(
      '.arena-detail__hero-line',
      { opacity: 0, y: 10, duration: 0.32 },
      directEntry ? 0.06 : 0,
    );
    tl.from(
      '.arena-detail__reveal',
      { opacity: 0, y: 24, duration: 0.5, stagger: 0.08, ease: 'power3.out' },
      directEntry ? 0.1 : 0.05,
    );
    tl.from(
      '.arena-detail__badge',
      { scale: 0.9, opacity: 0, duration: 0.3, stagger: 0.05 },
      directEntry ? 0.14 : 0.08,
    );
  }
}
