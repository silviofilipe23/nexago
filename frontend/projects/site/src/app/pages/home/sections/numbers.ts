import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';

interface Indicator {
  /** Piso do indicador: a página mostra "valor+". */
  value: number;
  label: string;
}

/**
 * Números do nexaGO, informados pelo dono em 16/11/2026. São pisos ("mais de"), não contagem ao
 * vivo do Firestore: quando um deles mudar de faixa, é aqui que se atualiza.
 */
const INDICATORS: Indicator[] = [
  { value: 1000, label: 'atletas' },
  { value: 20, label: 'torneios' },
  { value: 5, label: 'arenas' },
];

/**
 * Seção de números da home: três indicadores no numeral de placar, separados por linhas de
 * quadra. Fica entre as cenas (que são encenadas, com dados fictícios) e as vitrines de torneios
 * e arenas reais — é a ponte entre "como funciona" e "já está acontecendo".
 *
 * Os numerais caem como placas de placar na primeira vez que a seção entra na tela. É estática:
 * não usa ScrollTrigger nem carrega dados, então pode ficar depois das cenas presas.
 */
@Component({
  selector: 'app-numbers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="mx-auto max-w-6xl px-5 pb-4 pt-20 sm:px-6 sm:pb-6 sm:pt-28" aria-labelledby="numbers-title">
      <h2 id="numbers-title" class="nx-title max-w-3xl text-[clamp(1.9rem,4.6vw,3.25rem)] text-fg">
        Já tem muita gente em quadra.
      </h2>

      <dl #board class="mt-10 grid border-y border-line-strong sm:mt-14 md:grid-cols-3" [class.is-seen]="seen()">
        @for (item of indicators; track item.label; let index = $index) {
          <div
            class="flex items-baseline gap-4 py-6 md:flex-col md:items-start md:gap-1 md:py-12"
            [class]="index > 0 ? 'border-t border-line-strong md:border-l md:border-t-0 md:pl-10' : ''"
          >
            <dt class="nx-title order-2 text-[clamp(1.25rem,2.4vw,1.75rem)] text-text-mute">{{ item.label }}</dt>
            <dd class="order-1 overflow-hidden">
              <span class="plate nx-score block text-[clamp(4.25rem,10.5vw,8rem)] text-fg" [style.animation-delay.ms]="index * 120">
                <span class="sr-only">mais de </span>{{ item.text }}<span class="text-brand" aria-hidden="true">+</span>
              </span>
            </dd>
          </div>
        }
      </dl>
    </section>
  `,
  styles: `
    /* O numeral espera acima da própria casa (o <dd> recorta) e cai quando a seção aparece. */
    .plate {
      transform: translateY(-105%);
    }

    .is-seen .plate {
      animation: drop 760ms cubic-bezier(0.19, 1, 0.22, 1) both;
    }

    @keyframes drop {
      from {
        transform: translateY(-105%);
      }
      to {
        transform: none;
      }
    }
  `,
})
export class NumbersSection {
  protected readonly indicators = INDICATORS.map((item) => ({ ...item, text: item.value.toLocaleString('pt-BR') }));
  protected readonly seen = signal(false);

  private readonly board = viewChild.required<ElementRef<HTMLElement>>('board');

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      // Sem animação (ou sem suporte ao observador), os números já nascem no lugar.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
        this.seen.set(true);
        return;
      }
      // O navegador pode entregar vários avisos de uma vez (o inicial, "fora da tela", junto com o
      // de entrada, se a página estava ocupada): olhar só o primeiro deixaria os números
      // escondidos para sempre. Basta um deles dizer que entrou.
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          this.seen.set(true);
          observer.disconnect();
        },
        { threshold: 0.35 },
      );
      observer.observe(this.board().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
