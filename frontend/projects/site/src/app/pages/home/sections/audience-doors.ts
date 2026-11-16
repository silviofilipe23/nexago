import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Door {
  question: string;
  answer: string;
  cta: string;
  href: string;
}

const DOORS: Door[] = [
  {
    question: 'Organiza torneios?',
    answer: 'Inscrições, pagamentos, chaves, horários por quadra e placar ao vivo saem do mesmo painel.',
    cta: 'Ver o painel do organizador',
    href: '/docs/organizadores',
  },
  {
    question: 'Tem uma arena?',
    answer: 'Agenda online, reservas pagas no Pix, aulas e torneios chegando até a sua quadra.',
    cta: 'Conhecer o nexaGO para arenas',
    href: '/arenas',
  },
];

/**
 * A home fala com o atleta; quem organiza torneio ou tem arena encontra aqui a porta para a
 * página que fala com ele. Duas perguntas lado a lado, separadas por linha — sem cartão.
 */
@Component({
  selector: 'app-audience-doors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'block' },
  template: `
    <section class="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-16" aria-label="Para organizadores e arenas">
      <div class="grid border-y border-line-strong md:grid-cols-2">
        @for (door of doors; track door.href; let first = $first) {
          <a
            [routerLink]="door.href"
            class="group block py-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand md:py-14"
            [class]="first ? 'border-b border-line-strong md:border-b-0 md:border-r md:pr-12' : 'md:pl-12'"
          >
            <h3 class="nx-title text-[clamp(1.9rem,3.8vw,3rem)] text-fg">{{ door.question }}</h3>
            <p class="mt-4 max-w-md text-pretty text-lg leading-relaxed text-text-mute">{{ door.answer }}</p>
            <span class="mt-6 inline-block font-600 text-fg underline decoration-brand decoration-2 underline-offset-[6px] transition-colors group-hover:text-brand">
              {{ door.cta }}
            </span>
          </a>
        }
      </div>
    </section>
  `,
})
export class AudienceDoors {
  protected readonly doors = DOORS;
}
