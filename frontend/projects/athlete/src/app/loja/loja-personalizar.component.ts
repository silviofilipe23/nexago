import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { formatCentsBRL } from '../data/cashback-model';
import {
  STORE_CUSTOMIZE_API,
  customizeErrorMessage,
  type AddCustomItemInput,
  type CustomUpload,
} from '../data/store-customize-api';
import {
  CONTENT_TYPE_BY_FORMAT,
  areaSizeLabel,
  backNumberHint,
  backPreviewBox,
  backStepTitle,
  customExtraCents,
  defaultNameColor,
  effectiveDpi,
  finalizeName,
  fitTransform,
  fontLabel,
  hasCustomOptions,
  imageFileProblem,
  imageFormat,
  imageQuality,
  imageQualityLabel,
  imageRulesLabel,
  imageStepTitle,
  nameHint,
  nameHintWarns,
  nameLength,
  nameProblemMessage,
  nameSide,
  nameStepTitle,
  previewPhoto,
  previewPhotoNote,
  priceBreakdown,
  productionNote,
  sanitizeBackNumber,
  sanitizeNameInput,
  soloPriceLabel,
  type ImageDims,
  type ImageTransform,
  type NameProblem,
} from '../data/store-customize-model';
import {
  axisValueAvailable,
  chooseAxisMessage,
  initialSelection,
  isColorAxis,
  maxQuantity,
  missingAxis,
  selectAxisValue,
  selectedVariant,
  selectionPrice,
  soldOutMessage,
} from '../data/store-product-model';
import {
  categoryLabel,
  pixPriceCents,
  type StoreAxis,
  type StoreCustomArea,
  type StorePhotoView,
  type StoreProduct,
} from '../data/store-showcase-model';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { NxSkeletonComponent } from '../shared/loading/nx-skeleton.component';
import {
  LojaCustomPreviewComponent,
  type PreviewBack,
  type PreviewImage,
  type PreviewName,
} from './loja-custom-preview.component';
import { LojaMiniCartComponent, buildMiniCartLines } from './loja-mini-cart.component';
import { trackLojaEvent } from './loja-telemetry';
import { LojaVitrineStore } from './loja-vitrine.store';

const ADDED_FLASH_MS = 1500;
const MINI_CART_MS = 4000;
const SHAKE_MS = 450;

/** Arte escolhida: lida no navegador, depois enviada ao Storage do atleta. */
interface Upload {
  status: 'uploading' | 'done' | 'error';
  file: File;
  fileName: string;
  format: string;
  previewUrl: string;
  dims: ImageDims | null;
  aspect: number;
  pct: number;
  path: string | null;
}

/** Arte da frente (área escolhida) ou das costas (abaixo do nome). */
type Slot = 'front' | 'back';

/**
 * Loja · Personalizar (02b, portal web): prévia ao vivo + passos Cor e tamanho · Nome · Imagem ·
 * Costas.
 * O adicional e a linha do carrinho saem do servidor (`addStoreCustomItemToCart`), que revalida
 * tudo; aqui é o retorno na hora. Regras em `docs/business-rules/loja-personalizar.md`.
 */
@Component({
  selector: 'app-loja-personalizar',
  imports: [AtPanelShellComponent, RouterLink, NxSkeletonComponent, LojaCustomPreviewComponent, LojaMiniCartComponent],
  providers: [LojaVitrineStore],
  templateUrl: './loja-personalizar.component.html',
  styleUrl: './loja-personalizar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'miniCartOpen.set(false)' },
})
export class LojaPersonalizarComponent {
  protected readonly store = inject(LojaVitrineStore);
  private readonly api = inject(STORE_CUSTOMIZE_API);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(NxToastService);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly key = computed(() => this.params().get('slug') ?? '');
  protected readonly product = computed<StoreProduct | null>(() => {
    const key = this.key();
    const list = this.store.products();
    return list.find((p) => p.slug === key) ?? list.find((p) => p.id === key) ?? null;
  });
  private readonly productId = computed(() => this.product()?.id ?? null);
  protected readonly custom = computed(() => {
    const c = this.product()?.customization ?? null;
    return hasCustomOptions(c) ? c : null;
  });

  // ── Cor, tamanho e quantidade ───────────────────────────────────
  protected readonly selected = signal<Record<string, string>>({});
  protected readonly qty = signal(1);
  protected readonly attention = signal<string | null>(null);
  protected readonly shaking = signal<string | null>(null);

  protected readonly attentionMessage = computed(() => {
    const axis = this.product()?.axes.find((a) => a.id === this.attention());
    return axis ? chooseAxisMessage(axis) : null;
  });
  protected readonly variant = computed(() => {
    const p = this.product();
    return p ? selectedVariant(p, this.selected()) : null;
  });
  protected readonly maxQty = computed(() => {
    const p = this.product();
    return p ? maxQuantity(p, this.selected()) : 1;
  });
  private readonly colorAxis = computed(() => this.product()?.axes.find((a) => isColorAxis(a)) ?? null);
  private readonly colorValue = computed(() => {
    const axis = this.colorAxis();
    const id = axis ? this.selected()[axis.id] : undefined;
    return axis?.values.find((v) => v.id === id) ?? null;
  });

  // ── Nome ────────────────────────────────────────────────────────
  protected readonly nameOn = signal(true);
  protected readonly nameText = signal('');
  protected readonly nameFont = signal<string | null>(null);
  /** Cor escolhida pelo atleta; até lá, a de maior contraste com a cor da peça. */
  private readonly pickedNameColor = signal<string | null>(null);
  protected readonly nameRejected = signal(false);
  protected readonly nameShake = signal(false);
  protected readonly nameProblem = signal<NameProblem | null>(null);

  protected readonly nameColor = computed(() => {
    const c = this.custom();
    if (!c) return null;
    const picked = this.pickedNameColor();
    return picked && c.name.colors.includes(picked) ? picked : defaultNameColor(c.name.colors, this.colorValue()?.hex ?? null);
  });
  protected readonly fontId = computed(() => {
    const fonts = this.custom()?.name.fonts ?? [];
    const f = this.nameFont();
    return f && fonts.includes(f) ? f : (fonts[0] ?? 'bloco');
  });
  protected readonly nameLen = computed(() => nameLength(this.nameText()));
  protected readonly hasName = computed(() => !!this.custom()?.name.enabled && this.nameOn() && this.nameLen() > 0);

  // ── Imagem ──────────────────────────────────────────────────────
  protected readonly imageOn = signal(true);
  protected readonly upload = signal<Upload | null>(null);
  /** Arquivo recusado antes de subir: o card fica vermelho com a regra. */
  protected readonly imageError = signal<{ fileName: string; message: string } | null>(null);
  protected readonly dragOver = signal(false);
  private readonly pickedAreaId = signal<string | null>(null);
  protected readonly transform = signal<ImageTransform>({ x: 0.5, y: 0.5, scale: 1 });

  protected readonly area = computed<StoreCustomArea | null>(() => {
    const areas = this.custom()?.image.areas ?? [];
    return areas.find((a) => a.id === this.pickedAreaId()) ?? areas[0] ?? null;
  });
  protected readonly hasImage = computed(
    () => !!this.custom()?.image.enabled && this.imageOn() && this.upload()?.status === 'done',
  );
  protected readonly quality = computed(() => {
    const up = this.upload();
    const area = this.area();
    if (!up || !area) return null;
    const q = imageQuality(effectiveDpi(up.dims, area));
    return { tone: q, label: imageQualityLabel(q, up.dims, area) };
  });

  // ── Costas (abaixo do nome) ─────────────────────────────────────
  protected readonly backOn = signal(true);
  private readonly pickedBackKind = signal<'numero' | 'imagem'>('numero');
  protected readonly backNumber = signal('');
  protected readonly backNumberRejected = signal(false);
  protected readonly backUpload = signal<Upload | null>(null);
  protected readonly backImageError = signal<{ fileName: string; message: string } | null>(null);
  protected readonly backDragOver = signal(false);

  /** Número ou imagem: o que o atleta escolheu entre os liberados (um só liberado = ele). */
  protected readonly backKind = computed<'numero' | 'imagem' | null>(() => {
    const b = this.custom()?.back;
    if (!b?.enabled) return null;
    if (b.allowNumber && b.allowImage) return this.pickedBackKind();
    return b.allowNumber ? 'numero' : 'imagem';
  });
  protected readonly hasBack = computed(() => {
    const kind = this.backKind();
    if (!kind || !this.backOn()) return false;
    return kind === 'numero' ? this.backNumber().length > 0 : this.backUpload()?.status === 'done';
  });
  protected readonly backQuality = computed(() => {
    const up = this.backUpload();
    const b = this.custom()?.back;
    if (!up || !b) return null;
    const area = { id: 'costas', name: 'Costas', widthCm: b.widthCm, heightCm: b.heightCm };
    const q = imageQuality(effectiveDpi(up.dims, area));
    return { tone: q, label: imageQualityLabel(q, up.dims, area) };
  });
  /** Onde o nome fica nas costas (a caixa das costas encosta nele); `null` = sem nome nas costas. */
  private readonly backNamePlacement = computed(() => {
    const c = this.custom();
    return c?.name.enabled && this.nameOn() && nameSide(c.name.placement) === 'costas' ? c.name.placement : null;
  });

  // ── Prévia ──────────────────────────────────────────────────────
  protected readonly side = signal<StorePhotoView>('costas');
  protected readonly previewName = computed<PreviewName | null>(() => {
    const c = this.custom();
    if (!c?.name.enabled || !this.nameOn()) return null;
    return { text: finalizeName(this.nameText()), fontId: this.fontId(), color: this.nameColor() ?? '#f4f4f5', placement: c.name.placement };
  });
  protected readonly previewArea = computed(() => (this.custom()?.image.enabled && this.imageOn() ? this.area() : null));
  protected readonly previewImage = computed<PreviewImage | null>(() => {
    const up = this.upload();
    return up && this.previewArea() ? { url: up.previewUrl, aspect: up.aspect, transform: this.transform() } : null;
  });
  protected readonly previewBack = computed<PreviewBack | null>(() => {
    const c = this.custom();
    const kind = this.backKind();
    if (!c || !kind || !this.backOn()) return null;
    const up = this.backUpload();
    return {
      box: backPreviewBox(c.back, this.backNamePlacement()),
      kind,
      // Sem nome escolhido, a cor de maior contraste com a peça (a mesma conta do nome).
      number: kind === 'numero' ? { text: this.backNumber(), fontId: this.fontId(), color: this.nameColor() ?? '#f4f4f5' } : null,
      image: kind === 'imagem' && up ? { url: up.previewUrl } : null,
    };
  });
  protected readonly garmentHex = computed(() => this.colorValue()?.hex ?? null);
  protected photoFor(side: StorePhotoView): string | null {
    const p = this.product();
    return p ? (previewPhoto(p, this.colorValue()?.id ?? null, side)?.url ?? null) : null;
  }
  /** A cor sem foto usa a de outra cor: a prévia diz qual. */
  protected readonly photoNote = computed(() => {
    const p = this.product();
    return p ? previewPhotoNote(p, this.colorValue()?.id ?? null, this.side()) : null;
  });

  // ── Preço ───────────────────────────────────────────────────────
  protected readonly baseCents = computed(() => {
    const p = this.product();
    return p ? selectionPrice(p, this.selected()).cents : 0;
  });
  protected readonly extraCents = computed(() => {
    const c = this.custom();
    return c ? customExtraCents(c.price, this.hasName(), this.hasImage(), this.hasBack()) : 0;
  });
  protected readonly unitCents = computed(() => this.baseCents() + this.extraCents());
  protected readonly breakdown = computed(() => priceBreakdown(this.baseCents(), this.extraCents()));
  protected readonly pixLabel = computed(() => {
    const pct = this.store.config().benefits.pixDiscountPct;
    return pct === null ? null : formatCentsBRL(pixPriceCents(this.unitCents(), pct));
  });
  protected readonly optionsTag = computed(() => {
    const c = this.custom();
    if (!c) return '';
    const parts = [c.name.enabled ? 'Nome' : '', c.image.enabled ? 'imagem' : '', c.back.enabled ? 'costas' : ''].filter(Boolean);
    const tag = parts.join(' + ');
    return tag.charAt(0).toUpperCase() + tag.slice(1);
  });

  // ── Adicionar ───────────────────────────────────────────────────
  protected readonly adding = signal(false);
  protected readonly added = signal(false);
  protected readonly cartPulse = signal(false);
  protected readonly miniCartOpen = signal(false);
  protected readonly addBlocked = computed(
    () =>
      this.adding() ||
      this.upload()?.status === 'uploading' ||
      this.backUpload()?.status === 'uploading' ||
      (this.hasName() && this.nameProblem() === 'blocked'),
  );
  protected readonly miniCartLines = computed(() => buildMiniCartLines(this.store.cart(), this.store.products()));
  protected readonly miniCartSubtotal = computed(() => this.miniCartLines().reduce((t, l) => t + l.totalCents, 0));

  private timers: ReturnType<typeof setTimeout>[] = [];
  private miniCartTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly tasks: Record<Slot, CustomUpload | null> = { front: null, back: null };
  private checkSeq = 0;

  constructor() {
    // Produto chegou: cor e tamanho da URL (os que valem), o resto como na página do produto.
    effect(() => {
      const id = this.productId();
      if (id === null) return;
      untracked(() => {
        const p = this.product()!;
        const query = this.route.snapshot.queryParamMap;
        let sel = initialSelection(p);
        p.axes.forEach((axis) => {
          const v = query.get(axis.id);
          if (v && axis.values.some((x) => x.id === v)) sel = selectAxisValue(p, sel, axis.id, v);
        });
        this.selected.set(sel);
        this.qty.set(1);
        const c = this.custom();
        this.side.set(c?.name.enabled ? nameSide(c.name.placement) : 'frente');
        trackLojaEvent('loja_personalizar_open', { produto_id: id, canal: 'web' });
      });
    });

    effect(() => {
      const max = this.maxQty();
      untracked(() => {
        if (this.qty() > max) this.qty.set(max);
      });
    });

    inject(DestroyRef).onDestroy(() => {
      for (const t of this.timers) clearTimeout(t);
      if (this.miniCartTimer) clearTimeout(this.miniCartTimer);
      for (const slot of ['front', 'back'] as const) {
        this.tasks[slot]?.cancel();
        const up = this.uploadOf(slot)();
        if (up) URL.revokeObjectURL(up.previewUrl);
      }
    });
  }

  // ── Cor e tamanho ───────────────────────────────────────────────

  protected isColor(axis: StoreAxis): boolean {
    return isColorAxis(axis);
  }

  protected available(axisIndex: number, valueId: string): boolean {
    const p = this.product();
    return p ? axisValueAvailable(p, axisIndex, valueId, this.selected()) : false;
  }

  protected pick(axis: StoreAxis, axisIndex: number, valueId: string): void {
    const p = this.product();
    if (!p || this.selected()[axis.id] === valueId) return;
    // Tamanho sem saldo não é escolhido aqui: o "Avise-me" fica na página do produto.
    if (!this.isColor(axis) && !this.available(axisIndex, valueId)) return;
    const next = selectAxisValue(p, this.selected(), axis.id, valueId);
    this.selected.set(next);
    if (this.attention() === axis.id) this.attention.set(null);
    void this.router.navigate([], { relativeTo: this.route, queryParams: next, replaceUrl: true });
  }

  protected stepQty(delta: number): void {
    this.qty.update((n) => Math.min(this.maxQty(), Math.max(1, n + delta)));
  }

  // ── Nome ────────────────────────────────────────────────────────

  protected nameHintText(): string {
    const c = this.custom();
    if (this.nameProblem() === 'blocked') return nameProblemMessage('blocked');
    if (this.nameRejected()) return nameProblemMessage('chars');
    return c ? nameHint(this.nameLen(), c.name.maxChars) : '';
  }

  protected nameHintWarn(): boolean {
    const c = this.custom();
    return !!c && nameHintWarns(this.nameLen(), c.name.maxChars);
  }

  protected onNameInput(input: HTMLInputElement): void {
    const c = this.custom();
    if (!c) return;
    const { value, rejected } = sanitizeNameInput(input.value, c.name.maxChars);
    if (input.value !== value) {
      const caret = Math.max(0, (input.selectionStart ?? value.length) - (input.value.length - value.length));
      input.value = value;
      input.setSelectionRange(caret, caret);
    }
    this.nameRejected.set(rejected);
    if (rejected) this.shakeName();
    if (value !== this.nameText()) this.nameProblem.set(null);
    this.nameText.set(value);
    this.side.set(nameSide(c.name.placement));
  }

  /** Blur: tira o espaço do fim e confere a lista de bloqueio no servidor. */
  protected async onNameBlur(input: HTMLInputElement): Promise<void> {
    const p = this.product();
    const text = finalizeName(this.nameText());
    if (input.value !== text) input.value = text;
    this.nameText.set(text);
    this.nameRejected.set(false);
    if (!p || !text || !this.api) return;
    const seq = ++this.checkSeq;
    try {
      const problem = await this.api.checkName(p.id, text);
      if (seq === this.checkSeq && this.nameText() === text) this.nameProblem.set(problem);
    } catch {
      // Sem resposta, o servidor confere de novo ao adicionar.
    }
  }

  protected chooseFont(id: string): void {
    this.nameFont.set(id);
    this.side.set(nameSide(this.custom()!.name.placement));
  }

  protected chooseNameColor(hex: string): void {
    this.pickedNameColor.set(hex);
    this.side.set(nameSide(this.custom()!.name.placement));
  }

  protected setNameOn(on: boolean): void {
    this.nameOn.set(on);
    const c = this.custom();
    if (on && c) this.side.set(nameSide(c.name.placement));
  }

  private shakeName(): void {
    this.nameShake.set(false);
    this.later(() => this.nameShake.set(true), 0);
    this.later(() => this.nameShake.set(false), SHAKE_MS);
  }

  // ── Imagem ──────────────────────────────────────────────────────

  protected setImageOn(on: boolean): void {
    this.imageOn.set(on);
    if (on) this.side.set('frente');
  }

  protected chooseArea(area: StoreCustomArea): void {
    this.pickedAreaId.set(area.id);
    this.side.set('frente');
    const up = this.upload();
    if (up) this.transform.set(fitTransform(up.aspect, area));
  }

  protected onFilePicked(input: HTMLInputElement, slot: Slot = 'front'): void {
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.takeFile(file, slot);
  }

  protected onDrop(event: DragEvent, slot: Slot = 'front'): void {
    event.preventDefault();
    this.dragOf(slot).set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.takeFile(file, slot);
  }

  protected onDragOver(event: DragEvent, slot: Slot = 'front'): void {
    event.preventDefault();
    this.dragOf(slot).set(true);
  }

  protected retryUpload(slot: Slot = 'front'): void {
    const up = this.uploadOf(slot)();
    if (up) this.startUpload(up, slot);
  }

  private uploadOf(slot: Slot) {
    return slot === 'front' ? this.upload : this.backUpload;
  }

  private errorOf(slot: Slot) {
    return slot === 'front' ? this.imageError : this.backImageError;
  }

  private dragOf(slot: Slot) {
    return slot === 'front' ? this.dragOver : this.backDragOver;
  }

  /** Mesmas regras (formato, peso, resolução) e mesmo envio para a frente e para as costas. */
  private async takeFile(file: File, slot: Slot): Promise<void> {
    const c = this.custom();
    const uid = this.auth.user()?.uid;
    if (!c || !uid) return;
    this.side.set(slot === 'front' ? 'frente' : 'costas');
    const format = imageFormat(file);
    const previewUrl = URL.createObjectURL(file);
    const natural = await readImageSize(previewUrl);
    const dims = format === 'svg' ? null : natural;
    const problem = imageFileProblem(file, dims, c.image);
    if (problem) {
      URL.revokeObjectURL(previewUrl);
      this.errorOf(slot).set({ fileName: file.name, message: problem });
      return;
    }
    this.tasks[slot]?.cancel();
    const previous = this.uploadOf(slot)();
    if (previous) URL.revokeObjectURL(previous.previewUrl);
    const aspect = natural && natural.heightPx > 0 ? natural.widthPx / natural.heightPx : 1;
    this.errorOf(slot).set(null);
    const area = this.area();
    if (slot === 'front' && area) this.transform.set(fitTransform(aspect, area));
    this.startUpload(
      { status: 'uploading', file, fileName: file.name, format: format!, previewUrl, dims, aspect, pct: 0, path: null },
      slot,
    );
  }

  private startUpload(up: Upload, slot: Slot): void {
    const uid = this.auth.user()?.uid;
    if (!uid || !this.api) {
      this.uploadOf(slot).set({ ...up, status: 'error' });
      return;
    }
    this.uploadOf(slot).set({ ...up, status: 'uploading', pct: 0, path: null });
    const task = this.api.uploadImage(uid, up.file, up.format, CONTENT_TYPE_BY_FORMAT[up.format] ?? up.file.type, (pct) =>
      this.patchUpload(slot, up.previewUrl, { pct }),
    );
    this.tasks[slot] = task;
    task.done.then(
      (path) => this.patchUpload(slot, up.previewUrl, { status: 'done', pct: 100, path }),
      () => this.patchUpload(slot, up.previewUrl, { status: 'error' }),
    );
  }

  /** Só mexe se ainda for a mesma arte (trocar no meio do envio descarta o antigo). */
  private patchUpload(slot: Slot, previewUrl: string, patch: Partial<Upload>): void {
    this.uploadOf(slot).update((u) => (u && u.previewUrl === previewUrl ? { ...u, ...patch } : u));
  }

  // ── Costas ──────────────────────────────────────────────────────

  protected setBackOn(on: boolean): void {
    this.backOn.set(on);
    if (on) this.side.set('costas');
  }

  protected chooseBackKind(kind: 'numero' | 'imagem'): void {
    this.pickedBackKind.set(kind);
    this.side.set('costas');
  }

  protected onBackNumberInput(input: HTMLInputElement): void {
    const c = this.custom();
    if (!c) return;
    const { value, rejected } = sanitizeBackNumber(input.value, c.back.numberMaxDigits);
    if (input.value !== value) input.value = value;
    this.backNumberRejected.set(rejected);
    this.backNumber.set(value);
    this.side.set('costas');
  }

  // ── Carrinho ────────────────────────────────────────────────────

  protected async addToCart(): Promise<void> {
    const p = this.product();
    const c = this.custom();
    if (!p || !c || this.addBlocked()) return;
    const missing = missingAxis(p, this.selected());
    if (missing) {
      this.attention.set(missing.id);
      this.shakeAxis(missing.id);
      return;
    }
    const variant = this.variant();
    if (!variant) return;
    if (!variant.inStock) {
      this.toast.warning(soldOutMessage(p, variant));
      return;
    }
    const hasName = this.hasName();
    const hasImage = this.hasImage();
    const hasBack = this.hasBack();
    if (!hasName && !hasImage && !hasBack) {
      this.toast.warning('Escolha um nome, uma imagem ou as costas', 'Pra comprar sem personalizar, use a página do produto.');
      return;
    }
    if (!this.api) {
      this.toast.error('Não deu pra adicionar ao carrinho', 'Tente de novo em instantes.');
      return;
    }

    const up = this.upload();
    const area = this.area();
    const input: AddCustomItemInput = { productId: p.id, skuId: variant.id, qty: this.qty() };
    if (hasName) input.name = { text: finalizeName(this.nameText()), fontId: this.fontId(), color: this.nameColor()! };
    if (hasImage && up?.path && area) input.image = { path: up.path, areaId: area.id, transform: this.transform() };
    const backUp = this.backUpload();
    if (hasBack) {
      input.back =
        this.backKind() === 'numero' ? { type: 'numero', number: this.backNumber() } : { type: 'imagem', path: backUp!.path! };
    }

    this.adding.set(true);
    try {
      const result = await this.api.addToCart(input);
      if (hasName) trackLojaEvent('loja_personalizar_nome', { fonte: input.name!.fontId });
      if (hasImage) trackLojaEvent('loja_personalizar_imagem', { area: area?.id ?? null, qualidade: this.quality()?.tone ?? null });
      if (hasBack) trackLojaEvent('loja_personalizar_costas', { tipo: input.back!.type });
      trackLojaEvent('loja_add_carrinho', { sku: variant.id, qtd: input.qty, preco: result.unitPriceCents, personalizado: true });
      this.celebrate();
    } catch (e) {
      if (/não pode ser usado/i.test(String((e as { message?: unknown })?.message ?? ''))) this.nameProblem.set('blocked');
      this.toast.error('Não deu pra adicionar ao carrinho', customizeErrorMessage(e, 'Tente de novo em instantes.'));
    } finally {
      this.adding.set(false);
    }
  }

  private celebrate(): void {
    this.added.set(true);
    this.cartPulse.set(true);
    this.later(() => this.added.set(false), ADDED_FLASH_MS);
    this.later(() => this.cartPulse.set(false), 700);
    this.miniCartOpen.set(true);
    this.scheduleMiniCartClose(MINI_CART_MS);
  }

  private shakeAxis(axisId: string): void {
    this.shaking.set(null);
    this.later(() => this.shaking.set(axisId), 0);
    this.later(() => this.shaking.set(null), SHAKE_MS);
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(setTimeout(fn, ms));
  }

  protected scheduleMiniCartClose(ms = MINI_CART_MS): void {
    if (this.miniCartTimer) clearTimeout(this.miniCartTimer);
    this.miniCartTimer = setTimeout(() => this.miniCartOpen.set(false), ms);
  }

  protected holdMiniCart(): void {
    if (this.miniCartTimer) clearTimeout(this.miniCartTimer);
    this.miniCartTimer = null;
  }

  protected search(event: Event, term: string): void {
    event.preventDefault();
    const q = term.trim();
    void this.router.navigate(['/loja'], { queryParams: q ? { q } : {} });
  }

  // ── Formatação ──────────────────────────────────────────────────

  protected money(cents: number): string {
    return formatCentsBRL(cents);
  }

  protected categoryName(id: string): string {
    return categoryLabel(this.store.config(), id);
  }

  protected readonly nameTitle = computed(() => {
    const c = this.custom();
    return c ? nameStepTitle(c.name.placement) : '';
  });
  protected readonly imageTitle = computed(() => imageStepTitle(this.area()));
  protected readonly backTitle = computed(() => backStepTitle(this.backNamePlacement()));
  protected readonly backPrice = computed(() => `+ ${formatCentsBRL(this.custom()?.price.backCents ?? 0)}`);
  protected readonly backHint = computed(() => backNumberHint(this.custom()?.back.numberMaxDigits ?? 2));
  /** Número do passo das costas: depois de cor, nome e imagem ligados. */
  protected readonly backStepNumber = computed(() => {
    const c = this.custom();
    return c ? 2 + (c.name.enabled ? 1 : 0) + (c.image.enabled ? 1 : 0) : 0;
  });
  protected readonly nameSolo = computed(() => soloPriceLabel(this.custom()?.price.nameOnlyCents ?? 0, 'm'));
  protected readonly imageSolo = computed(() => soloPriceLabel(this.custom()?.price.imageOnlyCents ?? 0, 'f'));
  protected readonly imageRules = computed(() => {
    const c = this.custom();
    return c ? imageRulesLabel(c.image) : '';
  });
  protected readonly accept = computed(() =>
    (this.custom()?.image.formats ?? [])
      .flatMap((f) => [CONTENT_TYPE_BY_FORMAT[f] ?? '', `.${f}`, f === 'jpg' ? '.jpeg' : ''])
      .filter(Boolean)
      .join(','),
  );
  protected readonly note = computed(() => {
    const c = this.custom();
    return c ? productionNote(c) : null;
  });

  protected fontName(id: string): string {
    return fontLabel(id);
  }

  protected areaSize(area: StoreCustomArea): string {
    return areaSizeLabel(area);
  }
}

/** Largura e altura naturais (SVG sem tamanho pode vir 0 × 0 → `null`). */
function readImageSize(url: string): Promise<ImageDims | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? { widthPx: img.naturalWidth, heightPx: img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
