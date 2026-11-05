import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';

/** "Ana Maria Souza" → "AS"; "Bia" → "BI" (mesma regra das iniciais do app). */
export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = (s: string, n: number) => Array.from(s).slice(0, n).join('').toUpperCase();
  return parts.length === 1 ? first(parts[0], 2) : first(parts[0], 1) + first(parts[parts.length - 1], 1);
}

/** Foto do autor (`author.photoUrl`, https) ou, sem foto / se ela falhar, as iniciais. Decorativo. */
@Component({
  selector: 'app-blog-author-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-700 text-text-mute',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.38',
    'aria-hidden': 'true',
  },
  template: `
    @if (photoUrl() && !failed()) {
      <img [src]="photoUrl()" alt="" loading="lazy" (error)="failed.set(true)" class="absolute inset-0 size-full object-cover" />
    } @else {
      {{ initials() }}
    }
  `,
})
export class BlogAuthorAvatar {
  readonly name = input.required<string>();
  readonly photoUrl = input<string | null>(null);
  readonly size = input(40);

  protected readonly failed = linkedSignal({ source: this.photoUrl, computation: () => false });
  protected readonly initials = computed(() => authorInitials(this.name()));
}
