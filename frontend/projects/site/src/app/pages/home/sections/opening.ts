import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DownloadCta } from '../../../shared/ui/download-cta';
import { DownloadQr } from '../../../shared/ui/download-qr';

gsap.registerPlugin(ScrollTrigger);

/** "domingo, 15 de novembro" — a data de quem está lendo é o que torna o "hoje" do título literal. */
function todayLabel(): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
}

/**
 * Abertura da home: uma foto só, o título e o download. A foto é o ecossistema numa cena: a vista
 * aérea de um complexo esportivo ao anoitecer com tudo acontecendo ao mesmo tempo (final de torneio
 * com arquibancada, aula, padel, tênis, society, corrida, a galera no bar e quem está chegando).
 * Não há vídeo: o hero era um laço de vôlei de praia e foi trocado por esta imagem em 16/11/2026.
 * No celular entra um recorte vertical próprio, centrado na quadra do torneio.
 */
@Component({
  selector: 'app-opening',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, DownloadCta, DownloadQr],
  host: { class: 'block' },
  template: `
    <section class="nx-night relative isolate flex min-h-[calc(100svh-4.75rem)] flex-col justify-end overflow-hidden bg-black">
      <div #media class="absolute inset-0 -z-10 will-change-transform">
        <picture>
          <source media="(max-width: 767px)" srcset="img/home/ecossistema-m-720.webp" />
          <img
            ngSrc="ecossistema"
            ngSrcset="960w, 1920w"
            [loaderParams]="{ fallback: 1920 }"
            sizes="100vw"
            fill
            priority
            alt=""
            class="object-cover"
          />
        </picture>
      </div>
      <!-- Véus: o de baixo sustenta o texto, o de cima dá fundo ao menu. -->
      <div class="absolute inset-0 -z-10 bg-[linear-gradient(to_top,#000_0%,rgba(0,0,0,0.82)_22%,rgba(0,0,0,0.28)_55%,rgba(0,0,0,0.45)_100%)]" aria-hidden="true"></div>
      <div class="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(0,0,0,0.6)_0%,transparent_60%)]" aria-hidden="true"></div>
      <div class="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(0,0,0,0.75)_0%,rgba(0,0,0,0.55)_55%,transparent_85%)] md:hidden" aria-hidden="true"></div>

      <div #content class="mx-auto w-full max-w-6xl px-5 pb-9 pt-32 sm:px-6 sm:pb-12">
        <p class="rise flex items-center gap-2.5 text-[15px] font-500 text-sand [animation-delay:500ms] sm:text-base">
          <span class="size-2 rounded-full bg-brand" aria-hidden="true"></span>
          {{ today }}
        </p>

        <!-- Duas linhas no celular; uma só a partir de lg, para o jogo continuar à vista acima do título. -->
        <h1 class="nx-shout mt-3 text-[clamp(4rem,19.5vw,9.5rem)] text-fg lg:text-[clamp(6.5rem,10.4vw,9.2rem)]">
          <span class="line lg:mr-[0.2em]"><span class="line-in">Hoje tem</span></span>
          <span class="line"><span class="line-in [animation-delay:90ms]">jogo.</span></span>
        </h1>

        <div class="rule mt-6 h-px bg-fg/25 sm:mt-8" aria-hidden="true"></div>

        <div class="rise mt-6 flex flex-col gap-7 [animation-delay:650ms] lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <p class="max-w-[34rem] text-pretty text-[17px] leading-relaxed text-fg/85 sm:text-lg">
            Reserve a quadra, chame a galera, entre no torneio e veja seu ranking subir. Vôlei, futevôlei, beach
            tennis, tênis, padel e mais, num app só.
          </p>

          <div class="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8 lg:shrink-0">
            <div class="w-full sm:w-auto sm:shrink-0">
              <app-download-cta />
              <p class="mt-3 text-sm text-text-mute">Grátis para atletas. iPhone e Android.</p>
            </div>
            <app-download-qr class="hidden xl:block" />
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    /* Entrada única da página: as duas linhas do título sobem de trás de uma máscara, a linha de
       quadra se desenha e o resto aparece depois. Nada mais na home anima sozinho ao carregar. */
    .line {
      display: block;
      overflow: hidden;
      padding: 0.06em 0.12em 0.04em 0;
      margin: -0.06em 0 -0.04em;
    }

    @media (min-width: 1024px) {
      .line {
        display: inline-block;
        vertical-align: bottom;
      }
    }

    .line-in {
      display: block;
      animation: line-up 950ms cubic-bezier(0.19, 1, 0.22, 1) both;
    }

    .rise {
      animation: rise 800ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .rule {
      transform-origin: left;
      animation: draw 1100ms cubic-bezier(0.65, 0, 0.35, 1) 300ms both;
    }

    @keyframes line-up {
      from {
        transform: translateY(108%) skewY(4deg);
      }
      to {
        transform: none;
      }
    }

    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(18px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    @keyframes draw {
      from {
        transform: scaleX(0);
      }
      to {
        transform: scaleX(1);
      }
    }
  `,
})
export class Opening {
  protected readonly today = todayLabel();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly media = viewChild.required<ElementRef<HTMLElement>>('media');
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');

  constructor() {
    afterNextRender(() => {
      if (!this.reducedMotion) this.setupScrollOut();
    });
  }

  /** Ao rolar, a imagem afunda devagar e o texto some antes de sair — o complexo fica para trás. */
  private setupScrollOut(): void {
    const ctx = gsap.context(() => {
      const scrollTrigger = { trigger: this.host.nativeElement, start: 'top top', end: 'bottom top', scrub: true };
      gsap.to(this.media().nativeElement, { yPercent: 14, scale: 1.06, ease: 'none', scrollTrigger });
      gsap.to(this.content().nativeElement, { autoAlpha: 0, y: -48, ease: 'none', scrollTrigger });
    }, this.host.nativeElement);
    this.destroyRef.onDestroy(() => ctx.revert());
  }
}
