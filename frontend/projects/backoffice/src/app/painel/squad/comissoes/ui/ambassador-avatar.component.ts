import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { avatarTone, initials } from '../data/commission';

/** Círculo com as iniciais do embaixador, num tom fixo por pessoa (o mesmo em todas as telas). */
@Component({
  selector: 'bo-ambassador-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="av" [class]="'av t' + tone()" [style.width.px]="size()" [style.height.px]="size()" aria-hidden="true">{{ letters() }}</span>`,
  styles: `
    :host { display: inline-flex; flex: none; }
    .av { display: grid; place-items: center; border-radius: 50%; font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.02em; color: var(--nx-text); border: 1px solid rgba(255, 255, 255, 0.08); }
    .t0 { background: #4a2a24; }
    .t1 { background: #1f4044; }
    .t2 { background: #2e2a52; }
    .t3 { background: #45284a; }
    .t4 { background: #26421f; }
    .t5 { background: #4b3a1c; }
  `,
})
export class AmbassadorAvatarComponent {
  readonly id = input.required<string>();
  readonly name = input.required<string>();
  readonly size = input(30);
  protected readonly tone = computed(() => avatarTone(this.id()));
  protected readonly letters = computed(() => initials(this.name()));
}
