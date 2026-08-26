import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ChipTone, DocScreen, MockBlock, MockChip, MockScreen } from '../../../lib/docs/types';

/*
 * Cores fixas do produto retratado nos mocks. Como um screenshot, a ilustração mostra o
 * app/painel dark-first e NÃO acompanha o tema claro do site — por isso hex cru aqui, e
 * somente aqui. Porta 1:1 da constante `M` de `ScreenFigure.tsx`.
 */
const M = {
  bg: '#0b0b0c',
  surface: '#17171a',
  surface2: '#212126',
  line: 'rgba(255,255,255,0.09)',
  fg: '#f4f4f5',
  mute: 'rgba(244,244,245,0.62)',
  dim: 'rgba(244,244,245,0.42)',
  brand: '#ff6a1a',
  onBrand: '#0a0a0a',
  pending: '#f4c543',
  live: '#ff5a4e',
  win: '#2bd17e',
} as const;

const TONE_COLOR: Record<ChipTone, string> = {
  brand: M.brand,
  pending: M.pending,
  live: M.live,
  win: M.win,
  neutral: M.mute,
};

const NAV_ITEMS = ['Início', 'Agenda', 'Reservar', 'Competir', 'Comunidade'] as const;

function colorMix(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

/** Badge de estado dentro de um mock (ex.: "Ao vivo", "Pago"). Porta de `Chip` (ScreenFigure.tsx). */
@Component({
  selector: 'app-mock-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <span
      class="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[7px] font-semibold uppercase tracking-wider"
      [style.color]="color()"
      style="border-color: transparent"
      [style.background-color]="tint()"
    >
      <span class="size-1 rounded-full" [style.background-color]="color()" aria-hidden="true"></span>
      {{ chip().label }}
    </span>
  `,
})
export class MockChipView {
  readonly chip = input.required<MockChip>();

  protected readonly color = computed(() => TONE_COLOR[this.chip().tone ?? 'neutral']);
  protected readonly tint = computed(() => colorMix(this.color(), 14));
}

/** Ilustração esquemática de uma chave de torneio. Porta de `MiniBracket`. */
@Component({
  selector: 'app-mock-bracket',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <svg viewBox="0 0 220 96" class="w-full" aria-hidden="true">
      @for (y of [0, 26, 52, 78]; track y) {
        <rect [attr.x]="2" [attr.y]="y" width="56" height="16" rx="4" [attr.fill]="M.surface2" />
      }
      @for (y of [13, 65]; track y) {
        <rect [attr.x]="92" [attr.y]="y" width="56" height="16" rx="4" [attr.fill]="M.surface2" />
      }
      <rect x="162" y="39" width="56" height="16" rx="4" [attr.fill]="M.brand" opacity="0.9" />
      <path
        d="M58 8h14v26h20M58 34h14M58 60h14v26h20M58 86h14M148 21h7v26h7M148 73h7v-26"
        [attr.stroke]="M.line"
        stroke-width="1.5"
        fill="none"
      />
      @for (row of leftBars; track row.y) {
        <rect [attr.x]="6" [attr.y]="row.y" [attr.width]="row.width" height="7" rx="3.5" [attr.fill]="M.dim" opacity="0.5" />
      }
      @for (row of midBars; track row.y) {
        <rect [attr.x]="96" [attr.y]="row.y" [attr.width]="row.width" height="7" rx="3.5" [attr.fill]="M.mute" opacity="0.6" />
      }
      <rect x="166" y="43" width="36" height="7" rx="3.5" [attr.fill]="M.onBrand" opacity="0.8" />
    </svg>
  `,
})
export class MockBracket {
  protected readonly M = M;
  protected readonly leftBars = [
    { y: 4, width: 38 },
    { y: 30, width: 30 },
    { y: 56, width: 34 },
    { y: 82, width: 26 },
  ];
  protected readonly midBars = [
    { y: 17, width: 34 },
    { y: 69, width: 30 },
  ];
}

/** Grade de dias com destaques preenchidos. Porta de `MiniCalendar`. */
@Component({
  selector: 'app-mock-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div class="grid grid-cols-7 gap-1" aria-hidden="true">
      @for (day of days; track day) {
        <div class="aspect-square rounded-[3px]" [style.background-color]="filled.has(day) ? M.brand : M.surface2" [style.opacity]="filled.has(day) ? 0.9 : 1"></div>
      }
    </div>
  `,
})
export class MockCalendar {
  protected readonly M = M;
  protected readonly days = Array.from({ length: 28 }, (_, i) => i);
  protected readonly filled = new Set([9, 12, 16, 23, 24]);
}

/** Card de "copiar Pix" com QR ilustrativo. Porta de `MiniPix`. */
@Component({
  selector: 'app-mock-pix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div class="flex items-center gap-3 rounded-lg p-2.5" [style.background-color]="M.surface">
      <div class="grid size-12 shrink-0 grid-cols-5 gap-[2px] rounded-[4px] bg-white p-1" aria-hidden="true">
        @for (i of cellsRange; track i) {
          <div class="rounded-[1px]" [style.background-color]="cells.has(i) ? '#0a0a0a' : 'transparent'"></div>
        }
      </div>
      <div class="min-w-0 flex-1 space-y-1.5">
        <div class="h-1.5 w-3/4 rounded-full" [style.background-color]="M.mute" style="opacity: 0.5"></div>
        <div class="h-1.5 w-1/2 rounded-full" [style.background-color]="M.dim" style="opacity: 0.5"></div>
        <div
          class="inline-block rounded-full px-2 py-0.5 font-mono text-[7px] font-semibold uppercase tracking-wider"
          [style.background-color]="tint"
          [style.color]="M.brand"
        >
          Copiar código
        </div>
      </div>
    </div>
  `,
})
export class MockPix {
  protected readonly M = M;
  protected readonly cellsRange = Array.from({ length: 25 }, (_, i) => i);
  protected readonly cells = new Set([0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22, 24]);
  protected readonly tint = colorMix(M.brand, 16);
}

/**
 * Dispatcher de um bloco do mock (`MockBlock`) — cada `kind` vira um elemento esquemático.
 * Porta de `Block` (ScreenFigure.tsx). Usa `@let` para preservar o narrowing da union
 * discriminada dentro do `@switch` (chamadas repetidas de `block()` não narrowam sozinhas).
 */
@Component({
  selector: 'app-mock-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MockChipView, MockBracket, MockCalendar, MockPix],
  host: { class: 'contents' },
  template: `
    @let b = block();
    @switch (b.kind) {
      @case ('banner') {
        <div class="rounded-xl p-3" [style.background-color]="M.brand">
          <p class="text-[11px] font-extrabold leading-tight tracking-tight" [style.color]="M.onBrand">{{ b.title }}</p>
          @if (b.sub; as sub) {
            <p class="mt-0.5 text-[8px] font-medium" [style.color]="M.onBrand" style="opacity: 0.75">{{ sub }}</p>
          }
          @if (b.cta; as cta) {
            <span class="mt-2 inline-block rounded-full px-2.5 py-1 text-[8px] font-bold" [style.background-color]="M.onBrand" [style.color]="M.fg">
              {{ cta }}
            </span>
          }
        </div>
      }
      @case ('stats') {
        <div [class]="statsGridClass(b.items.length)">
          @for (s of b.items; track s.label) {
            <div class="rounded-lg p-2" [style.background-color]="M.surface">
              <p class="font-mono text-[6.5px] uppercase tracking-wider" [style.color]="M.dim">{{ s.label }}</p>
              <p class="mt-0.5 text-[12px] font-bold" [style.color]="M.fg">{{ s.value }}</p>
            </div>
          }
        </div>
      }
      @case ('row') {
        <div class="flex items-center gap-2 rounded-lg p-2" [style.background-color]="M.surface">
          <div class="size-6 shrink-0 rounded-md" [style.background-color]="rowIconTint"></div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[9px] font-bold" [style.color]="M.fg">{{ b.title }}</p>
            @if (b.sub; as sub) {
              <p class="truncate text-[7.5px]" [style.color]="M.mute">{{ sub }}</p>
            }
          </div>
          @if (b.chip; as chip) {
            <app-mock-chip [chip]="chip" />
          }
        </div>
      }
      @case ('score') {
        <div class="rounded-lg p-2.5" [style.background-color]="M.surface">
          @if (b.live) {
            <p class="mb-1.5 flex items-center gap-1 font-mono text-[7px] font-semibold uppercase tracking-wider" [style.color]="M.live">
              <span class="size-1 rounded-full" [style.background-color]="M.live" aria-hidden="true"></span>
              Ao vivo
            </p>
          }
          @for (team of scoreTeams(b); track team.idx) {
            <div class="flex items-center justify-between gap-2 py-1">
              <p class="truncate text-[9px] font-semibold" [style.color]="M.fg">{{ team.name }}</p>
              <div class="flex gap-1">
                @for (set of b.sets; track $index; let i = $index) {
                  <span
                    class="inline-flex size-5 items-center justify-center rounded font-mono text-[9px] font-bold"
                    [style.background-color]="setWinning(set, team.idx) ? scoreWinTint : M.surface2"
                    [style.color]="setWinning(set, team.idx) ? M.brand : M.mute"
                  >
                    {{ set[team.idx] }}
                  </span>
                }
              </div>
            </div>
          }
        </div>
      }
      @case ('button') {
        <div class="rounded-full py-2 text-center text-[9px] font-bold" [style.background-color]="M.brand" [style.color]="M.onBrand">
          {{ b.label }}
        </div>
      }
      @case ('field') {
        <div>
          <p class="mb-1 font-mono text-[6.5px] uppercase tracking-wider" [style.color]="M.dim">{{ b.label }}</p>
          <div
            class="rounded-lg border px-2 py-1.5 text-[8.5px]"
            [style.border-color]="M.line"
            [style.color]="b.value ? M.fg : M.dim"
            [style.background-color]="M.surface"
          >
            {{ b.value ?? '—' }}
          </div>
        </div>
      }
      @case ('bracket') {
        <app-mock-bracket />
      }
      @case ('calendar') {
        <div>
          @if (b.label; as label) {
            <p class="mb-1.5 font-mono text-[6.5px] uppercase tracking-wider" [style.color]="M.dim">{{ label }}</p>
          }
          <app-mock-calendar />
        </div>
      }
      @case ('search') {
        <div class="flex items-center gap-1.5 rounded-full px-2.5 py-1.5" [style.background-color]="M.surface">
          <svg viewBox="0 0 24 24" class="size-2.5" fill="none" [attr.stroke]="M.dim" stroke-width="3" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span class="text-[8px]" [style.color]="M.dim">{{ b.placeholder }}</span>
        </div>
      }
      @case ('tabs') {
        <div class="flex gap-1.5 overflow-hidden">
          @for (t of b.items; track t; let i = $index) {
            <span
              class="shrink-0 rounded-full px-2 py-1 text-[8px] font-semibold"
              [style.background-color]="i === (b.active ?? 0) ? M.brand : M.surface"
              [style.color]="i === (b.active ?? 0) ? M.onBrand : M.mute"
            >
              {{ t }}
            </span>
          }
        </div>
      }
      @case ('pix') {
        <app-mock-pix />
      }
      @case ('heading') {
        <p class="pt-1 font-mono text-[7px] font-semibold uppercase tracking-[0.18em]" [style.color]="M.dim">{{ b.label }}</p>
      }
    }
  `,
})
export class MockBlockView {
  readonly block = input.required<MockBlock>();
  readonly wide = input(false);

  protected readonly M = M;
  protected readonly rowIconTint = colorMix(M.brand, 18);
  protected readonly scoreWinTint = colorMix(M.brand, 22);

  protected statsGridClass(itemCount: number): string {
    const base = 'grid gap-1.5';
    if (this.wide()) return `${base} grid-cols-4`;
    return `${base} ${itemCount > 2 ? 'grid-cols-3' : 'grid-cols-2'}`;
  }

  protected scoreTeams(block: Extract<MockBlock, { kind: 'score' }>): { name: string; idx: 0 | 1 }[] {
    return [
      { name: block.teamA, idx: 0 },
      { name: block.teamB, idx: 1 },
    ];
  }

  protected setWinning(set: [string, string], idx: 0 | 1): boolean {
    const mine = Number(set[idx]);
    const other = Number(set[1 - idx]);
    return mine > other;
  }
}

/**
 * Corpo de uma tela mock: eyebrow + título + chips, os blocos (grade 2 colunas no modo "wide"
 * de painel web, empilhados no modo "phone") e a bottom nav do app (só no phone). Porta de
 * `MockBody` (ScreenFigure.tsx).
 */
@Component({
  selector: 'app-mock-body',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MockChipView, MockBlockView],
  host: { class: 'contents' },
  template: `
    <div class="flex h-full flex-col" [style.background-color]="M.bg">
      <div [class]="wide() ? 'flex-1 space-y-2 overflow-hidden p-4' : 'flex-1 space-y-2 overflow-hidden p-3 pt-4'">
        <div>
          @if (screen().eyebrow; as eyebrow) {
            <p class="font-mono text-[7px] font-semibold uppercase tracking-[0.18em]" [style.color]="M.brand">{{ eyebrow }}</p>
          }
          <p [class]="titleClasses()" [style.color]="M.fg">{{ screen().title }}</p>
          @if (screen().chips; as chips) {
            @if (chips.length > 0) {
              <div class="mt-1.5 flex flex-wrap gap-1">
                @for (c of chips; track c.label) {
                  <app-mock-chip [chip]="c" />
                }
              </div>
            }
          }
        </div>
        @if (wide()) {
          <div class="grid grid-cols-2 gap-2 [&>*:only-child]:col-span-2">
            @for (b of screen().blocks; track $index) {
              <div [class]="isFullSpan(b) ? 'col-span-2' : ''">
                <app-mock-block [block]="b" [wide]="true" />
              </div>
            }
          </div>
        } @else {
          @for (b of screen().blocks; track $index) {
            <app-mock-block [block]="b" [wide]="false" />
          }
        }
      </div>
      @if (screen().bottomNav; as bottomNav) {
        @if (!wide()) {
          <div class="mx-3 mb-3 flex items-center justify-between rounded-full px-3 py-1.5" [style.background-color]="M.surface">
            @for (item of navItems; track item) {
              <span class="text-[6px] font-semibold" [style.color]="item === bottomNav ? M.brand : M.dim">{{ item }}</span>
            }
          </div>
        }
      }
    </div>
  `,
})
export class MockBody {
  readonly screen = input.required<MockScreen>();
  readonly wide = input(false);

  protected readonly M = M;
  protected readonly navItems = NAV_ITEMS;

  protected titleClasses(): string {
    const base = 'font-bold leading-tight tracking-tight';
    return this.wide() ? `${base} text-[14px]` : `${base} text-[13px]`;
  }

  protected isFullSpan(block: MockBlock): boolean {
    return block.kind === 'bracket' || block.kind === 'stats' || block.kind === 'tabs' || block.kind === 'heading' || block.kind === 'search';
  }
}

/**
 * Figura de tela de uma feature: screenshot real (`kind: 'image'`) ou ilustração esquemática
 * (`kind: 'mock'`) dentro de moldura de celular ou navegador. Porta de `ScreenFigure.tsx`
 * (`PhoneShell`/`BrowserShell` viraram markup inline aqui — só usados uma vez cada, dentro
 * deste mesmo componente).
 */
@Component({
  selector: 'app-screen-figure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MockBody],
  host: { class: 'block' },
  template: `
    <figure class="w-full">
      @if (screen().kind === 'image') {
        <div class="mx-auto w-full max-w-[240px] rounded-[2.4rem] border p-[6px] shadow-elev-3" style="border-color: #26262b; background-color: #0c0c0e">
          <div class="overflow-hidden rounded-[2rem]">
            <img [src]="imageSrc()" [alt]="screen().alt" class="h-auto w-full" />
          </div>
        </div>
      } @else if (mockFrame() === 'phone') {
        <div class="mx-auto w-full max-w-[240px] rounded-[2.4rem] border p-[6px] shadow-elev-3" style="border-color: #26262b; background-color: #0c0c0e">
          <div class="overflow-hidden rounded-[2rem]">
            <div class="aspect-[9/17.5]" role="img" [attr.aria-label]="screen().alt">
              <app-mock-body [screen]="mockScreen()!" [wide]="false" />
            </div>
          </div>
        </div>
      } @else {
        <div class="w-full overflow-hidden rounded-3 border shadow-elev-2" style="border-color: #26262b; background-color: #0c0c0e">
          <div class="flex items-center gap-1.5 border-b px-3 py-2" [style.border-color]="M.line">
            @for (dot of ['a', 'b', 'c']; track dot) {
              <span class="size-2 rounded-full" style="background-color: #3a3a40" aria-hidden="true"></span>
            }
            <span class="ml-2 rounded-full px-2.5 py-0.5 font-mono text-[8px]" [style.background-color]="M.surface" [style.color]="M.dim">
              nexago.com.br
            </span>
          </div>
          <div role="img" [attr.aria-label]="screen().alt">
            <app-mock-body [screen]="mockScreen()!" [wide]="true" />
          </div>
        </div>
      }
      <figcaption class="mt-3 text-center font-mono text-[11px] uppercase tracking-wider text-text-dim">{{ label() }}</figcaption>
    </figure>
  `,
})
export class ScreenFigure {
  readonly screen = input.required<DocScreen>();
  readonly caption = input<string>();

  protected readonly M = M;

  protected readonly imageSrc = computed(() => {
    const s = this.screen();
    return s.kind === 'image' ? s.src : '';
  });

  protected readonly mockFrame = computed(() => {
    const s = this.screen();
    return s.kind === 'mock' ? s.frame : null;
  });

  protected readonly mockScreen = computed(() => {
    const s = this.screen();
    return s.kind === 'mock' ? s.screen : null;
  });

  protected readonly label = computed(
    () => this.caption() ?? (this.screen().kind === 'image' ? 'Tela real do app nexaGO' : 'Ilustração esquemática da tela'),
  );
}
