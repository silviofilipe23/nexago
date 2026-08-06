import { ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, viewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { PersonPhotoService, type PersonPhoto, type PersonPhotoOrigin } from './person-photo.service';
import { OgIconComponent } from './icon.component';

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const ENTER_MS = 260;
/** Saída mais curta que a entrada — fechar tem que responder na hora. */
const EXIT_MS = 150;
const ENTER: KeyframeAnimationOptions = { duration: ENTER_MS, easing: EASE };
const EXIT: KeyframeAnimationOptions = { duration: EXIT_MS, easing: EASE, fill: 'forwards' };

/** Transform que coloca o card exatamente sobre o avatar de origem (FLIP: anima daqui pro
 *  estado natural, sem mexer no layout). */
function transformFromOrigin(box: DOMRect, origin: PersonPhotoOrigin): string {
  const scale = origin.size / box.width;
  const dx = origin.cx - (box.left + box.width / 2);
  const dy = origin.cy - (box.top + box.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

/** Foto ampliada — o organizador clica no avatar da listagem pra conferir o rosto de quem está
 *  na frente dele: atleta nas inscrições, gestor/mesário na equipe do torneio. Fica montado uma
 *  única vez no shell e é dirigido pelo `PersonPhotoService`.
 *
 *  A foto aparece INTEIRA (`object-fit: contain`): o avatar já mostra o recorte circular, o que
 *  esta tela acrescenta é justamente o que o círculo cortou. */
@Component({
  selector: 'og-person-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgIconComponent],
  host: {
    '[class.open]': 'photo()',
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    @if (photo(); as p) {
      <div #scrim class="og-pp-scrim" (click)="close()"></div>
      <div #card class="og-pp-card" role="dialog" aria-modal="true" [attr.aria-label]="'Foto de ' + p.name">
        <figure class="og-pp-frame">
          <img [src]="p.photoUrl" [alt]="'Foto de ' + p.name" />
        </figure>
        <div class="og-pp-id">
          <span class="og-pp-kicker">{{ p.role }}</span>
          <p class="og-pp-name">{{ p.name }}</p>
          @if (p.meta) {
            <p class="og-pp-meta">{{ p.meta }}</p>
          }
        </div>
        <button #closeBtn type="button" class="og-pp-close" aria-label="Fechar foto" (click)="close()">
          <og-icon name="close" [size]="16" [strokeWidth]="2" />
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: none;
    }
    :host(.open) {
      position: fixed;
      inset: 0;
      z-index: 70;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .og-pp-scrim {
      position: absolute;
      inset: 0;
      background: rgba(5, 5, 5, 0.86);
      backdrop-filter: blur(8px);
    }
    .og-pp-card {
      position: relative;
      width: min(360px, 86vw);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
      overflow: hidden;
    }
    .og-pp-frame {
      position: relative;
      margin: 0;
      aspect-ratio: 4 / 5;
      max-height: 62vh;
      background: var(--nx-surface-1);
    }
    .og-pp-frame img {
      /* Absoluto porque height:100% não resolve quando a altura do quadro vem de
         aspect-ratio/max-height — a foto voltava ao aspecto intrínseco e invadia a faixa de
         identificação. */
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      /* Identificação pede a foto inteira: nada de corte. */
      object-fit: contain;
      display: block;
    }
    .og-pp-id {
      padding: 14px 18px 16px;
    }
    .og-pp-kicker {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .og-pp-name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 18px;
      line-height: 1.2;
      letter-spacing: -0.01em;
      color: var(--nx-text);
      margin: 6px 0 0;
    }
    .og-pp-meta {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.45;
      color: var(--nx-text-mute);
      margin: 5px 0 0;
    }
    .og-pp-close {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      padding: 0;
      border-radius: var(--nx-r-pill);
      border: 1px solid var(--nx-line-strong);
      background: rgba(5, 5, 5, 0.6);
      backdrop-filter: blur(6px);
      color: var(--nx-text);
      cursor: pointer;
      transition: background var(--nx-d-fast) var(--nx-ease-out);
    }
    .og-pp-close:hover {
      background: rgba(5, 5, 5, 0.88);
    }
  `,
})
export class OgPersonPhotoComponent {
  private readonly service = inject(PersonPhotoService);
  private readonly doc = inject(DOCUMENT);

  protected readonly photo = this.service.photo;

  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private readonly scrim = viewChild<ElementRef<HTMLElement>>('scrim');
  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');

  /** Abertura já animada — as queries de view resolvem depois do primeiro passe, então o efeito
   *  roda mais de uma vez pra mesma foto. */
  private entered: PersonPhoto | null = null;
  private exiting = false;

  constructor() {
    effect(() => {
      const photo = this.photo();
      const card = this.card()?.nativeElement;
      this.doc.body.style.overflow = photo ? 'hidden' : '';
      if (!photo || !card || this.entered === photo) return;
      this.entered = photo;
      this.closeBtn()?.nativeElement.focus();
      this.animateIn(card, photo.origin);
    });

    // Sair do painel com a foto aberta (logout, por exemplo) não pode deixar o body travado.
    inject(DestroyRef).onDestroy(() => {
      this.doc.body.style.overflow = '';
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.photo()) return;
    if (event.key === 'Escape') {
      this.close();
      return;
    }
    // O card tem um único controle focável, então prender o Tab nele já basta pra ser modal.
    if (event.key === 'Tab') {
      event.preventDefault();
      this.closeBtn()?.nativeElement.focus();
    }
  }

  protected close(): void {
    if (this.exiting) return;
    const photo = this.photo();
    if (!photo) return;
    const done = () => {
      this.exiting = false;
      this.entered = null;
      this.service.close();
      photo.returnFocusTo?.focus();
    };
    if (!this.animateOut(photo.origin)) {
      done();
      return;
    }
    this.exiting = true;
    // Timer, e não `animation.finished`: com os frames engasgados (aba em segundo plano) a
    // promise pode nunca resolver, e aí o visualizador ficaria preso aberto pra sempre.
    this.doc.defaultView?.setTimeout(done, EXIT_MS);
  }

  private animateIn(card: HTMLElement, origin: PersonPhotoOrigin | null): void {
    const scrim = this.scrim()?.nativeElement;
    if (this.reducedMotion() || !scrim) return;
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], ENTER);
    const from: Keyframe = origin
      ? { transform: transformFromOrigin(card.getBoundingClientRect(), origin), borderRadius: '50%', opacity: 0.4 }
      : { transform: 'scale(0.94)', opacity: 0 };
    card.animate([from, { transform: 'none', borderRadius: this.cardRadius(card), opacity: 1 }], ENTER);
  }

  /** `true` quando a saída está animando (e o fechamento tem que esperar por ela). */
  private animateOut(origin: PersonPhotoOrigin | null): boolean {
    const card = this.card()?.nativeElement;
    const scrim = this.scrim()?.nativeElement;
    if (this.reducedMotion() || !card || !scrim) return false;
    const to: Keyframe = origin
      ? { transform: transformFromOrigin(card.getBoundingClientRect(), origin), borderRadius: '50%', opacity: 0 }
      : { transform: 'scale(0.96)', opacity: 0 };
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], EXIT);
    card.animate([{ transform: 'none', borderRadius: this.cardRadius(card), opacity: 1 }, to], EXIT);
    return true;
  }

  /** Raio pelo token, e não por `getComputedStyle(card).borderRadius`: a animação de saída usa
   *  `fill: forwards`, então o estilo computado devolveria o 50% da própria animação. */
  private cardRadius(card: HTMLElement): string {
    return getComputedStyle(card).getPropertyValue('--nx-r-4').trim() || '18px';
  }

  /** A regra global de `prefers-reduced-motion` no styles.scss só alcança CSS — animação por
   *  Web Animations API precisa checar na mão. */
  private reducedMotion(): boolean {
    return this.doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
  }
}
