import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { isFollowing, toggleFollow } from '../../../lib/follow-storage';

/**
 * Atalho local de "seguir" um torneio — grava só no `localStorage` do navegador, sem conta e
 * sem chamada de rede. Reaproveitado no botão da página do torneio; a seção "Torneios que
 * você acompanha" da home lê o mesmo `follow-storage.ts` pra hidratar a lista.
 */
@Component({
  selector: 'app-follow-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective],
  template: `
    <button
      type="button"
      nxButton="secondary"
      class="inline-flex items-center gap-2"
      [attr.aria-pressed]="following()"
      (click)="onToggle()"
    >
      <svg
        class="size-4"
        viewBox="0 0 24 24"
        [attr.fill]="following() ? 'currentColor' : 'none'"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      {{ following() ? 'Seguindo' : 'Seguir' }}
    </button>
  `,
})
export class FollowButtonComponent {
  readonly id = input.required<string>();

  protected readonly following = signal(false);

  constructor() {
    effect(() => {
      this.following.set(isFollowing(this.id()));
    });
  }

  protected onToggle(): void {
    this.following.set(toggleFollow(this.id()));
  }
}
