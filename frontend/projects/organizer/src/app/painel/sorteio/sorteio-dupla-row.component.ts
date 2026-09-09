import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OgAvatarComponent } from '../ui/avatar.component';
import type { DrawSessionEntrant } from '../data/draw-session.model';

/**
 * A linha de dupla do sorteio — o átomo que se repete nos potes, na fila e no
 * espelho do telão.
 *
 * Vem do protótipo: número (seed ou posição no grupo), os dois avatares
 * sobrepostos com anel para separá-los do fundo, o nome, e a legenda
 * `cidade · N pts`. Um componente só para as três superfícies do console
 * porque são literalmente a mesma linha — se divergirem, é bug, não variação.
 *
 * `empty` desenha a vaga que ainda não foi sorteada: é o traço pontilhado que
 * faz a tela comunicar "faltam duas" sem precisar de contador.
 */
@Component({
  selector: 'og-sorteio-dupla-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent],
  host: {
    class: 'og-dupla',
    '[class.og-dupla-hot]': 'tone() === "hot"',
    '[class.og-dupla-soft]': 'tone() === "soft"',
    '[class.og-dupla-empty]': 'empty()',
  },
  template: `
    @if (num(); as n) {
      <span class="og-dupla-num" [class.seed]="seedStyle()">{{ n }}</span>
    }

    @if (empty()) {
      <span class="og-dupla-ghost" aria-hidden="true"></span>
      <span class="og-dupla-bar" aria-hidden="true"></span>
    } @else if (entrant(); as e) {
      <span class="og-dupla-avatares">
        @for (initials of initialsPair(); track $index) {
          <og-avatar
            [initials]="initials"
            [photoUrl]="e.photoUrls[$index] ?? null"
            [size]="avatarSize()"
          />
        }
      </span>
      <span class="og-dupla-texto">
        <span class="og-dupla-nome">{{ e.label }}</span>
        @if (!compact() && caption()) {
          <span class="og-dupla-legenda">{{ caption() }}</span>
        }
      </span>
      <ng-content />
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 12px;
      border-radius: 12px;
      border: 1px solid transparent;
      min-width: 0;
    }
    :host(.og-dupla-soft) {
      background: var(--nx-surface-1);
      border-color: var(--nx-line);
    }
    :host(.og-dupla-hot) {
      background: var(--nx-orange-tint);
      border-color: rgb(255 106 26 / 40%);
    }
    :host(.og-dupla-empty) {
      border-style: dashed;
      border-color: var(--nx-line-strong);
      background: rgb(255 255 255 / 1.2%);
    }
    .og-dupla-num {
      flex: none;
      display: grid;
      place-items: center;
      min-width: 22px;
      height: 22px;
      padding: 0 5px;
      border-radius: 7px;
      background: var(--nx-surface-2);
      color: var(--nx-text-dim);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .og-dupla-num.seed {
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }
    .og-dupla-avatares {
      display: flex;
      flex: none;
    }
    /* O anel separa o segundo avatar do primeiro sem depender do fundo do card. */
    .og-dupla-avatares og-avatar + og-avatar {
      margin-left: -9px;
      border-radius: 50%;
      box-shadow: 0 0 0 2px var(--nx-surface-0);
    }
    .og-dupla-texto {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .og-dupla-nome {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-dupla-legenda {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      margin-top: 1px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-dupla-ghost {
      flex: none;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--nx-surface-1);
    }
    .og-dupla-bar {
      flex: 1;
      height: 9px;
      border-radius: 999px;
      background: var(--nx-surface-2);
    }
  `,
})
export class SorteioDuplaRowComponent {
  readonly entrant = input<DrawSessionEntrant | null>(null);
  /** Número à esquerda: seed na dupla eliminatória, posição no grupo. */
  readonly num = input<number | string | null>(null);
  /** Número em laranja — usado quando é seed/cabeça, não posição na lista. */
  readonly seedStyle = input(false);
  readonly tone = input<'plain' | 'soft' | 'hot'>('soft');
  /** Esconde a legenda; usado nas listas mais densas. */
  readonly compact = input(false);
  /** Vaga ainda não sorteada. */
  readonly empty = input(false);
  readonly avatarSize = input(30);

  protected readonly initialsPair = computed(() => {
    const e = this.entrant();
    if (!e) return [];
    const names = e.playerNames.length > 0 ? e.playerNames : e.label.split('/');
    // Sempre dois círculos: uma dupla com um avatar só fica visualmente torta
    // no meio de uma lista onde todas as outras têm dois.
    return [0, 1].map((i) => initialsOf(names[i] ?? ''));
  });

  protected readonly caption = computed(() => {
    const e = this.entrant();
    if (!e) return '';
    const points = e.points == null ? null : `${e.points} pts`;
    return [e.city, points].filter((part): part is string => !!part).join(' · ');
  });
}

function initialsOf(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return (first + last).toUpperCase() || '?';
}
