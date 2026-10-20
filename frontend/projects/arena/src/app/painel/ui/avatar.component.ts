import { booleanAttribute, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core';
import { initialsOf } from './initials';
import { PersonPhotoService } from './person-photo.service';

/** Avatar circular — foto quando há `photoUrl`, senão as iniciais do nome. Foto que falha ao
 *  carregar volta pras iniciais.
 *
 *  Com `zoomable`, o avatar QUE TEM FOTO vira botão e abre a foto ampliada no visualizador do
 *  painel (`ar-person-photo`, montado uma vez no shell). Sem foto não há o que ampliar, então o
 *  avatar segue sem interação: nada de afordância falsa. Como o host ganha `role="button"`, não
 *  use `zoomable` dentro de outro <button>. */
@Component({
  selector: 'ar-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ar-avatar',
    '[class.ar-avatar-zoomable]': 'canZoom()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.36',
    '[attr.role]': 'canZoom() ? "button" : null',
    '[attr.tabindex]': 'canZoom() ? 0 : null',
    '[attr.aria-label]': 'canZoom() ? "Ver foto de " + name() : null',
    '(click)': 'openPhoto($event)',
    '(keydown.enter)': 'openPhoto($event)',
    '(keydown.space)': 'openPhoto($event)',
  },
  template: `
    @if (photoUrl() && !photoFailed()) {
      <!-- Foto de perfil de 1024px num círculo de 30px: lazy + async para a lista não travar. -->
      <img [src]="photoUrl()" alt="" loading="lazy" decoding="async" (error)="photoFailed.set(true)" />
    } @else {
      {{ initials() }}
    }
  `,
  styles: `
    :host {
      flex: none;
      display: grid;
      place-items: center;
      border-radius: 50%;
      overflow: hidden;
      background: var(--nx-surface-2);
      font-family: var(--nx-font-display);
      font-weight: 700;
      color: var(--nx-text-mute);
    }
    img {
      width: 100%;
      height: 100%;
      /* O host é grid: sem altura definida o height:100% cairia no aspecto da foto. */
      aspect-ratio: 1;
      min-height: 0;
      border-radius: 50%;
      object-fit: cover;
      display: block;
    }
    :host(.ar-avatar-zoomable) {
      cursor: zoom-in;
      outline: 2px solid transparent;
      outline-offset: 1px;
      transition:
        transform var(--nx-d-fast) var(--nx-ease-out),
        outline-color var(--nx-d-fast) var(--nx-ease-out);
    }
    :host(.ar-avatar-zoomable:hover),
    :host(.ar-avatar-zoomable:focus-visible) {
      transform: scale(1.05);
      outline-color: var(--nx-orange-500);
    }
  `,
})
export class AvatarComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly photos = inject(PersonPhotoService);

  readonly name = input.required<string>();
  readonly size = input(30);
  readonly photoUrl = input<string | null>(null);
  /** Abre a foto ampliada ao clicar. Só vale quando há foto. */
  readonly zoomable = input(false, { transform: booleanAttribute });
  /** Kicker do visualizador. */
  readonly personRole = input('Atleta');
  /** Contexto sob o nome no visualizador. */
  readonly meta = input<string | null>(null);

  protected readonly photoFailed = signal(false);
  protected readonly initials = computed(() => initialsOf(this.name()));
  protected readonly canZoom = computed(() => this.zoomable() && !!this.photoUrl() && !this.photoFailed());

  protected openPhoto(event: Event): void {
    if (!this.canZoom()) return;
    // Espaço rolaria a página; a linha da lista pode ser clicável e não deve abrir junto.
    event.preventDefault();
    event.stopPropagation();
    const element = this.host.nativeElement as HTMLElement;
    const box = element.getBoundingClientRect();
    this.photos.open({
      photoUrl: this.photoUrl()!,
      role: this.personRole(),
      name: this.name().trim() || this.personRole(),
      meta: this.meta(),
      origin: { cx: box.left + box.width / 2, cy: box.top + box.height / 2, size: box.width },
      returnFocusTo: element,
    });
  }
}
