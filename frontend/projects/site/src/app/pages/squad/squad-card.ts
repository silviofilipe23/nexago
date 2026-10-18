import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { sportLabel } from '../../../lib/format';
import { placeLabel, squadCodeLink, type SquadAmbassador } from '../../../lib/squad';
import { SquadCodeBox } from './squad-code-box';
import { SquadPhoto } from './squad-photo';
import { SquadTierBadge } from './squad-tier-badge';

interface Stat {
  label: string;
  value: string;
  /** O rótulo do Elo ("Desafiante III") é mais comprido que um número. */
  wide: boolean;
}

function statsOf(a: SquadAmbassador): Stat[] {
  const out: Stat[] = [];
  if (a.elo) out.push({ label: 'Elo', value: a.elo, wide: true });
  if (a.tournaments !== null) out.push({ label: 'Torneios', value: a.tournaments.toLocaleString('pt-BR'), wide: false });
  return out;
}

/** Card de embaixador da grade "Todos os embaixadores" — foto, nível, dados esportivos e código. */
@Component({
  selector: 'app-squad-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SquadCodeBox, SquadPhoto, SquadTierBadge],
  host: { class: 'block h-full' },
  template: `
    <article class="flex h-full flex-col overflow-hidden rounded-5 border border-line bg-surface-0">
      <div class="relative h-[190px] overflow-hidden bg-surface-2 sm:h-[240px]">
        <app-squad-photo [ambassador]="ambassador()" />
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-45% to-surface-0/95" aria-hidden="true"></div>
        <div class="absolute left-3 top-3"><app-squad-tier-badge [tier]="ambassador().tier" solid /></div>
        <div class="absolute inset-x-4 bottom-3.5">
          <h3 class="truncate font-display text-[19px] font-extrabold tracking-tight text-fg sm:text-[21px]">{{ ambassador().name }}</h3>
          @if (place(); as p) {
            <p class="mt-0.5 truncate text-xs text-text-mute">{{ p }}</p>
          }
        </div>
      </div>
      <div class="flex flex-1 flex-col gap-3 p-3.5 sm:p-4">
        @if (sport(); as s) {
          <p class="text-[13px] leading-snug text-text-mute">{{ s }}</p>
        }
        @if (stats().length > 0) {
          <dl class="flex gap-1.5">
            @for (st of stats(); track st.label) {
              <div class="min-w-0 rounded-3 bg-surface-2 px-2.5 py-2" [class]="st.wide ? 'flex-[1.6]' : 'flex-1'">
                <dt class="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-text-dim">{{ st.label }}</dt>
                <dd class="mt-0.5 truncate font-display text-[15px] font-bold text-fg">{{ st.value }}</dd>
              </div>
            }
          </dl>
        }
        <app-squad-code-box class="mt-auto" [code]="ambassador().code" />
      </div>
    </article>
  `,
})
export class SquadCard {
  readonly ambassador = input.required<SquadAmbassador>();

  protected readonly place = computed(() => placeLabel(this.ambassador()));
  protected readonly sport = computed(() => {
    const s = this.ambassador().sport;
    return s ? sportLabel(s) : null;
  });
  protected readonly stats = computed(() => statsOf(this.ambassador()));
}

/** Card horizontal da seção "Captains" — quem lidera turma; "Entrar na turma" usa o link do código. */
@Component({
  selector: 'app-squad-captain-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SquadPhoto, SquadTierBadge],
  host: { class: 'block h-full' },
  template: `
    <article class="flex h-full gap-4 rounded-5 border border-line bg-surface-0 p-4">
      <div class="h-[136px] w-[112px] shrink-0 overflow-hidden rounded-4 bg-surface-2">
        <app-squad-photo [ambassador]="ambassador()" textClass="text-3xl" />
      </div>
      <div class="flex min-w-0 flex-1 flex-col">
        <div><app-squad-tier-badge tier="cap" /></div>
        <h3 class="mt-2.5 truncate font-display text-lg font-extrabold tracking-tight text-fg">{{ ambassador().name }}</h3>
        @if (place(); as p) {
          <p class="mt-0.5 truncate text-[12.5px] text-text-dim">{{ p }}</p>
        }
        @if (detail(); as d) {
          <p class="mt-2 text-[13px] text-text-mute">{{ d }}</p>
        }
        <a
          [href]="link()"
          target="_blank"
          rel="noopener"
          class="mt-auto inline-flex items-center gap-1.5 self-start pt-2 font-display text-[13px] font-semibold text-brand transition-colors hover:text-brand-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:rounded-2"
        >
          Entrar na turma · {{ ambassador().code }}
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </a>
      </div>
    </article>
  `,
})
export class SquadCaptainCard {
  readonly ambassador = input.required<SquadAmbassador>();

  protected readonly place = computed(() => placeLabel(this.ambassador()));
  protected readonly link = computed(() => squadCodeLink(this.ambassador().code));
  /** "Beach tennis · Elite II · 12 torneios" — o que houver. */
  protected readonly detail = computed(() => {
    const a = this.ambassador();
    const parts = [a.sport ? sportLabel(a.sport) : null, a.elo, a.tournaments !== null ? `${a.tournaments} ${a.tournaments === 1 ? 'torneio' : 'torneios'}` : null];
    return parts.filter(Boolean).join(' · ');
  });
}
