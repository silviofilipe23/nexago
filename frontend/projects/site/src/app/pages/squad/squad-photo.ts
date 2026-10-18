import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { hueFor, initials, type SquadAmbassador } from '../../../lib/squad';

/**
 * Foto do embaixador preenchendo o contêiner do pai. Sem foto (ou foto que não carrega), as
 * iniciais sobre um fundo de matiz estável por pessoa — nunca um avatar genérico repetido.
 */
@Component({
  selector: 'app-squad-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block size-full' },
  template: `
    @if (src(); as url) {
      <img [src]="url" [alt]="alt()" loading="lazy" (error)="broken.set(true)" class="size-full object-cover" />
    } @else {
      <div
        class="flex size-full items-center justify-center font-display font-extrabold tracking-tight text-white/85"
        [class]="textClass()"
        [style.background]="fallbackBackground()"
        role="img"
        [attr.aria-label]="alt()"
      >
        {{ letters() }}
      </div>
    }
  `,
})
export class SquadPhoto {
  readonly ambassador = input.required<SquadAmbassador>();
  /** Tamanho das iniciais, proporcional ao contêiner. */
  readonly textClass = input('text-5xl');

  protected readonly broken = signal(false);
  protected readonly src = computed(() => (this.broken() ? null : this.ambassador().photoUrl));
  protected readonly alt = computed(() => `Foto de ${this.ambassador().name}`);
  protected readonly letters = computed(() => initials(this.ambassador().name));
  protected readonly fallbackBackground = computed(() => {
    const h = hueFor(this.ambassador().id);
    return `radial-gradient(120% 100% at 20% 0%, oklch(0.46 0.09 ${h}), oklch(0.24 0.05 ${h}))`;
  });
}
