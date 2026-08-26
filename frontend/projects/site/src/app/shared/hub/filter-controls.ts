import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Controles de filtro compartilhados entre as listagens do hub (torneios, ligas…). */

@Component({
  selector: 'app-search-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div class="relative">
      <svg
        class="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-dim"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        [value]="value()"
        (input)="valueChange.emit($any($event.target).value)"
        [placeholder]="placeholder()"
        [attr.aria-label]="label()"
        class="h-11 w-full rounded-pill border border-line bg-surface-0 pl-11 pr-4 text-sm text-fg placeholder:text-text-dim focus-visible:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      />
    </div>
  `,
})
export class SearchInput {
  readonly value = input('');
  readonly placeholder = input('');
  readonly label = input('');
  readonly valueChange = output<string>();
}

@Component({
  selector: 'app-filter-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span class="font-mono text-xs font-600 uppercase tracking-wider text-text-dim sm:w-16 sm:shrink-0">
        {{ label() }}
      </span>
      <div class="flex flex-wrap gap-2">
        <ng-content />
      </div>
    </div>
  `,
})
export class FilterGroup {
  readonly label = input.required<string>();
}

@Component({
  selector: 'app-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <button
      type="button"
      (click)="pressed.emit()"
      [attr.aria-pressed]="active()"
      class="rounded-pill border px-4 py-2 text-sm font-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      [class]="active() ? 'border-brand/40 bg-brand-tint text-brand' : 'border-line bg-surface-0 text-text-mute hover:border-line-strong hover:text-fg'"
    >
      <ng-content />
    </button>
  `,
})
export class Chip {
  readonly active = input(false);
  readonly pressed = output<void>();
}
