import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

/** Avatar circular — foto quando disponível (`photoUrl`), senão iniciais.
 *  Foto que falha ao carregar volta pras iniciais automaticamente. */
@Component({
  selector: 'og-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'og-avatar',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.34',
  },
  template: `
    @if (photoUrl() && !photoFailed()) {
      <img [src]="photoUrl()" alt="" (error)="photoFailed.set(true)" />
    } @else {
      {{ initials() }}
    }
  `,
  styles: `
    img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      display: block;
    }
  `,
})
export class OgAvatarComponent {
  readonly initials = input.required<string>();
  readonly size = input(34);
  readonly photoUrl = input<string | null>(null);

  protected readonly photoFailed = signal(false);
}
