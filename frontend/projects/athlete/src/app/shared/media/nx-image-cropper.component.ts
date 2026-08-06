import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  clampOffset,
  coverScale,
  cropRect,
  outputSize,
  zoomAnchoredOffset,
  type Point,
  type Size,
} from './image-crop-geometry';

const FOCUSABLE =
  'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.01;

let nextId = 0;

/** Estado de um arraste/pinça em andamento. */
interface Gesture {
  /** Ponteiros ativos, na ordem em que encostaram. */
  readonly pointers: Map<number, { x: number; y: number }>;
  /** Distância entre os dois dedos no início da pinça (null enquanto for 1 dedo). */
  pinchStartDistance: number | null;
  pinchStartZoom: number;
}

/**
 * Recortador de imagem com arraste, zoom (roda, pinça e slider) e moldura de
 * proporção fixa — equivalente web do `ProfileImageCropPage` do app.
 *
 * A imagem é renderizada num `<img>` com transform CSS em vez de canvas ao
 * vivo: além de ser mais suave (compositor), o navegador já aplica a
 * orientação EXIF no `<img>`, e o `drawImage` do export herda essa correção.
 * `createImageBitmap` ignoraria o EXIF e giraria fotos de celular.
 *
 * Declarativo como o `app-nx-blocking-dialog`: quem chama renderiza dentro de
 * um `@if` e controla o próprio estado.
 */
@Component({
  selector: 'app-nx-image-cropper',
  template: `
    <div class="sheet" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId">
      <header class="head">
        <h2 class="title" [id]="titleId">{{ heading() }}</h2>
        <button type="button" class="icon-btn" aria-label="Cancelar recorte" (click)="cancel()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      <div
        #frame
        class="frame"
        [style.aspect-ratio]="aspectRatio()"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerUp($event)"
        (lostpointercapture)="onPointerUp($event)"
        (wheel)="onWheel($event)"
      >
        @if (objectUrl(); as src) {
          <img
            #image
            class="photo"
            [src]="src"
            alt=""
            draggable="false"
            [style.width.px]="displayWidth()"
            [style.height.px]="displayHeight()"
            [style.transform]="transform()"
            (load)="onImageLoad()"
            (error)="onImageError()"
          />
        }
        <div class="grid" aria-hidden="true"></div>
      </div>

      <label class="zoom">
        <span class="zoom-label">Zoom</span>
        <input
          type="range"
          [min]="minZoom"
          [max]="maxZoom"
          [step]="zoomStep"
          [value]="zoom()"
          [disabled]="!ready()"
          aria-label="Ajustar zoom da foto"
          (input)="onZoomInput($any($event.target).valueAsNumber)"
        />
      </label>

      <p class="hint">Arraste pra reposicionar. Use o zoom pra enquadrar.</p>

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }

      <div class="actions">
        <button type="button" class="btn btn--ghost" (click)="cancel()">Cancelar</button>
        <button type="button" class="btn btn--primary" [disabled]="!ready() || exporting()" (click)="apply()">
          {{ exporting() ? 'Processando...' : confirmLabel() }}
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: safe center;
      justify-content: center;
      box-sizing: border-box;
      padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px))
        max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      background: rgba(5, 5, 5, 0.82);
      backdrop-filter: blur(3px);
      animation: scrim-in var(--nx-d-fast) var(--nx-ease-out) both;
    }

    .sheet {
      box-sizing: border-box;
      width: min(460px, 100%);
      max-height: min(100%, calc(100dvh - 32px));
      margin: auto;
      padding: 20px;
      overflow-x: hidden;
      overflow-y: auto;
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-4);
      box-shadow: var(--nx-elev-3);
      animation: sheet-in var(--nx-d-base) var(--nx-ease-out) both;
    }

    .head {
      display: flex;
      align-items: center;
      gap: var(--nx-s-3);
    }

    .title {
      flex: 1;
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.2px;
      color: var(--nx-text);
    }

    .icon-btn {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      margin-right: -10px;
      background: none;
      border: 0;
      border-radius: var(--nx-r-pill);
      color: var(--nx-text-mute);
      cursor: pointer;
      transition: background var(--nx-d-fast) var(--nx-ease-out), color var(--nx-d-fast) var(--nx-ease-out);
    }

    .icon-btn:hover {
      background: var(--nx-surface-1);
      color: var(--nx-text);
    }

    .frame {
      position: relative;
      width: 100%;
      margin-top: var(--nx-s-4);
      overflow: hidden;
      background: #000;
      border-radius: var(--nx-r-3);
      /* Sem isto o navegador rouba o gesto pra rolar/zoom da página. */
      touch-action: none;
      cursor: grab;
      user-select: none;
    }

    .frame:active {
      cursor: grabbing;
    }

    .photo {
      position: absolute;
      top: 50%;
      left: 50%;
      max-width: none;
      transform-origin: center;
      will-change: transform;
      -webkit-user-drag: none;
    }

    /* Guias de terço: ajudam o enquadramento sem competir com a foto. */
    .grid {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(to right, rgba(255, 255, 255, 0.22) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.22) 1px, transparent 1px);
      background-position: 33.33% 0, 0 33.33%;
      background-size: 33.33% 100%, 100% 33.33%;
    }

    .zoom {
      display: flex;
      align-items: center;
      gap: var(--nx-s-3);
      margin-top: var(--nx-s-4);
    }

    .zoom-label {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      font-weight: 600;
      color: var(--nx-text-mute);
    }

    .zoom input {
      flex: 1;
      min-width: 0;
      min-height: 44px;
      accent-color: var(--nx-orange-500);
      cursor: pointer;
    }

    .hint {
      margin: var(--nx-s-2) 0 0;
      font-family: var(--nx-font-ui);
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
    }

    .error {
      margin: var(--nx-s-3) 0 0;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-live);
    }

    .actions {
      display: flex;
      gap: var(--nx-s-2);
      margin-top: var(--nx-s-4);
    }

    .btn {
      box-sizing: border-box;
      flex: 1 1 0;
      min-width: 0;
      min-height: 46px;
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      font-family: var(--nx-font-display);
      font-size: 14px;
      cursor: pointer;
      transition: background var(--nx-d-fast) var(--nx-ease-out), border-color var(--nx-d-fast) var(--nx-ease-out);
    }

    .btn--primary {
      background: var(--nx-orange-500);
      border: 1px solid var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-weight: 700;
    }

    .btn--primary:hover:not(:disabled) {
      background: var(--nx-orange-400);
      border-color: var(--nx-orange-400);
    }

    .btn--primary:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .btn--ghost {
      background: none;
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-weight: 600;
    }

    .btn--ghost:hover {
      background: var(--nx-surface-1);
    }

    @keyframes scrim-in {
      from {
        opacity: 0;
      }
    }

    @keyframes sheet-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host,
      .sheet {
        animation: none;
      }
    }
  `,
  host: {
    '(keydown)': 'onKeydown($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxImageCropperComponent implements OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  readonly file = input.required<File>();
  /** Largura / altura da moldura. 1 = quadrado (destaques e avatar). */
  readonly aspectRatio = input(1);
  /** Teto de largura do JPEG exportado — nunca amplia além do recorte original. */
  readonly maxOutputWidth = input(1600);
  readonly quality = input(0.88);
  readonly heading = input('Ajustar foto');
  readonly confirmLabel = input('Aplicar');

  readonly cropped = output<Blob>();
  readonly cancelled = output<void>();

  protected readonly titleId = `nx-cropper-title-${nextId++}`;
  protected readonly minZoom = MIN_ZOOM;
  protected readonly maxZoom = MAX_ZOOM;
  protected readonly zoomStep = ZOOM_STEP;

  private readonly frameRef = viewChild<ElementRef<HTMLElement>>('frame');
  private readonly imageRef = viewChild<ElementRef<HTMLImageElement>>('image');

  protected readonly objectUrl = signal<string | null>(null);
  protected readonly ready = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly zoom = signal(1);

  /** Tamanho natural da foto e da moldura, em px. */
  private readonly natural = signal<Size>({ w: 0, h: 0 });
  private readonly frameSize = signal<Size>({ w: 0, h: 0 });
  /** Deslocamento do centro da foto em relação ao centro da moldura, em px de tela. */
  private readonly offset = signal<Point>({ x: 0, y: 0 });

  private gesture: Gesture | null = null;
  private frameObserver: ResizeObserver | null = null;
  private revokeUrl: string | null = null;

  private readonly baseScale = computed(() => coverScale(this.natural(), this.frameSize()));

  private readonly scale = computed(() => this.baseScale() * this.zoom());

  protected readonly displayWidth = computed(() => this.natural().w * this.scale());
  protected readonly displayHeight = computed(() => this.natural().h * this.scale());

  protected readonly transform = computed(() => {
    const { x, y } = this.offset();
    return `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  });

  constructor() {
    document.body.style.overflow = 'hidden';

    effect(() => {
      const file = this.file();
      this.releaseUrl();
      const url = URL.createObjectURL(file);
      this.revokeUrl = url;
      this.objectUrl.set(url);
      this.ready.set(false);
      this.error.set(null);
      this.zoom.set(1);
      this.offset.set({ x: 0, y: 0 });
    });

    afterNextRender(() => {
      this.observeFrame();
      this.focusable()[0]?.focus();
    });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.frameObserver?.disconnect();
    this.releaseUrl();
    this.previouslyFocused?.focus();
  }

  protected onImageLoad(): void {
    const img = this.imageRef()?.nativeElement;
    if (!img) {
      return;
    }
    this.natural.set({ w: img.naturalWidth, h: img.naturalHeight });
    this.measureFrame();
    this.offset.set({ x: 0, y: 0 });
    this.ready.set(true);
  }

  protected onImageError(): void {
    this.error.set('Não foi possível abrir esta imagem. Tente outro arquivo.');
    this.ready.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    // Prende o Tab no diálogo — sem isso o foco escapa pra tela de fundo.
    const items = this.focusable();
    if (items.length === 0) {
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.ready()) {
      return;
    }
    this.capturePointer(event.pointerId);

    if (!this.gesture) {
      this.gesture = { pointers: new Map(), pinchStartDistance: null, pinchStartZoom: this.zoom() };
    }
    // Um `pointerup` engolido (ponteiro sai da janela, aba perde o foco) deixaria
    // um ponteiro morto no mapa, e o próximo arraste viraria uma pinça fantasma
    // entre o dedo real e o fantasma. Só confia em ponteiros ainda capturados.
    this.dropStalePointers(event.pointerId);
    this.gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.gesture.pointers.size === 2) {
      this.gesture.pinchStartDistance = this.pointerDistance();
      this.gesture.pinchStartZoom = this.zoom();
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    const gesture = this.gesture;
    const previous = gesture?.pointers.get(event.pointerId);
    if (!gesture || !previous) {
      return;
    }
    event.preventDefault();
    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (gesture.pointers.size >= 2 && gesture.pinchStartDistance != null) {
      const distance = this.pointerDistance();
      if (distance > 0) {
        const next = gesture.pinchStartZoom * (distance / gesture.pinchStartDistance);
        this.zoomTo(next, this.pinchAnchor());
      }
      return;
    }

    const { x, y } = this.offset();
    this.setOffset(x + (event.clientX - previous.x), y + (event.clientY - previous.y));
  }

  protected onPointerUp(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture) {
      return;
    }
    // Limpa o estado ANTES de mexer no capture: se `releasePointerCapture`
    // lançasse primeiro, o ponteiro ficaria preso no gesto para sempre.
    gesture.pointers.delete(event.pointerId);

    if (gesture.pointers.size < 2) {
      gesture.pinchStartDistance = null;
    }
    if (gesture.pointers.size === 0) {
      this.gesture = null;
    }
    this.releasePointer(event.pointerId);
  }

  protected onWheel(event: WheelEvent): void {
    if (!this.ready()) {
      return;
    }
    event.preventDefault();
    const factor = Math.exp(-event.deltaY / 320);
    this.zoomTo(this.zoom() * factor, this.anchorFromClient(event.clientX, event.clientY));
  }

  protected onZoomInput(value: number): void {
    if (Number.isFinite(value)) {
      this.zoomTo(value, { x: 0, y: 0 });
    }
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  protected async apply(): Promise<void> {
    const img = this.imageRef()?.nativeElement;
    const scale = this.scale();
    if (!img || !this.ready() || scale <= 0) {
      return;
    }

    this.error.set(null);
    this.exporting.set(true);
    try {
      const blob = await this.exportBlob(img, scale);
      this.cropped.emit(blob);
    } catch {
      this.error.set('Não foi possível recortar a foto agora. Tente novamente.');
    } finally {
      this.exporting.set(false);
    }
  }

  private async exportBlob(img: HTMLImageElement, scale: number): Promise<Blob> {
    const { sx, sy, sw, sh } = cropRect(this.natural(), this.frameSize(), this.offset(), scale);
    const out = outputSize(sw, this.aspectRatio(), this.maxOutputWidth());

    const canvas = document.createElement('canvas');
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('canvas');
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out.w, out.h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', this.quality()),
    );
    if (!blob) {
      throw new Error('toBlob');
    }
    return blob;
  }

  /**
   * Aplica um novo zoom mantendo fixo o ponto da foto que está sob `anchor`
   * (offset em px a partir do centro da moldura). Sem isso o zoom "foge" do
   * ponto que a pessoa está olhando.
   */
  private zoomTo(next: number, anchor: Point): void {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const previous = this.zoom();
    if (clamped === previous) {
      return;
    }
    const moved = zoomAnchoredOffset(this.offset(), anchor, clamped / previous);
    this.zoom.set(clamped);
    this.setOffset(moved.x, moved.y);
  }

  /** Grava o deslocamento já preso às bordas — a foto nunca deixa buraco na moldura. */
  private setOffset(x: number, y: number): void {
    const display = { w: this.displayWidth(), h: this.displayHeight() };
    this.offset.set(clampOffset({ x, y }, display, this.frameSize()));
  }

  private observeFrame(): void {
    const frame = this.frameRef()?.nativeElement;
    if (!frame || typeof ResizeObserver === 'undefined') {
      this.measureFrame();
      return;
    }
    this.frameObserver = new ResizeObserver(() => {
      this.measureFrame();
      // Reprende o offset: encolher a moldura pode deixar a foto fora de posição.
      const { x, y } = this.offset();
      this.setOffset(x, y);
    });
    this.frameObserver.observe(frame);
  }

  private measureFrame(): void {
    const frame = this.frameRef()?.nativeElement;
    if (!frame) {
      return;
    }
    const rect = frame.getBoundingClientRect();
    this.frameSize.set({ w: rect.width, h: rect.height });
  }

  /** `setPointerCapture` lança quando o ponteiro já não está ativo — o arraste
   *  funciona sem captura, então a falha não pode interromper o gesto. */
  private capturePointer(pointerId: number): void {
    try {
      this.frameRef()?.nativeElement.setPointerCapture(pointerId);
    } catch {
      // segue sem captura.
    }
  }

  private releasePointer(pointerId: number): void {
    try {
      this.frameRef()?.nativeElement.releasePointerCapture(pointerId);
    } catch {
      // já liberado.
    }
  }

  /** Descarta do gesto os ponteiros que o navegador já não considera ativos. */
  private dropStalePointers(currentPointerId: number): void {
    const gesture = this.gesture;
    const frame = this.frameRef()?.nativeElement;
    if (!gesture || !frame) {
      return;
    }
    for (const pointerId of [...gesture.pointers.keys()]) {
      if (pointerId !== currentPointerId && !frame.hasPointerCapture(pointerId)) {
        gesture.pointers.delete(pointerId);
      }
    }
    if (gesture.pointers.size < 2) {
      gesture.pinchStartDistance = null;
    }
  }

  private pointerDistance(): number {
    const points = [...(this.gesture?.pointers.values() ?? [])];
    const a = points[0];
    const b = points[1];
    if (!a || !b) {
      return 0;
    }
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Ponto médio entre os dois dedos, em offset a partir do centro da moldura. */
  private pinchAnchor(): Point {
    const points = [...(this.gesture?.pointers.values() ?? [])];
    const a = points[0];
    const b = points[1];
    if (!a || !b) {
      return { x: 0, y: 0 };
    }
    return this.anchorFromClient((a.x + b.x) / 2, (a.y + b.y) / 2);
  }

  private anchorFromClient(clientX: number, clientY: number): Point {
    const frame = this.frameRef()?.nativeElement;
    if (!frame) {
      return { x: 0, y: 0 };
    }
    const rect = frame.getBoundingClientRect();
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  }

  private releaseUrl(): void {
    if (this.revokeUrl) {
      URL.revokeObjectURL(this.revokeUrl);
      this.revokeUrl = null;
    }
  }

  private focusable(): HTMLElement[] {
    return Array.from(this.el.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE));
  }
}
