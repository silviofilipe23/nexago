import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { formatOrderDate, orderWhere, type StoreOrderView } from '../data/store-checkout-model';
import { STORE_REVIEWS_API, type SubmitReviewResult } from '../data/store-reviews-api';
import {
  MAX_REVIEW_COMMENT,
  MAX_REVIEW_PHOTOS,
  RATING_LABELS,
  REVIEW_FIT_OPTIONS,
  REVIEW_PHOTO_TYPES,
  canPublish,
  draftFromReview,
  formTags,
  reviewErrorMessage,
  reviewTargets,
  submitPayload,
  type OrderReview,
  type ReviewDraftItem,
  type ReviewFit,
  type ReviewTag,
} from '../data/store-reviews-model';
import type { StoreProduct } from '../data/store-showcase-model';
import { NxToastService } from '../shared/feedback';
import { trackLojaEvent } from './loja-telemetry';

/** Foto escolhida antes de reduzir: acima disso nem tenta (a callable aceita até 10 MB já reduzida). */
const MAX_PICKED_BYTES = 25 * 1024 * 1024;

/**
 * Avaliar compra (web 06b): janela por cima de Meus pedidos. Nota de 1 a 5 por produto do pedido,
 * etiquetas, caimento (produto com Tamanho), comentário, até 3 fotos, a retirada na arena e
 * "Publicar sem meu nome". Quem grava é a callable `submitStoreOrderReview`.
 */
@Component({
  selector: 'app-loja-avaliar-modal',
  templateUrl: './loja-avaliar-modal.component.html',
  styleUrl: './loja-avaliar-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class LojaAvaliarModalComponent {
  readonly order = input.required<StoreOrderView>();
  /** A avaliação que já existe (edição); `null` = primeira. */
  readonly review = input<OrderReview | null>(null);
  /** Catálogo da vitrine: diz quais produtos têm Tamanho. */
  readonly products = input<ReadonlyMap<string, StoreProduct>>(new Map());
  readonly published = output<SubmitReviewResult>();
  readonly closed = output<void>();

  private readonly api = inject(STORE_REVIEWS_API);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NxToastService);

  protected readonly ratingLabels = RATING_LABELS;
  protected readonly fitOptions = REVIEW_FIT_OPTIONS;
  protected readonly maxComment = MAX_REVIEW_COMMENT;
  protected readonly maxPhotos = MAX_REVIEW_PHOTOS;
  protected readonly stars = [1, 2, 3, 4, 5];

  protected readonly targets = computed(() => reviewTargets(this.order(), this.products()));
  protected readonly items = signal<ReviewDraftItem[]>([]);
  /** Produto aberto (etiquetas, comentário e fotos à mostra). */
  protected readonly open = signal<string | null>(null);
  protected readonly hover = signal<{ key: string; value: number } | null>(null);
  protected readonly pickupRating = signal(0);
  protected readonly anonymous = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly editing = computed(() => this.review() !== null);
  protected readonly subtitle = computed(() => {
    const o = this.order();
    return [`#${o.number}`, formatOrderDate(o.createdAt, new Date()), orderWhere(o)].filter(Boolean).join(' · ');
  });
  protected readonly pickupPlace = computed(() => {
    const d = this.order().delivery;
    return d.type === 'arena' ? (d.placeName ?? 'arena') : null;
  });
  protected readonly ready = computed(() => canPublish(this.items()) && !this.submitting());

  private readonly objectUrls: string[] = [];
  /** A avaliação salva que montou o rascunho atual. */
  private seededFrom: OrderReview | null = null;

  constructor() {
    effect(() => {
      const targets = this.targets();
      const review = this.review();
      untracked(() => {
        // O catálogo (e a avaliação salva) podem chegar depois de a janela abrir: refazer o rascunho
        // só se mudou o conjunto de produtos ou se ele ainda está intocado; senão, só ajusta o caimento.
        const current = this.items();
        const sameTargets = current.length === targets.length && current.every((c, i) => c.productId === targets[i]!.productId);
        const untouched = current.every((c) => c.rating === 0);
        if (current.length > 0 && sameTargets && !(untouched && review !== this.seededFrom)) {
          this.items.set(current.map((c, i) => (targets[i]!.sized ? c : { ...c, fit: null })));
          return;
        }
        this.seededFrom = review;
        this.items.set(draftFromReview(targets, review));
        this.open.set(targets[0]?.productId ?? null);
        this.pickupRating.set(review?.pickup?.rating ?? 0);
        this.anonymous.set(review?.anonymous ?? false);
      });
    });
    inject(DestroyRef).onDestroy(() => this.objectUrls.forEach((u) => URL.revokeObjectURL(u)));
  }

  protected item(productId: string): ReviewDraftItem {
    return this.items().find((i) => i.productId === productId)!;
  }

  protected tagsFor(sized: boolean) {
    return formTags(sized);
  }

  /** Estrelas acesas: o hover manda enquanto o mouse está em cima. */
  protected shown(key: string, value: number): number {
    const h = this.hover();
    return h && h.key === key ? h.value : value;
  }

  private patch(productId: string, change: (i: ReviewDraftItem) => ReviewDraftItem): void {
    this.items.update((list) => list.map((i) => (i.productId === productId ? change(i) : i)));
    this.error.set(null);
  }

  protected rate(productId: string, value: number): void {
    this.patch(productId, (i) => ({ ...i, rating: value }));
    this.open.set(productId);
  }

  protected toggleTag(productId: string, tag: ReviewTag): void {
    this.patch(productId, (i) => ({ ...i, tags: i.tags.includes(tag) ? i.tags.filter((t) => t !== tag) : [...i.tags, tag] }));
  }

  protected setFit(productId: string, fit: ReviewFit): void {
    this.patch(productId, (i) => ({ ...i, fit: i.fit === fit ? null : fit }));
  }

  protected setComment(productId: string, value: string): void {
    this.patch(productId, (i) => ({ ...i, comment: value.slice(0, MAX_REVIEW_COMMENT) }));
  }

  protected removePhoto(productId: string, index: number): void {
    this.patch(productId, (i) => ({ ...i, photos: i.photos.filter((_, k) => k !== index) }));
  }

  protected async addPhotos(productId: string, input: HTMLInputElement): Promise<void> {
    const files = Array.from(input.files ?? []);
    input.value = '';
    const uid = this.auth.user()?.uid;
    if (!uid || !this.api || files.length === 0) return;
    const room = MAX_REVIEW_PHOTOS - this.item(productId).photos.length;
    for (const file of files.slice(0, Math.max(0, room))) {
      if (!REVIEW_PHOTO_TYPES.has(file.type)) {
        this.toast.warning('Formato não aceito', 'Use fotos em JPG, PNG ou WEBP.');
        continue;
      }
      if (file.size > MAX_PICKED_BYTES) {
        this.toast.warning('Foto grande demais', 'Escolha uma foto de até 25 MB.');
        continue;
      }
      const preview = URL.createObjectURL(file);
      this.objectUrls.push(preview);
      this.patch(productId, (i) => ({ ...i, photos: [...i.photos, { path: '', preview, uploading: true }] }));
      try {
        const path = await this.api.uploadPhoto(uid, file);
        this.patch(productId, (i) => ({ ...i, photos: i.photos.map((p) => (p.preview === preview ? { ...p, path, uploading: false } : p)) }));
      } catch (e) {
        this.patch(productId, (i) => ({ ...i, photos: i.photos.filter((p) => p.preview !== preview) }));
        this.toast.error('Não deu pra enviar a foto', reviewErrorMessage(e));
      }
    }
  }

  protected async publish(): Promise<void> {
    if (!this.ready()) return;
    if (!this.api) {
      this.error.set('Avaliações indisponíveis neste ambiente.');
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const payload = submitPayload(this.order().id, this.anonymous(), this.items(), this.pickupPlace() ? this.pickupRating() : 0);
    try {
      const result = await this.api.submit(payload);
      trackLojaEvent('loja_avaliacao_publicada', { pedido_id: this.order().id, itens: payload.items.length, edicao: !result.created });
      this.toast.success(result.created ? 'Valeu pela avaliação!' : 'Avaliação atualizada', 'Ela já aparece na página do produto.');
      this.published.emit(result);
    } catch (e) {
      this.error.set(reviewErrorMessage(e));
    } finally {
      this.submitting.set(false);
    }
  }

  protected close(): void {
    if (!this.submitting()) this.closed.emit();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
