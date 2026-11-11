import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, viewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { PersonPhotoService, type PersonPhoto, type PersonPhotoEntry, type PersonPhotoOrigin } from './person-photo.service';
import { IconComponent } from './icon.component';

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

/** Foto ampliada do atleta — clicar no avatar (`ar-avatar zoomable`) abre a foto inteira para o
 *  gestor conferir quem é o aluno. Montado uma única vez no shell e dirigido pelo
 *  `PersonPhotoService`; mesmo visualizador do portal do organizador.
 *
 *  A foto aparece INTEIRA (`object-fit: contain`): o avatar já mostra o recorte circular, o que
 *  esta tela acrescenta é justamente o que o círculo cortou. */
@Component({
  selector: 'ar-person-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    '[class.open]': 'photo()',
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    @if (photo(); as p) {
      <div #scrim class="ar-pp-scrim" (click)="close()"></div>
      @if (gallery().length > 1) {
        <button type="button" class="ar-pp-nav prev" aria-label="Foto anterior" (click)="step(-1)">
          <ar-icon name="chevron-left" [size]="18" [strokeWidth]="2" />
        </button>
        <button type="button" class="ar-pp-nav next" aria-label="Próxima foto" (click)="step(1)">
          <ar-icon name="chevron-right" [size]="18" [strokeWidth]="2" />
        </button>
        <div class="ar-pp-strip">
          <div class="ar-pp-thumbs">
            @for (g of gallery(); track g.photoUrl + g.name; let i = $index) {
              <button
                type="button"
                class="ar-pp-thumb"
                [class.on]="i === index()"
                [attr.aria-current]="i === index() ? 'true' : null"
                [attr.aria-label]="'Ver foto de ' + g.name"
                (click)="show(g)"
              >
                <img [src]="g.photoUrl" alt="" loading="lazy" decoding="async" />
              </button>
            }
          </div>
          <span class="ar-pp-count">{{ index() + 1 }} de {{ gallery().length }} · setas navegam · Esc fecha</span>
        </div>
      }
      <div #card class="ar-pp-card" role="dialog" aria-modal="true" [attr.aria-label]="'Foto de ' + p.name">
        <figure class="ar-pp-frame">
          <!-- Recria a <img> a cada troca de foto na galeria: a nova entra com fade, sem piscar a anterior. -->
          @for (url of [p.photoUrl]; track url) {
            <img [src]="url" [alt]="'Foto de ' + p.name" />
          }
        </figure>
        <div class="ar-pp-id">
          <span class="ar-pp-kicker">{{ p.role }}</span>
          <p class="ar-pp-name">{{ p.name }}</p>
          @if (p.meta) {
            <p class="ar-pp-meta">{{ p.meta }}</p>
          }
        </div>
        <button #closeBtn type="button" class="ar-pp-close" aria-label="Fechar foto" (click)="close()">
          <ar-icon name="x" [size]="16" [strokeWidth]="2" />
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
      /* Acima de modal e drawer do painel (1000): a foto pode ser aberta de dentro deles. */
      z-index: 1100;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .ar-pp-scrim {
      position: absolute;
      inset: 0;
      background: rgba(5, 5, 5, 0.86);
      backdrop-filter: blur(8px);
    }
    .ar-pp-card {
      position: relative;
      width: min(360px, 86vw);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
      overflow: hidden;
    }
    .ar-pp-frame {
      position: relative;
      margin: 0;
      aspect-ratio: 4 / 5;
      max-height: 62vh;
      background: var(--nx-surface-1);
    }
    .ar-pp-frame img {
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
    .ar-pp-id {
      padding: 14px 18px 16px;
    }
    .ar-pp-kicker {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .ar-pp-name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 18px;
      line-height: 1.2;
      letter-spacing: -0.01em;
      color: var(--nx-text);
      margin: 6px 0 0;
    }
    .ar-pp-meta {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.45;
      color: var(--nx-text-mute);
      margin: 5px 0 0;
    }
    .ar-pp-close {
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
    .ar-pp-close:hover {
      background: rgba(5, 5, 5, 0.88);
    }
    .ar-pp-frame img {
      animation: ar-pp-fade var(--nx-d-fast, 160ms) ease-out;
    }
    @keyframes ar-pp-fade {
      from {
        opacity: 0;
      }
    }
    .ar-pp-nav {
      position: absolute;
      top: 50%;
      z-index: 1;
      width: 48px;
      height: 48px;
      margin-top: -24px;
      display: grid;
      place-items: center;
      padding: 0;
      border-radius: var(--nx-r-pill);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      cursor: pointer;
      transition: background var(--nx-d-fast) var(--nx-ease-out);
    }
    .ar-pp-nav:hover {
      background: var(--nx-surface-2);
    }
    .ar-pp-nav.prev {
      left: max(16px, calc(50% - 260px));
    }
    .ar-pp-nav.next {
      right: max(16px, calc(50% - 260px));
    }
    .ar-pp-strip {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 20px;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .ar-pp-thumbs {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
      padding: 0 16px;
    }
    .ar-pp-thumb {
      width: 48px;
      height: 48px;
      padding: 0;
      border-radius: 50%;
      overflow: hidden;
      border: 2px solid var(--nx-line-strong);
      background: var(--nx-surface-2);
      cursor: pointer;
      opacity: 0.7;
      transition:
        opacity var(--nx-d-fast) var(--nx-ease-out),
        border-color var(--nx-d-fast) var(--nx-ease-out);
    }
    .ar-pp-thumb:hover,
    .ar-pp-thumb.on {
      opacity: 1;
    }
    .ar-pp-thumb.on {
      border-color: var(--nx-orange-500);
      box-shadow: 0 0 0 3px rgba(255, 106, 26, 0.3);
    }
    .ar-pp-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .ar-pp-count {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
  `,
})
export class PersonPhotoComponent {
  private readonly service = inject(PersonPhotoService);
  private readonly doc = inject(DOCUMENT);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly photo = this.service.photo;
  protected readonly index = this.service.index;
  protected readonly gallery = computed(() => this.photo()?.gallery ?? []);

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
    if (this.gallery().length > 1 && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      this.step(event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    // Modal: o Tab roda só entre os botões do visualizador (fechar, setas e miniaturas).
    if (event.key === 'Tab') {
      event.preventDefault();
      const buttons = Array.from(this.host.nativeElement.querySelectorAll<HTMLButtonElement>('button'));
      if (buttons.length === 0) return;
      const at = buttons.indexOf(this.doc.activeElement as HTMLButtonElement);
      const next = at < 0 ? 0 : (at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]!.focus();
    }
  }

  /** Troca de foto na galeria: sem a animação de abertura (o card já está na tela). */
  protected step(delta: number): void {
    this.service.step(delta);
    this.entered = this.photo();
  }

  protected show(entry: PersonPhotoEntry): void {
    this.service.show(entry);
    this.entered = this.photo();
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
