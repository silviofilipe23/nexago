import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { initialsOf, textOnColor } from '../data/partner';

/**
 * Logo do parceiro como o app mostra: a imagem sobre a cor da marca ou, sem logo, as iniciais.
 * `inverse` (hero da prévia) põe fundo branco e as iniciais na cor da marca.
 */
@Component({
  selector: 'bo-partner-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="logo"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.border-radius.px]="size() * 0.28"
      [style.background]="inverse() ? '#FFFFFF' : color()"
      [style.color]="inverse() ? color() : ink()"
      [style.font-size.px]="size() * 0.31"
      [attr.aria-label]="'Logo de ' + name()"
      role="img"
    >
      @if (logoUrl(); as url) {
        <img [src]="url" alt="" loading="lazy" />
      } @else {
        {{ initials() }}
      }
    </span>
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
    .logo { display: inline-flex; align-items: center; justify-content: center; overflow: hidden; font-family: var(--nx-font-display); font-weight: 800; letter-spacing: -0.01em; box-sizing: border-box; }
    img { width: 100%; height: 100%; object-fit: contain; padding: 14%; box-sizing: border-box; }
  `,
})
export class PartnerLogoComponent {
  readonly name = input.required<string>();
  readonly color = input.required<string>();
  readonly logoUrl = input<string | null>(null);
  readonly size = input(40);
  readonly inverse = input(false);

  protected readonly initials = computed(() => initialsOf(this.name()));
  protected readonly ink = computed(() => textOnColor(this.color()));
}
