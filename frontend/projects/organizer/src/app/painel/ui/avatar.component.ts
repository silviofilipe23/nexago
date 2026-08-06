import { booleanAttribute, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core';
import { PersonPhotoService } from './person-photo.service';

/** Avatar circular — foto quando disponível (`photoUrl`), senão iniciais.
 *  Foto que falha ao carregar volta pras iniciais automaticamente.
 *
 *  Com `zoomable`, o avatar QUE TEM FOTO vira botão e abre a foto ampliada no visualizador do
 *  painel (`og-person-photo`, montado uma vez no shell) — é como o organizador confere o rosto
 *  de quem está na frente dele. Sem foto não há o que ampliar, então o avatar continua sem
 *  interação nenhuma: nada de afordância falsa. Como o host ganha `role="button"`, não use
 *  `zoomable` dentro de outro <button>. */
@Component({
  selector: 'og-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'og-avatar',
    '[class.og-avatar-zoomable]': 'canZoom()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.34',
    '[attr.role]': 'canZoom() ? "button" : null',
    '[attr.tabindex]': 'canZoom() ? 0 : null',
    '[attr.aria-label]': 'canZoom() ? zoomLabel() : null',
    '(click)': 'openPhoto($event)',
    '(keydown.enter)': 'openPhoto($event)',
    '(keydown.space)': 'openPhoto($event)',
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
      /* O host é grid com place-items:center, então a trilha auto não dá altura definida e o
         height:100% cairia no aspecto intrínseco da foto (elipse vazando do círculo).
         aspect-ratio trava o quadrado a partir da largura. */
      aspect-ratio: 1;
      min-height: 0;
      border-radius: 50%;
      object-fit: cover;
      display: block;
    }
    :host(.og-avatar-zoomable) {
      cursor: zoom-in;
      transition:
        transform var(--nx-d-fast) var(--nx-ease-out),
        outline-color var(--nx-d-fast) var(--nx-ease-out);
      /* Anel por outline (e não box-shadow) porque as listagens já usam o box-shadow do avatar
         como separador dos avatares empilhados. */
      outline: 2px solid transparent;
      outline-offset: 1px;
    }
    :host(.og-avatar-zoomable:hover) {
      transform: scale(1.05);
      outline-color: var(--nx-orange-500);
    }
  `,
})
export class OgAvatarComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly photos = inject(PersonPhotoService);

  readonly initials = input.required<string>();
  readonly size = input(34);
  readonly photoUrl = input<string | null>(null);

  /** Abre a foto ampliada ao clicar. Só vale quando há foto. */
  readonly zoomable = input(false, { transform: booleanAttribute });
  /** Nome de quem está na foto — vira o título do visualizador e o rótulo acessível do botão. */
  readonly personName = input<string | null>(null);
  /** Papel mostrado como kicker do visualizador — "Gestor"/"Mesário" na equipe do torneio. */
  readonly personRole = input('Atleta');
  /** Contexto mostrado sob o nome no visualizador (categoria, dupla). */
  readonly meta = input<string | null>(null);

  protected readonly photoFailed = signal(false);

  protected readonly canZoom = computed(() => this.zoomable() && !!this.photoUrl() && !this.photoFailed());

  protected readonly zoomLabel = computed(() => {
    const name = this.personName()?.trim();
    return name ? `Ver foto de ${name}` : 'Ver foto ampliada';
  });

  protected openPhoto(event: Event): void {
    if (!this.canZoom()) return;
    // Espaço rolaria a página.
    event.preventDefault();
    const element = this.host.nativeElement as HTMLElement;
    const box = element.getBoundingClientRect();
    this.photos.open({
      photoUrl: this.photoUrl()!,
      role: this.personRole(),
      name: this.personName()?.trim() || this.personRole(),
      meta: this.meta(),
      origin: { cx: box.left + box.width / 2, cy: box.top + box.height / 2, size: box.width },
      returnFocusTo: element,
    });
  }
}
