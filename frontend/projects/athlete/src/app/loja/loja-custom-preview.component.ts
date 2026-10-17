import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  areaPreviewBox,
  clampTransform,
  contrastRatio,
  imageHeightFraction,
  nameFontFraction,
  namePreviewBox,
  nameSide,
  type ImageTransform,
  type PreviewBox,
} from '../data/store-customize-model';
import type { StoreCustomArea, StoreNamePlacement, StorePhotoView } from '../data/store-showcase-model';

export interface PreviewName {
  text: string;
  fontId: string;
  color: string;
  placement: StoreNamePlacement;
}

export interface PreviewImage {
  url: string;
  /** Largura ÷ altura. */
  aspect: number;
  transform: ImageTransform;
}

/** Passo do teclado: 2% da área por seta, 5% de escala por +/−. */
const KEY_MOVE = 0.02;
const KEY_SCALE = 0.05;

interface Drag {
  mode: 'move' | 'scale';
  startX: number;
  startY: number;
  areaW: number;
  areaH: number;
  from: ImageTransform;
}

/**
 * Prévia ilustrativa da personalização (02b): foto do lado na cor escolhida (ou o mockup
 * listrado na cor da peça), o nome na faixa do `placement` e a imagem na caixa da área, numa peça de referência
 * de 60 × 70 cm. Com `interactive`, a imagem arrasta e a alça escala, sempre dentro da área.
 */
@Component({
  selector: 'app-loja-custom-preview',
  template: `
    @if (photoUrl(); as url) {
      <img class="cp-photo" [src]="url" alt="" decoding="async" />
    } @else {
      <span class="cp-mockbg" [style.background-color]="garmentHex()" aria-hidden="true"></span>
      <span class="cp-mock" [class.cp-mock--on-light]="lightGarment()" aria-hidden="true">MOCKUP · {{ side() === 'frente' ? 'FRENTE' : 'COSTAS' }}</span>
    }
    <div class="cp-garment">
      @if (areaBox(); as box) {
        <div class="cp-area" [class.cp-area--edit]="interactive()" [style]="boxStyle(box)">
          @if (image(); as img) {
            <img
              class="cp-art"
              [src]="img.url"
              alt="Sua imagem"
              draggable="false"
              [style]="artStyle()"
              [attr.tabindex]="interactive() ? 0 : null"
              [attr.aria-label]="interactive() ? 'Sua imagem: arraste ou use as setas para mover, + e − para o tamanho' : null"
              (pointerdown)="startDrag($event, 'move')"
              (keydown)="onKey($event)"
            />
            @if (interactive()) {
              <span class="cp-handle" [style]="handleStyle()" aria-hidden="true" (pointerdown)="startDrag($event, 'scale')"></span>
            }
          } @else {
            <span class="cp-art-placeholder" aria-hidden="true">{{ compact() ? '' : 'SUA IMAGEM' }}</span>
          }
        </div>
      }
      @if (nameShown(); as n) {
        <div class="cp-name-band" [style]="boxStyle(namePreviewBox(n.placement))">
          <span
            class="cp-name"
            [attr.data-font]="n.fontId"
            [class.cp-name--empty]="!n.text"
            [style.color]="n.color"
            [style.font-size.cqw]="nameFont() * 100"
          >{{ n.text || 'SEU NOME' }}</span>
        </div>
      }
    </div>
  `,
  styleUrl: './loja-custom-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'cp',
    '[class.cp--compact]': 'compact()',
    '(pointermove)': 'onDrag($event)',
    '(pointerup)': 'endDrag()',
    '(pointercancel)': 'endDrag()',
  },
})
export class LojaCustomPreviewComponent {
  readonly side = input.required<StorePhotoView>();
  readonly photoUrl = input<string | null>(null);
  /** Cor da peça: sem foto, o mockup ganha essa cor (o nome padrão contrasta com ela). */
  readonly garmentHex = input<string | null>(null);
  readonly name = input<PreviewName | null>(null);
  /** Área da imagem: sem `image`, mostra o lugar listrado "SUA IMAGEM". */
  readonly area = input<StoreCustomArea | null>(null);
  readonly image = input<PreviewImage | null>(null);
  readonly interactive = input(false);
  /** Miniatura: sem rótulo no lugar da imagem. */
  readonly compact = input(false);
  readonly transformChanged = output<ImageTransform>();

  private drag: Drag | null = null;

  protected readonly lightGarment = computed(() => {
    const hex = this.garmentHex();
    if (!hex) return false;
    return (contrastRatio(hex, '#000000') ?? 0) > (contrastRatio(hex, '#ffffff') ?? 0);
  });
  protected readonly areaBox = computed(() => {
    const a = this.area();
    return a && this.side() === 'frente' ? areaPreviewBox(a) : null;
  });
  protected readonly nameShown = computed(() => {
    const n = this.name();
    return n && nameSide(n.placement) === this.side() ? n : null;
  });
  protected readonly namePreviewBox = namePreviewBox;
  protected readonly nameFont = computed(() => {
    const n = this.nameShown();
    return n ? nameFontFraction([...(n.text || 'SEU NOME')].length, namePreviewBox(n.placement).w) : 0;
  });
  private readonly artBox = computed(() => {
    const img = this.image();
    const a = this.area();
    if (!img || !a) return null;
    const { x, y, scale } = img.transform;
    const h = imageHeightFraction(scale, img.aspect, a);
    return { left: x - scale / 2, top: y - h / 2, w: scale, h };
  });
  protected readonly artStyle = computed(() => {
    const b = this.artBox();
    return b ? `left:${b.left * 100}%;top:${b.top * 100}%;width:${b.w * 100}%;height:${b.h * 100}%` : '';
  });
  protected readonly handleStyle = computed(() => {
    const b = this.artBox();
    return b ? `left:${(b.left + b.w) * 100}%;top:${(b.top + b.h) * 100}%` : '';
  });

  protected boxStyle(b: PreviewBox): string {
    return `left:${(b.cx - b.w / 2) * 100}%;top:${(b.cy - b.h / 2) * 100}%;width:${b.w * 100}%;height:${b.h * 100}%`;
  }

  protected startDrag(event: PointerEvent, mode: Drag['mode']): void {
    const img = this.image();
    if (!this.interactive() || !img) return;
    const areaEl = (event.target as HTMLElement).closest('.cp-area') as HTMLElement | null;
    if (!areaEl) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = areaEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.drag = { mode, startX: event.clientX, startY: event.clientY, areaW: rect.width, areaH: rect.height, from: img.transform };
  }

  protected onDrag(event: PointerEvent): void {
    const d = this.drag;
    const img = this.image();
    const a = this.area();
    if (!d || !img || !a) return;
    const dx = (event.clientX - d.startX) / d.areaW;
    const dy = (event.clientY - d.startY) / d.areaH;
    // Alça no canto: o centro fica e a largura cresce o dobro do deslocamento.
    const next =
      d.mode === 'move' ? { ...d.from, x: d.from.x + dx, y: d.from.y + dy } : { ...d.from, scale: d.from.scale + dx * 2 };
    this.transformChanged.emit(clampTransform(next, img.aspect, a));
  }

  protected endDrag(): void {
    this.drag = null;
  }

  protected onKey(event: KeyboardEvent): void {
    const img = this.image();
    const a = this.area();
    if (!this.interactive() || !img || !a) return;
    const t = img.transform;
    const moves: Record<string, ImageTransform> = {
      ArrowLeft: { ...t, x: t.x - KEY_MOVE },
      ArrowRight: { ...t, x: t.x + KEY_MOVE },
      ArrowUp: { ...t, y: t.y - KEY_MOVE },
      ArrowDown: { ...t, y: t.y + KEY_MOVE },
      '+': { ...t, scale: t.scale + KEY_SCALE },
      '=': { ...t, scale: t.scale + KEY_SCALE },
      '-': { ...t, scale: t.scale - KEY_SCALE },
    };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    this.transformChanged.emit(clampTransform(next, img.aspect, a));
  }
}
