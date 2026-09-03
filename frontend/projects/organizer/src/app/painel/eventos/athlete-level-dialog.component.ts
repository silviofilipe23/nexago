import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { LEVEL_OPTIONS, levelDisplayLabel, levelRankOf, type LevelOption } from '@nexago/levels';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent } from '../ui/icon.component';
import { initialsOf } from '../data/mock-data';

/** Atleta que o organizador escolheu promover, com os degraus que o backend aceita. */
export interface AthleteLevelTarget {
  uid: string;
  name: string;
  photoUrl: string | null;
  /** Nível atual no esporte do torneio — código canônico OU label legado (é o que
   *  `levelCodeFor` devolve); `null` quando o atleta ainda não declarou nada nesse esporte. */
  currentLevel: string | null;
  /** Degraus oferecidos, já filtrados por `promotableLevelOptions` — a regra de direção mora
   *  lá (e no backend), não aqui: este diálogo só desenha o que recebe. */
  options: readonly LevelOption[];
}

/**
 * Modal "Promover nível" da tela de Equipes da categoria.
 *
 * Substitui o `window.confirm()` que a ação usava: a escada inteira aparece com a descrição de
 * cada degrau (mesma do onboarding do atleta), o degrau atual fica marcado e travado junto com
 * todos os de baixo — é o desenho que explica "o nível só sobe" sem precisar de parágrafo — e
 * NADA vem pré-selecionado, porque o `<select>` anterior já nascia no primeiro degrau e um
 * clique desatento promovia.
 */
@Component({
  selector: 'og-athlete-level-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NxSpinnerComponent, OgAvatarComponent, OgIconComponent],
  host: {
    '(click)': 'dismiss()',
    '(document:keydown.escape)': 'dismiss()',
  },
  template: `
    <div
      #dialog
      class="og-dialog"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      [attr.aria-label]="'Promover nível de ' + target().name"
      (click)="$event.stopPropagation()"
    >
      <div class="og-dialog-title">Promover nível</div>

      <div class="lvl-who">
        <og-avatar [initials]="initials()" [photoUrl]="target().photoUrl" [size]="40" />
        <span class="lvl-who-copy">
          <span class="lvl-who-name">{{ target().name }}</span>
          <span class="lvl-who-meta">
            @if (currentLabel(); as current) {
              {{ sportLabel() }} · nível atual {{ current }}
            } @else {
              {{ sportLabel() }} · ainda sem nível declarado
            }
          </span>
        </span>
      </div>

      @if (!currentLabel()) {
        <p class="lvl-seed">
          Você está definindo o primeiro nível deste atleta neste esporte — a partir dele, o
          nível só sobe.
        </p>
      }

      <p class="lvl-legend" id="og-level-legend">Novo nível</p>
      <div class="lvl-ladder" role="radiogroup" aria-labelledby="og-level-legend">
        @for (step of ladder(); track step.code) {
          <label class="lvl-tile" [class.locked]="!step.selectable" [class.current]="step.current">
            <input
              type="radio"
              name="og-athlete-level"
              class="lvl-radio"
              [value]="step.code"
              [checked]="selected() === step.code"
              [disabled]="!step.selectable || busy()"
              (change)="selected.set(step.code)"
            />
            <span class="lvl-copy">
              <span class="lvl-label">
                {{ step.label }}
                @if (step.current) {
                  <span class="lvl-tag">Atual</span>
                }
              </span>
              <span class="lvl-desc">{{ step.description }}</span>
            </span>
            <og-icon class="lvl-check" name="check" [size]="14" />
          </label>
        }
      </div>

      <p class="og-dialog-text">
        O nível só sobe: depois de aplicar, nem você nem o atleta conseguem desfazer. Vale na
        hora para decidir em quais categorias ele pode se inscrever.
      </p>

      @if (error(); as msg) {
        <p class="og-dialog-error">{{ msg }}</p>
      }

      <div class="og-dialog-actions">
        <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="dismiss()">Cancelar</button>
        <button
          type="button"
          class="og-mini-btn og-mini-btn-primary"
          [disabled]="busy() || !selected()"
          (click)="confirm()"
        >
          @if (busy()) {
            <app-nx-spinner [size]="12" tone="dark" />
          }
          {{ confirmLabel() }}
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(7, 7, 8, 0.66);
      backdrop-filter: blur(4px);
    }
    .og-dialog {
      display: flex;
      flex-direction: column;
      width: min(440px, 100%);
      max-height: calc(100vh - 40px);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 22px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
    }
    .og-dialog:focus {
      outline: none;
    }
    .og-dialog-title {
      font-family: var(--nx-font-display);
      font-size: 17px;
      font-weight: 800;
      color: var(--nx-text);
      flex: none;
    }
    .og-dialog-text {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
      margin: 14px 0 0;
      flex: none;
    }
    .og-dialog-error {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
      margin: 10px 0 0;
      flex: none;
    }
    .og-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 18px;
      flex: none;
    }
    .lvl-who {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 14px;
      flex: none;
    }
    .lvl-who-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .lvl-who-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lvl-who-meta {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .lvl-seed {
      margin: 12px 0 0;
      padding: 9px 11px;
      border-radius: var(--nx-r-2);
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.2);
      font-family: var(--nx-font-ui);
      font-size: 12px;
      line-height: 1.45;
      color: var(--nx-text-mute);
      flex: none;
    }
    /* A escada inteira não cabe num notebook baixo; ela é a única parte que rola, pra que o
       título e os botões nunca saiam de vista. */
    .lvl-ladder {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 0;
      overflow-y: auto;
    }
    .lvl-legend {
      flex: none;
      margin: 14px 0 8px;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .lvl-tile {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      cursor: pointer;
      transition: all 140ms var(--nx-ease-out);
    }
    .lvl-tile:hover:not(.locked) {
      border-color: var(--nx-line-strong);
      background: var(--nx-surface-2);
    }
    /* O anel de foco vive no tile, não no radio — o input em si é invisível. */
    .lvl-tile:focus-within {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }
    .lvl-tile:has(.lvl-radio:checked) {
      border-color: var(--nx-orange-500);
      background: var(--nx-orange-tint);
    }
    .lvl-tile.locked {
      cursor: default;
      opacity: 0.45;
    }
    .lvl-tile.locked:focus-within {
      outline: none;
    }
    /* O degrau atual está travado como os de baixo, mas não é uma opção morta: é a informação
       de onde o atleta está hoje. Some no apagado dos travados, então volta a ficar legível —
       borda tracejada e nenhum realce de clique dizem que continua fora de escolha. */
    .lvl-tile.current {
      opacity: 1;
      background: var(--nx-surface-0);
      border-style: dashed;
    }
    .lvl-tile.current .lvl-label {
      color: var(--nx-text-mute);
    }
    .lvl-tile.current .lvl-tag {
      color: var(--nx-orange-500);
      border-color: rgba(255, 106, 26, 0.4);
    }
    .lvl-radio {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }
    .lvl-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .lvl-label {
      display: flex;
      align-items: center;
      gap: 7px;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .lvl-tag {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-1);
      padding: 1px 5px;
    }
    .lvl-desc {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      line-height: 1.4;
      color: var(--nx-text-dim);
    }
    .lvl-check {
      flex: none;
      color: var(--nx-orange-500);
      opacity: 0;
    }
    .lvl-tile:has(.lvl-radio:checked) .lvl-check {
      opacity: 1;
    }
  `,
})
export class OgAthleteLevelDialogComponent {
  readonly target = input.required<AthleteLevelTarget>();
  /** Esporte do torneio, em PT — o nível é por esporte, e o organizador precisa ler qual. */
  readonly sportLabel = input('');
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  protected readonly selected = signal<string | null>(null);

  constructor() {
    // Teclado entra no diálogo, e não continua no fundo: o Escape do host só chega aqui com o
    // foco dentro. O componente é criado a cada abertura (`@if` no pai), então isso roda uma vez.
    afterNextRender(() => this.dialog()?.nativeElement.focus());
  }

  protected readonly initials = computed(() => initialsOf(this.target().name));

  /** Label do nível atual; `''` quando o atleta ainda não declarou nada nesse esporte. */
  protected readonly currentLabel = computed(() => levelDisplayLabel(this.target().currentLevel));

  /** Escada inteira, e não só os degraus promovíveis: ver o atual marcado e os de baixo
   *  travados é o que comunica a regra "só sobe". Quem decide o que é selecionável continua
   *  sendo `promotableLevelOptions` (via `target().options`) — aqui não há regra de direção. */
  protected readonly ladder = computed(() => {
    const target = this.target();
    const selectable = new Set(target.options.map((option) => option.code));
    // Comparação por rank, não por código: o nível atual pode vir como label legado
    // ("Intermediário"), que `levelRankOf` alia pro degrau de baixo do split.
    const currentRank = levelRankOf(target.currentLevel);
    return LEVEL_OPTIONS.map((option) => ({
      ...option,
      selectable: selectable.has(option.code),
      current: currentRank != null && levelRankOf(option.code) === currentRank,
    }));
  });

  protected readonly confirmLabel = computed(() => {
    if (this.busy()) return 'Promovendo…';
    const code = this.selected();
    const label = LEVEL_OPTIONS.find((option) => option.code === code)?.label;
    return label ? 'Promover para ' + label : 'Escolha o nível';
  });

  /** Fechar no meio da chamada deixaria o organizador sem saber se promoveu. */
  protected dismiss(): void {
    if (this.busy()) return;
    this.cancelled.emit();
  }

  protected confirm(): void {
    const code = this.selected();
    if (!code || this.busy()) return;
    this.confirmed.emit(code);
  }
}
