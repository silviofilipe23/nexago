import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { SquadPhotosStore, safePhotoUrl } from '../../data/squad-photos';
import { avatarTone, initials } from '../data/commission';

/**
 * Avatar do atleta no Squad: a foto (passada direto ou do espelho público pelo uid) e, sem foto ou
 * se ela não carregar, o círculo com as iniciais num tom fixo por pessoa (o mesmo em todas as telas).
 */
@Component({
  selector: 'bo-ambassador-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="av" [class]="'av t' + tone()" [style.width.px]="size()" [style.height.px]="size()" aria-hidden="true">
    @if (src(); as s) {
      <img [src]="s" alt="" loading="lazy" referrerpolicy="no-referrer" (error)="failed.set(s)" />
    } @else {
      {{ letters() }}
    }
  </span>`,
  styles: `
    :host { display: inline-flex; flex: none; }
    .av { display: grid; place-items: center; overflow: hidden; border-radius: 50%; font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.02em; color: var(--nx-text); border: 1px solid rgba(255, 255, 255, 0.08); }
    .av img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .t0 { background: #4a2a24; }
    .t1 { background: #1f4044; }
    .t2 { background: #2e2a52; }
    .t3 { background: #45284a; }
    .t4 { background: #26421f; }
    .t5 { background: #4b3a1c; }
  `,
})
export class AmbassadorAvatarComponent {
  private readonly photos = inject(SquadPhotosStore);

  readonly id = input.required<string>();
  readonly name = input.required<string>();
  readonly size = input(30);
  /** Foto já conhecida (ex.: retrato da candidatura); sem ela, a do espelho público pelo `id`. */
  readonly photoUrl = input<string | null>(null);

  /** URL que falhou ao carregar: volta para as iniciais sem tentar de novo. */
  protected readonly failed = signal<string | null>(null);
  protected readonly tone = computed(() => avatarTone(this.id()));
  protected readonly letters = computed(() => initials(this.name()));
  protected readonly src = computed(() => {
    const url = safePhotoUrl(this.photoUrl()) ?? this.photos.photoOf(this.id());
    return url && url !== this.failed() ? url : null;
  });

  constructor() {
    this.photos.load();
  }
}
