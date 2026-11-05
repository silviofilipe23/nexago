import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { SPORT_CATALOG } from '@nexago/sports';
import { callableErrorMessage } from '../../../data/callable-error';
import { FieldComponent } from '../../../ui/field.component';
import { IconComponent } from '../../../ui/icon.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import { normalizeSearch } from '../data/blog-list';
import { BLOG_PUSH_CITY_MAX, reachLabel, type BlogCategory, type BlogPushReach } from '../data/blog-post';
import { BlogPostsRepository } from '../data/blog-posts.repository';

export interface BlogPushChange {
  pushEnabled?: boolean;
  pushCity?: string;
  pushSport?: string;
}

type ReachState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; reach: BlogPushReach }
  | { state: 'error'; message: string };

const REACH_DEBOUNCE_MS = 500;
/** Valor do select de cidade que abre o campo para digitar outra. */
export const OTHER_CITY = '__other';

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada. */
function reachError(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found') && (!message || message === 'NOT FOUND')) {
    return 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

/**
 * "Notificação push" do card Onde aparece: liga/desliga, público (cidade e esporte) e o alcance
 * estimado pela callable `estimateBlogPushReach`. Depois do envio vira só o resumo.
 */
@Component({
  selector: 'bo-blog-push-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldComponent, IconComponent, ToggleComponent],
  template: `
    <div class="push" [class.on]="enabled() && !summary()">
      @if (summary(); as text) {
        <div class="row">
          <span><strong>Notificação push</strong><span class="dim sent">{{ text }}</span></span>
          <bo-icon class="bell" name="bell" [size]="16" />
        </div>
        <p class="note">Cada post envia o push uma vez só.</p>
      } @else {
        <div class="row">
          <span><strong>Notificação push</strong><span class="dim">Enviada no horário da publicação.</span></span>
          <bo-toggle ariaLabel="Notificação push" [checked]="enabled()" [disabled]="disabled()" (checkedChange)="changed.emit({ pushEnabled: $event })" />
        </div>
        @if (live()) {
          <p class="note">Este post já está no ar: ligar agora não envia. O push só sai quando o post passa a publicado.</p>
        }
        @if (enabled()) {
          <div class="audience">
            <bo-field label="Cidade">
              <select class="bo-select" [disabled]="disabled()" (change)="setCityChoice(value($event))">
                <option value="" [selected]="citySelectValue() === ''">Todas as cidades</option>
                @for (c of cityOptions(); track c.city) {
                  <option [value]="c.city" [selected]="citySelectValue() === c.city">{{ c.label }}</option>
                }
                <option [value]="otherCity" [selected]="citySelectValue() === otherCity">Outra cidade…</option>
              </select>
            </bo-field>
            <bo-field label="Esporte">
              <select class="bo-select" [disabled]="disabled()" (change)="changed.emit({ pushSport: value($event) })">
                <option value="all" [selected]="sport() === 'all'">Todos os esportes</option>
                @for (s of sports; track s.code) {
                  <option [value]="s.code" [selected]="sport() === s.code">{{ s.label }}</option>
                }
              </select>
            </bo-field>
          </div>
          @if (citySelectValue() === otherCity) {
            <bo-field label="Outra cidade" hint="Como o atleta escreveu no perfil; acento e caixa não importam.">
              <input
                class="bo-input"
                placeholder="Ex.: Anápolis"
                aria-label="Outra cidade"
                [attr.maxlength]="cityMax"
                [value]="city()"
                [disabled]="disabled()"
                (input)="changed.emit({ pushCity: value($event) })"
              />
            </bo-field>
          }
          <p class="reach" [class.bad]="reach().state === 'error'" aria-live="polite">{{ reachText() }}</p>
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .push { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); }
    .push.on { border-color: rgba(255, 106, 26, 0.3); background: rgba(255, 106, 26, 0.06); }
    .row { display: flex; align-items: center; gap: 12px; }
    .row > span { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .row strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .dim { font-size: 11.5px; color: var(--nx-text-dim); }
    .sent { color: var(--nx-win); }
    .bell { display: grid; color: var(--nx-win); }
    .note { margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--nx-text-mute); }
    .audience { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 480px) { .audience { grid-template-columns: 1fr; } }
    .reach { margin: 0; font-size: 12px; line-height: 1.45; color: var(--nx-text-mute); }
    .reach.bad { color: var(--nx-live); }
  `,
})
export class BlogPushSettingsComponent {
  private readonly repository = inject(BlogPostsRepository);

  readonly enabled = input.required<boolean>();
  /** Vazio = todas as cidades. */
  readonly city = input.required<string>();
  readonly sport = input.required<string>();
  readonly category = input.required<BlogCategory>();
  readonly disabled = input(false);
  /** Resumo do push já disparado (`pushSentLabel`); preenchido = só leitura. */
  readonly summary = input<string | null>(null);
  /** O post já está publicado: ligar agora não dispara. */
  readonly live = input(false);

  readonly changed = output<BlogPushChange>();

  protected readonly sports = SPORT_CATALOG;
  protected readonly otherCity = OTHER_CITY;
  protected readonly cityMax = BLOG_PUSH_CITY_MAX;

  protected readonly reach = signal<ReachState>({ state: 'idle' });
  /** Últimas cidades devolvidas pelo alcance (ficam durante o recálculo). */
  private readonly reachCities = signal<BlogPushReach['cities']>([]);
  /** "Outra cidade…" escolhida: o campo de texto manda até voltar ao select. */
  private readonly typingCity = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  /** O que o alcance precisa, em texto: o efeito só roda quando cidade, esporte ou categoria mudam. */
  private readonly query = computed(() => {
    if (!this.enabled() || this.summary()) {
      return null;
    }
    const city = this.city().replace(/\s+/g, ' ').trim() || null;
    return JSON.stringify({ city, sport: this.sport(), category: this.category() });
  });

  protected readonly cityOptions = computed(() => {
    const options = this.reachCities().map((c) => ({ city: c.city, label: `${c.city} · ${c.count}` }));
    const current = this.city().trim();
    if (current && !this.typingCity() && !options.some((o) => normalizeSearch(o.city) === normalizeSearch(current))) {
      options.unshift({ city: current, label: current });
    }
    return options;
  });

  protected readonly citySelectValue = computed(() => {
    if (this.typingCity()) {
      return OTHER_CITY;
    }
    const current = normalizeSearch(this.city());
    return current ? (this.cityOptions().find((o) => normalizeSearch(o.city) === current)?.city ?? OTHER_CITY) : '';
  });

  protected readonly reachText = computed(() => {
    const r = this.reach();
    switch (r.state) {
      case 'ok':
        return reachLabel(r.reach);
      case 'error':
        return `Não foi possível estimar o alcance. ${r.message}`;
      default:
        return 'Calculando alcance…';
    }
  });

  constructor() {
    effect(() => {
      const query = this.query();
      untracked(() => this.schedule(query));
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.timer !== null) {
        clearTimeout(this.timer);
      }
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected setCityChoice(value: string): void {
    this.typingCity.set(value === OTHER_CITY);
    this.changed.emit({ pushCity: value === OTHER_CITY ? '' : value });
  }

  /** Recalcula meio segundo depois da última troca de público ou categoria. */
  private schedule(query: string | null): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const seq = ++this.seq;
    if (query === null) {
      this.reach.set({ state: 'idle' });
      return;
    }
    this.reach.set({ state: 'loading' });
    this.timer = setTimeout(async () => {
      try {
        const reach = await this.repository.estimatePushReach(JSON.parse(query));
        if (seq === this.seq) {
          this.reach.set({ state: 'ok', reach });
          this.reachCities.set(reach.cities);
        }
      } catch (error) {
        if (seq === this.seq) {
          this.reach.set({ state: 'error', message: reachError(error) });
        }
      }
    }, REACH_DEBOUNCE_MS);
  }
}
