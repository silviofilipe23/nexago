import { ChangeDetectionStrategy, Component, computed, input, output, signal, type OnInit } from '@angular/core';
import { resolveSport, sportsWithSupport } from '@nexago/sports';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { FieldComponent } from '../../../ui/field.component';
import {
  BLOG_RANKING_GENDERS,
  BLOG_RANKING_MODES,
  RANKING_GENDER_LABELS,
  RANKING_MODE_LABELS,
  rankingSummary,
  type BlogRankingGender,
  type BlogRankingMode,
} from '../data/blog-post';

export interface RankingChoice {
  sport: string;
  mode: BlogRankingMode;
  gender: BlogRankingGender;
}

/**
 * Recorte do bloco Ranking: esporte, atletas ou equipes e gênero. O leitor mostra o top 5 da
 * temporada atual nesse recorte; o editor não busca os nomes.
 */
@Component({
  selector: 'bo-blog-ranking-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, FieldComponent],
  template: `
    <bo-confirm-dialog
      [open]="true"
      size="md"
      title="Ranking no post"
      description="Top 5 da temporada atual, com o botão para o ranking completo no app."
      [confirmLabel]="current() ? 'Trocar' : 'Inserir'"
      [confirmDisabled]="!sport()"
      (confirmed)="confirm()"
      (dismissed)="dismissed.emit()"
    >
      <bo-field label="Esporte">
        <select class="bo-select" aria-label="Esporte do ranking" (change)="sport.set(value($event))">
          <option value="" [selected]="!sport()" disabled>Escolha o esporte</option>
          @for (s of sports(); track s.code) {
            <option [value]="s.code" [selected]="sport() === s.code">{{ s.label }}</option>
          }
        </select>
      </bo-field>
      <div class="group">
        <span class="label">Quem aparece</span>
        <div class="chips" role="radiogroup" aria-label="Atletas ou equipes">
          @for (m of modes; track m) {
            <button type="button" role="radio" class="chip" [class.on]="mode() === m" [attr.aria-checked]="mode() === m" (click)="mode.set(m)">
              {{ modeLabels[m] }}
            </button>
          }
        </div>
      </div>
      <div class="group">
        <span class="label">Gênero</span>
        <div class="chips" role="radiogroup" aria-label="Gênero do ranking">
          @for (g of genders; track g) {
            <button type="button" role="radio" class="chip" [class.on]="gender() === g" [attr.aria-checked]="gender() === g" (click)="gender.set(g)">
              {{ genderLabels[g] }}
            </button>
          }
        </div>
      </div>
      @if (sport()) {
        <p class="summary">{{ summary() }}</p>
      }
    </bo-confirm-dialog>
  `,
  styles: `
    .group { display: flex; flex-direction: column; gap: 8px; }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { height: 32px; padding: 0 14px; border-radius: var(--nx-r-pill); border: 1px solid var(--nx-line-strong); background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .chip:hover { color: var(--nx-text); }
    .chip.on { border-color: rgba(255, 106, 26, 0.6); background: rgba(255, 106, 26, 0.12); color: var(--nx-text); }
    .chip:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .summary { margin: 0; padding: 10px 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text); }
  `,
})
export class BlogRankingPickerComponent implements OnInit {
  /** Recorte do bloco que está sendo trocado; `null` = bloco novo. */
  readonly current = input<RankingChoice | null>(null);
  readonly picked = output<RankingChoice>();
  readonly dismissed = output<void>();

  protected readonly modes = BLOG_RANKING_MODES;
  protected readonly genders = BLOG_RANKING_GENDERS;
  protected readonly modeLabels = RANKING_MODE_LABELS;
  protected readonly genderLabels = RANKING_GENDER_LABELS;

  protected readonly sport = signal('');
  protected readonly mode = signal<BlogRankingMode>('athletes');
  protected readonly gender = signal<BlogRankingGender>('all');

  /** Esportes com competição (os que têm ranking); o do bloco entra mesmo que não seja. */
  protected readonly sports = computed(() => {
    const list = sportsWithSupport('competition').map((s) => ({ code: s.code, label: s.label }));
    const cur = resolveSport(this.current()?.sport);
    return cur && !list.some((s) => s.code === cur.code) ? [...list, { code: cur.code, label: cur.label }] : list;
  });

  protected readonly summary = computed(() => rankingSummary({ sport: this.sport(), mode: this.mode(), gender: this.gender() }));

  ngOnInit(): void {
    const cur = this.current();
    if (cur) {
      this.sport.set(resolveSport(cur.sport)?.code ?? '');
      this.mode.set(cur.mode);
      this.gender.set(cur.gender);
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected confirm(): void {
    if (this.sport()) {
      this.picked.emit({ sport: this.sport(), mode: this.mode(), gender: this.gender() });
    }
  }
}
