import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { brandTextTone, partnerInitials, type Partner } from './clube.logic';

/**
 * Logo do parceiro, ou as iniciais quando não há logo (ou ela não carrega).
 * - `brand`: iniciais sobre a cor da marca (cards da grade, cabeçalho do modal).
 * - `inverse`: iniciais na cor da marca sobre fundo neutro (banner e hero, que já são da cor da
 *   marca): claro, ou escuro quando a marca é clara.
 * A logo (PNG transparente) vai sempre sobre fundo claro: na cor da marca ela poderia sumir.
 */
@Component({
  selector: 'app-clube-partner-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-inverse]': 'variant() === "inverse" || showImage()',
    '[class.is-inverse-dark]': 'variant() === "inverse" && !showImage() && tone() === "dark"',
    '[class.is-dark-text]': 'variant() === "brand" && !showImage() && tone() === "dark"',
    '[style.--clube-brand]': 'partner().brandColor',
    '[style.--clube-logo-size]': 'size() + "px"',
    'aria-hidden': 'true',
  },
  template: `
    @if (showImage()) {
      <img [src]="partner().logoUrl" alt="" [width]="size()" [height]="size()" loading="lazy" (error)="failed.set(true)" />
    } @else {
      {{ initials() }}
    }
  `,
  styles: `
    :host {
      --clube-logo-size: 52px;
      width: var(--clube-logo-size);
      height: var(--clube-logo-size);
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: calc(var(--clube-logo-size) * 0.27);
      background: var(--clube-brand);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: calc(var(--clube-logo-size) * 0.29);
      letter-spacing: -0.01em;
    }
    :host(.is-dark-text) {
      color: var(--nx-text-on-orange);
    }
    :host(.is-inverse) {
      background: var(--nx-text);
      color: var(--clube-brand);
    }
    /* Marca clara (amarelo, branco): as iniciais na cor da marca somem no fundo claro. */
    :host(.is-inverse-dark) {
      background: var(--nx-text-on-orange);
    }
    img {
      width: 82%;
      height: 82%;
      object-fit: contain;
    }
  `,
})
export class ClubePartnerLogoComponent {
  readonly partner = input.required<Pick<Partner, 'name' | 'logoUrl' | 'brandColor'>>();
  readonly variant = input<'brand' | 'inverse'>('brand');
  readonly size = input(52);

  protected readonly failed = signal(false);
  protected readonly showImage = computed(() => !!this.partner().logoUrl && !this.failed());
  protected readonly initials = computed(() => partnerInitials(this.partner().name));
  protected readonly tone = computed(() => brandTextTone(this.partner().brandColor));
}
