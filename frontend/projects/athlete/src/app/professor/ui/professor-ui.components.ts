import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import {
  PROFESSOR_TYPE_COPY,
  permissionGroupsFor,
  arenaInitials,
  professorStatusColor,
  professorStatusLabel,
  type ProfessorLinkStatus,
  type ProfessorLinkType,
  type ProfessorPermissions,
} from '../professor-links.model';

/** Peças visuais do protótipo `vc-atoms.jsx` (VcArenaMark, VcStatus, VcTipoTag, VcPermList,
 *  VcNote, VcTimeline), divididas pelas telas de professor. */

/** Logo da arena, ou a sigla sobre o degradê laranja → azul do protótipo. */
@Component({
  selector: 'app-pf-arena-mark',
  template: `
    @if (logoUrl() && !failed()) {
      <img [src]="logoUrl()" alt="" loading="lazy" decoding="async" (error)="failed.set(true)" />
    } @else {
      <span>{{ initials() }}</span>
    }
  `,
  styles: `
    :host {
      flex: none;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: linear-gradient(135deg, #ff8a4a 0%, #2260b8 100%);
      color: #fff;
      font-family: var(--nx-font-display);
      font-weight: 800;
      letter-spacing: -0.01em;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: var(--nx-surface-1);
    }
  `,
  host: {
    'aria-hidden': 'true',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.border-radius.px]': 'size() * 0.3',
    '[style.font-size.px]': 'size() * 0.26',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PfArenaMarkComponent {
  readonly name = input.required<string>();
  readonly logoUrl = input<string | null>(null);
  readonly size = input(44);
  protected readonly failed = signal(false);
  protected readonly initials = computed(() => arenaInitials(this.name()));
}

/** Ponto colorido + rótulo do estado na visão do professor. */
@Component({
  selector: 'app-pf-status',
  template: `<span class="dot" [style.background]="color()"></span>{{ label() }}`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
    }
    :host(.sm) {
      font-size: 10px;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex: none;
    }
  `,
  host: { '[style.color]': 'color()', '[class.sm]': 'small()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PfStatusComponent {
  readonly status = input.required<ProfessorLinkStatus>();
  readonly small = input(false);
  protected readonly label = computed(() => professorStatusLabel(this.status()));
  protected readonly color = computed(() => professorStatusColor(this.status()));
}

/** Etiqueta do tipo de vínculo (Equipe da arena / Independente). */
@Component({
  selector: 'app-pf-type-tag',
  template: `{{ copy().label }}`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      flex: none;
      height: 22px;
      padding: 0 8px;
      border-radius: 6px;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    :host(.sm) {
      height: 20px;
      font-size: 8.5px;
    }
  `,
  host: {
    '[style.color]': 'copy().color',
    '[style.background]': 'copy().background',
    '[class.sm]': 'small()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PfTypeTagComponent {
  readonly type = input.required<ProfessorLinkType>();
  readonly small = input(false);
  protected readonly copy = computed(() => PROFESSOR_TYPE_COPY[this.type()]);
}

/** Lista das permissões, ligadas (check verde) ou não (x apagado). As três de base sempre; o
 *  grupo "Aulas da arena" só para vínculo de equipe; o "Turma própria" só no independente (`type`). */
@Component({
  selector: 'app-pf-perm-list',
  template: `
    @for (g of groups(); track g.title) {
    @if (g.title) {
      <div class="group">
        <span class="group-title">{{ g.title }}</span>
        @if (g.note) {
          <span class="group-note">{{ g.note }}</span>
        }
      </div>
    }
    <ul>
      @for (p of g.rows; track p.key) {
        <li [class.on]="p.on">
          <span class="box" aria-hidden="true">
            @if (p.on) {
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11" /></svg>
            } @else {
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            }
          </span>
          <div class="copy">
            <span class="label">{{ p.label }}<span class="sr-only">{{ p.on ? ' — liberado' : ' — não liberado' }}</span></span>
            @if (!dense()) {
              <span class="desc">{{ p.description }}</span>
            }
          </div>
        </li>
      }
    </ul>
    }
  `,
  styles: `
    .group {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 8px;
      padding: 14px 0 4px;
      border-top: 1px solid var(--nx-line-strong);
    }
    .group-title {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .group-note {
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
    }
    li + li {
      border-top: 1px solid var(--nx-line);
    }
    :host(.dense) li {
      padding: 9px 0;
    }
    .box {
      width: 20px;
      height: 20px;
      flex: none;
      display: grid;
      place-items: center;
      border-radius: 6px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: rgba(244, 244, 245, 0.4);
    }
    li.on .box {
      background: rgba(43, 209, 126, 0.14);
      border-color: rgba(43, 209, 126, 0.4);
      color: #2bd17e;
    }
    .copy {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .label {
      font-family: var(--nx-font-display);
      font-size: 13px;
      font-weight: 600;
      color: var(--nx-text-dim);
    }
    li.on .label {
      color: var(--nx-text);
    }
    .desc {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      line-height: 1.4;
      color: var(--nx-text-dim);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `,
  host: { '[class.dense]': 'dense()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PfPermListComponent {
  readonly perms = input.required<ProfessorPermissions>();
  /** Tipo do vínculo: decide qual grupo restrito aparece ("Aulas da arena" ou "Turma própria"). */
  readonly type = input.required<ProfessorLinkType>();
  readonly dense = input(false);
  protected readonly groups = computed(() =>
    permissionGroupsFor(this.type()).map((g) => ({
      title: g.title,
      note: g.note,
      rows: g.items.map((p) => ({ ...p, on: this.perms()[p.key] === true })),
    })),
  );
}

export type PfNoteTone = 'dim' | 'blue' | 'red' | 'yellow';

const NOTE_COLOR: Record<PfNoteTone, string> = {
  dim: 'rgba(244,244,245,0.4)',
  blue: '#5B9BFF',
  red: '#FF3B30',
  yellow: '#F4C543',
};

/** Nota com o filete colorido à esquerda. */
@Component({
  selector: 'app-pf-note',
  template: `<span class="bar" [style.background]="color()"></span><span class="text"><ng-content /></span>`,
  styles: `
    :host {
      display: flex;
      gap: 10px;
      padding: 11px 13px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .bar {
      width: 3px;
      flex: none;
      border-radius: 2px;
    }
    .text {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PfNoteComponent {
  readonly tone = input<PfNoteTone>('dim');
  protected readonly color = computed(() => NOTE_COLOR[this.tone()]);
}

export interface PfTimelineItem {
  id: string;
  title: string;
  meta: string;
}

/** Linha do tempo do vínculo: o mais recente em laranja, no topo. */
@Component({
  selector: 'app-pf-timeline',
  template: `
    <ol>
      @for (item of items(); track item.id; let first = $first; let last = $last) {
        <li>
          <div class="rail" aria-hidden="true">
            <span class="dot" [class.dot--first]="first"></span>
            @if (!last) {
              <span class="line"></span>
            }
          </div>
          <div class="body">
            <div class="title">{{ item.title }}</div>
            <div class="meta">{{ item.meta }}</div>
          </div>
        </li>
      }
    </ol>
  `,
  styles: `
    ol {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
    }
    li {
      display: flex;
      gap: 12px;
    }
    .rail {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 12px;
      flex: none;
    }
    .dot {
      width: 10px;
      height: 10px;
      margin-top: 4px;
      flex: none;
      border-radius: 50%;
      background: var(--nx-surface-2);
      border: 2px solid var(--nx-line-strong);
    }
    .dot--first {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
    }
    .line {
      flex: 1;
      width: 1px;
      background: var(--nx-line-strong);
    }
    .body {
      flex: 1;
      min-width: 0;
      padding-bottom: 16px;
    }
    .title {
      font-family: var(--nx-font-display);
      font-size: 13px;
      font-weight: 600;
      color: var(--nx-text);
      overflow-wrap: anywhere;
    }
    .meta {
      margin-top: 3px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      overflow-wrap: anywhere;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PfTimelineComponent {
  readonly items = input.required<readonly PfTimelineItem[]>();
}

/** Foco inicial do diálogo: o primeiro seletor que existir, NA ORDEM DADA (um seletor com
 *  vírgula pegaria o primeiro na ordem do documento — o X do cabeçalho). */
export function focusFirst(root: HTMLElement, selectors: readonly string[]): void {
  for (const selector of selectors) {
    const el = root.querySelector<HTMLElement>(selector);
    if (el) {
      el.focus();
      return;
    }
  }
}

/** Tab preso no diálogo: no primeiro/último controle, volta pro outro extremo. */
export function trapDialogTab(event: Event, root: HTMLElement, backward: boolean): void {
  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex]'),
  ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1');
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (backward && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!backward && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
