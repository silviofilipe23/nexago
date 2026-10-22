import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { centerGradient, initialsOf } from '../domain/models';

/** Quadradinho com gradiente + iniciais do centro (CtCenterAv). */
@Component({
  selector: 'ct-center-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [style.width.px]="size()" [style.height.px]="size()" [style.border-radius.px]="size() * 0.32" [style.font-size.px]="size() * 0.34" [style.background]="bg()">{{ ini() }}</span>`,
  styles: `
    :host { display: inline-flex; flex: none; }
    span { display: grid; place-items: center; font-family: var(--nx-font-display); font-weight: 800; color: #fff; }
  `,
})
export class CenterAvatarComponent {
  readonly id = input.required<string>();
  readonly name = input.required<string>();
  readonly size = input(28);
  protected readonly ini = computed(() => initialsOf(this.name()));
  protected readonly bg = computed(() => centerGradient(this.id()));
}
