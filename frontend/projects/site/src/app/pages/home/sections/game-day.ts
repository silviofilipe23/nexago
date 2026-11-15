import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

type MomentId = 'manha' | 'galera' | 'torneio';

interface Moment {
  /** Também é o nome da foto em `public/img/home/`. */
  id: MomentId;
  time: string;
  title: string;
  text: string;
  alt: string;
}

/**
 * Um dia de jogo em três horários. A ordem é a do relógio (e a luz das fotos acompanha: manhã,
 * meio-dia, fim de tarde), por isso a lista é `<ol>` e o horário é o marcador.
 * Dois assuntos ficam de fora porque têm cena própria: a reserva de quadra (`BookingScene`, logo
 * acima; a agenda da manhã já mostra o horário reservado lá) e o que fica para o atleta depois do
 * jogo — histórico, nível, ranking — que é a `AthleteScene`, logo abaixo, fechando o dia.
 * Nomes de arena, atletas e torneio são fictícios.
 */
const MOMENTS: Moment[] = [
  {
    id: 'manha',
    time: '07:40',
    title: 'Acordou, já sabe o que tem hoje.',
    text: 'Treino, reserva e jogo de torneio ficam na mesma agenda, com horário e quadra. Nada de procurar no grupo que horas era.',
    alt: 'Quadra de areia vazia ao amanhecer, com a areia recém-rastelada.',
  },
  {
    id: 'galera',
    time: '12:30',
    title: 'Jogo marcado, galera avisada.',
    text: 'Convide quem vai jogar direto pela reserva. Cada um confirma no app e, no fim, o placar da pelada fica registrado para todo mundo.',
    alt: 'Quatro amigos chegando à quadra de areia, um deles com a bola de futevôlei.',
  },
  {
    id: 'torneio',
    time: '16:50',
    title: 'Torneio de verdade, do sorteio à final.',
    text: 'Inscrição e pagamento pelo app, chave montada, quadra e horário de cada jogo. Quem não pôde ir acompanha o placar ao vivo.',
    alt: 'Dupla disputando um ponto de padel em quadra azul, no fim da tarde.',
  },
];

@Component({
  selector: 'app-game-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage],
  host: { class: 'block' },
  templateUrl: './game-day.html',
})
export class GameDay {
  protected readonly moments = MOMENTS;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.setupDepth();
    });
  }

  /** Lado da foto alterna a cada horário no desktop; no celular é sempre foto em cima. */
  protected photoColumn(index: number): string {
    return index % 2 === 0 ? 'lg:col-span-7' : 'lg:col-span-7 lg:order-2';
  }

  protected textColumn(index: number): string {
    return index % 2 === 0 ? 'lg:col-span-5 lg:pl-4' : 'lg:col-span-5 lg:order-1 lg:pr-4';
  }

  protected cardSide(index: number): string {
    return index % 2 === 0 ? 'right-3 sm:-right-5' : 'left-3 sm:-left-5';
  }

  /** Profundidade na rolagem: a foto desliza dentro da moldura e o cartão do app anda um pouco
   *  mais rápido que ela — é o único movimento da seção, e é sempre resposta ao scroll. */
  private setupDepth(): void {
    const ctx = gsap.context(() => {
      for (const moment of gsap.utils.toArray<HTMLElement>('.moment')) {
        const scrollTrigger = { trigger: moment, start: 'top bottom', end: 'bottom top', scrub: true };
        gsap.fromTo(moment.querySelector('img'), { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger });
        gsap.fromTo(moment.querySelector('.app-card'), { y: 34 }, { y: -34, ease: 'none', scrollTrigger });
      }
    }, this.host.nativeElement);
    this.destroyRef.onDestroy(() => ctx.revert());
  }
}
