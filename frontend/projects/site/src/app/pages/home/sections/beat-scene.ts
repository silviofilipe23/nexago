import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Mecânica comum das cenas "jogadas pela rolagem" da home (placar e reserva): um palco de uma
 * tela de altura fica preso enquanto a rolagem percorre os passos da história. A rolagem só
 * escolhe o passo; o que aparece em cada um é template do componente, guiado por signal.
 */

/** Qual passo está em cena para um progresso de rolagem de 0 a 1 — fatias iguais, a última
 *  (o desfecho) inclusive, para dar tempo de ler o resultado antes de a cena soltar. */
export function beatForProgress(progress: number, total: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return Math.min(total - 1, Math.floor(clamped * total));
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface BeatSceneOptions {
  /** Raiz do componente: delimita o `gsap.context`, e portanto o que o retorno desfaz. */
  host: HTMLElement;
  /** O palco que fica preso. */
  stage: HTMLElement;
  /** Foto de fundo, que aproxima devagar ao longo da cena. */
  backdrop: HTMLElement;
  /** Quantos passos a história tem. */
  beats: number;
  /** Quantas alturas de tela a cena fica presa — pouco mais de meia tela de rolagem por passo. */
  viewports: number;
  onBeat: (beat: number) => void;
}

/**
 * Prende o palco e traduz a rolagem em passos. Devolve a função que desfaz tudo (pin, espaçador
 * e animações), para o `DestroyRef` do componente.
 *
 * As cenas se criam na ordem em que aparecem na página (cada uma no seu `afterNextRender`); é
 * essa ordem que faz o ScrollTrigger somar o espaço da cena de cima antes de medir a de baixo.
 */
export function pinBeatScene(options: BeatSceneOptions): () => void {
  const ctx = gsap.context(() => {
    const scrollTrigger: ScrollTrigger.Vars = {
      trigger: options.stage,
      start: 'top top',
      end: () => `+=${window.innerHeight * options.viewports}`,
      scrub: true,
      invalidateOnRefresh: true,
    };

    ScrollTrigger.create({
      ...scrollTrigger,
      pin: true,
      anticipatePin: 1,
      onUpdate: (self) => options.onBeat(beatForProgress(self.progress, options.beats)),
    });
    gsap.to(options.backdrop, { scale: 1.14, ease: 'none', scrollTrigger });
  }, options.host);

  return () => ctx.revert();
}
