import { NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { PhoneFrame } from '../../../shared/ui/phone-frame';
import { ReplayAnimationDirective } from '../../../shared/replay-animation.directive';
import { DOWNLOAD_PATH } from '../../../../lib/store-links';
import { FIRST_SET, MATCH_BEATS, SETS_BEFORE, TEAMS, beatForProgress, pointLog, type Side } from './match-point-beats';

gsap.registerPlugin(ScrollTrigger);

/** Abas do app como aparecem no pé da tela (traços no estilo lucide); "Competir" é onde o jogo está. */
const APP_TABS = [
  { label: 'Início', icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z', active: false },
  { label: 'Agenda', icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', active: false },
  { label: 'Reservar', icon: 'M12 8v8M8 12h8M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z', active: false },
  { label: 'Competir', icon: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2-1.2.5-2 2-2 3.8M14 14.7V17c0 .6.5 1 1 1.2 1.2.5 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0V2Z', active: true },
  { label: 'Comunidade', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', active: false },
];

/** Quantas alturas de tela a cena fica presa — pouco mais de meia tela de rolagem por ponto. */
const PIN_VIEWPORTS = 3;

/**
 * Cena-assinatura da home: os últimos pontos de uma semifinal, jogados pela rolagem da página.
 * O placar de transmissão (esquerda) e a tela do app (direita) mostram o mesmo jogo; a cada
 * trecho rolado sai um ponto, até o match point virar vitória.
 *
 * A rolagem só escolhe o `beat` atual — o que aparece em cada um é template comum, guiado por
 * signal. Sem linha do tempo imperativa para manter em sincronia com o markup.
 * Com `prefers-reduced-motion` nada fica preso: a seção mostra direto o placar final.
 */
@Component({
  selector: 'app-match-point',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, PhoneFrame, ReplayAnimationDirective, RouterLink],
  host: { class: 'block' },
  templateUrl: './match-point.html',
  styleUrl: './match-point.scss',
})
export class MatchPoint {
  protected readonly beats = MATCH_BEATS;
  protected readonly teams = TEAMS;
  protected readonly sides: Side[] = ['us', 'them'];
  protected readonly firstSet = FIRST_SET;
  protected readonly tabs = APP_TABS;
  protected readonly downloadPath = DOWNLOAD_PATH;

  protected readonly beat = signal(0);
  protected readonly current = computed(() => MATCH_BEATS[this.beat()]);
  protected readonly won = computed(() => this.beat() === MATCH_BEATS.length - 1);
  protected readonly log = computed(() => pointLog(this.beat()));
  /** Um ponto para fechar o jogo: 20 ou mais, na frente, já com um set no bolso. */
  protected readonly matchPoint = computed(() => {
    const { us, them } = this.current();
    return !this.won() && us >= 20 && us > them;
  });

  protected setsFor(side: Side): number {
    return SETS_BEFORE[side] + (this.won() && side === 'us' ? 1 : 0);
  }

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly backdrop = viewChild.required<ElementRef<HTMLElement>>('backdrop');

  constructor() {
    afterNextRender(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.beat.set(MATCH_BEATS.length - 1);
        return;
      }
      this.pinScene();
    });
  }

  private pinScene(): void {
    const ctx = gsap.context(() => {
      const scrollTrigger: ScrollTrigger.Vars = {
        trigger: this.stage().nativeElement,
        start: 'top top',
        end: () => `+=${window.innerHeight * PIN_VIEWPORTS}`,
        scrub: true,
        invalidateOnRefresh: true,
      };

      ScrollTrigger.create({
        ...scrollTrigger,
        pin: true,
        anticipatePin: 1,
        onUpdate: (self) => this.goTo(beatForProgress(self.progress)),
      });
      gsap.to(this.backdrop().nativeElement, { scale: 1.14, ease: 'none', scrollTrigger });
    }, this.host.nativeElement);

    this.destroyRef.onDestroy(() => ctx.revert());
  }

  private goTo(next: number): void {
    const previous = this.beat();
    if (next === previous) return;
    this.beat.set(next);
    if (next === MATCH_BEATS.length - 1 && next > previous) this.celebrate();
  }

  /** Confete só na chegada à vitória (não ao rolar de volta), carregado sob demanda. */
  private celebrate(): void {
    import('canvas-confetti').then(({ default: confetti }) => {
      const wide = window.innerWidth >= 1024;
      confetti({
        particleCount: wide ? 110 : 70,
        spread: 75,
        startVelocity: 46,
        origin: { x: wide ? 0.3 : 0.5, y: 0.45 },
        colors: ['#ff6a1a', '#e6cfa4', '#f4f4f5'],
        disableForReducedMotion: true,
      });
    });
  }
}
