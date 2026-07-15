import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Avatar circular por iniciais — usado onde ainda não há foto de perfil. */
@Component({
  selector: 'og-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'og-avatar',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.34',
  },
  template: `{{ initials() }}`,
})
export class OgAvatarComponent {
  readonly initials = input.required<string>();
  readonly size = input(34);
}
