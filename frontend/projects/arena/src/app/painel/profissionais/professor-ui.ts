import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ToggleComponent } from '../ui/toggle.component';
import {
  PROFESSOR_PERMISSION_META,
  PROFESSOR_STATUS_META,
  PROFESSOR_TYPE_META,
  type ProfessorLinkStatus,
  type ProfessorLinkType,
  type ProfessorPermissionKey,
  type ProfessorPermissions,
} from './arena-professor.model';

/** Tag do tipo de vínculo (protótipo `VcTipoTag`). */
@Component({
  selector: 'ar-prof-type-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tag" [class.sm]="sm()" [style.color]="meta().color" [style.background]="meta().bg">{{ meta().label }}</span>`,
  styles: `
    .tag {
      display: inline-flex;
      align-items: center;
      height: 22px;
      padding: 0 8px;
      border-radius: 6px;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      white-space: nowrap;
      flex: none;
    }
    .tag.sm { height: 20px; font-size: 8.5px; }
  `,
})
export class ProfessorTypeTagComponent {
  readonly type = input.required<ProfessorLinkType>();
  readonly sm = input(false);
  protected readonly meta = computed(() => PROFESSOR_TYPE_META[this.type()]);
}

/** Status com bolinha (protótipo `VcStatus`), rótulos do lado da arena. */
@Component({
  selector: 'ar-prof-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="status" [class.sm]="sm()" [style.color]="meta().color">
      <span class="dot" [style.background]="meta().color"></span>{{ meta().label }}
    </span>
  `,
  styles: `
    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
    }
    .status.sm { font-size: 10px; }
    .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
  `,
})
export class ProfessorStatusComponent {
  readonly status = input.required<ProfessorLinkStatus>();
  readonly sm = input(false);
  protected readonly meta = computed(() => PROFESSOR_STATUS_META[this.status()]);
}

export interface PermissionChange {
  key: ProfessorPermissionKey;
  value: boolean;
}

/** Lista das três permissões (protótipo `VcPermList`): com toggles quando editável, com
 *  marcação ✓/✕ quando só leitura. */
@Component({
  selector: 'ar-prof-perm-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToggleComponent],
  template: `
    @for (p of items; track p.key) {
      <div class="row" [class.dense]="dense()">
        @if (!editable()) {
          <span class="mark" [class.on]="permissions()[p.key]" aria-hidden="true">{{ permissions()[p.key] ? '✓' : '✕' }}</span>
        }
        <div class="text">
          <div class="title" [class.off]="!editable() && !permissions()[p.key]">{{ p.title }}</div>
          @if (!dense()) {
            <div class="sub">{{ p.sub }}</div>
          }
        </div>
        @if (editable()) {
          <ar-toggle
            [label]="p.title"
            [checked]="permissions()[p.key]"
            [disabled]="disabled() || busyKey() === p.key"
            (changed)="changed.emit({ key: p.key, value: $event })"
          />
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .row { display: flex; align-items: center; gap: 12px; padding: 12px 0; }
    .row.dense { padding: 9px 0; }
    .row + .row { border-top: 1px solid var(--nx-line); }
    .text { flex: 1; min-width: 0; }
    .title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .title.off { color: var(--nx-text-dim); }
    .sub { font-size: 11.5px; color: var(--nx-text-dim); margin-top: 2px; }
    .mark {
      width: 20px; height: 20px; border-radius: 6px; flex: none; display: grid; place-items: center;
      background: var(--nx-surface-1); border: 1px solid var(--nx-line);
      font-size: 11px; font-weight: 700; color: rgba(244, 244, 245, 0.4);
    }
    .mark.on { background: rgba(43, 209, 126, 0.14); border-color: rgba(43, 209, 126, 0.4); color: var(--nx-win); }
  `,
})
export class ProfessorPermListComponent {
  readonly permissions = input.required<ProfessorPermissions>();
  readonly editable = input(false);
  readonly dense = input(false);
  readonly disabled = input(false);
  /** Toggle com gravação em andamento — fica travado até o servidor responder. */
  readonly busyKey = input<ProfessorPermissionKey | null>(null);
  readonly changed = output<PermissionChange>();

  protected readonly items = PROFESSOR_PERMISSION_META;
}

/** Nota com filete colorido à esquerda (protótipo `VcNote`). */
@Component({
  selector: 'ar-prof-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="note">
      <span class="bar" [class]="'bar tone-' + tone()"></span>
      <span class="text"><ng-content /></span>
    </div>
  `,
  styles: `
    :host { display: block; }
    .note {
      display: flex; gap: 10px; padding: 11px 13px; border-radius: var(--nx-r-3);
      background: var(--nx-surface-1); border: 1px solid var(--nx-line);
    }
    .bar { width: 3px; border-radius: 2px; flex: none; background: rgba(244, 244, 245, 0.4); }
    .bar.tone-blue { background: #5B9BFF; }
    .bar.tone-red { background: var(--nx-live); }
    .bar.tone-yellow { background: var(--nx-pending); }
    .text { font-size: 12px; color: var(--nx-text-mute); line-height: 1.5; }
  `,
})
export class ProfessorNoteComponent {
  readonly tone = input<'dim' | 'blue' | 'red' | 'yellow'>('dim');
}

export interface TimelineItem {
  id: string;
  title: string;
  meta: string;
}

/** Linha do tempo do histórico (protótipo `VcTimeline`): o primeiro (mais recente) em laranja. */
@Component({
  selector: 'ar-prof-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (item of items(); track item.id; let i = $index; let last = $last) {
      <div class="item">
        <div class="rail">
          <span class="dot" [class.first]="i === 0"></span>
          @if (!last) {
            <span class="line"></span>
          }
        </div>
        <div class="body">
          <div class="title">{{ item.title }}</div>
          <div class="meta">{{ item.meta }}</div>
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; }
    .item { display: flex; gap: 12px; }
    .rail { display: flex; flex-direction: column; align-items: center; width: 12px; flex: none; }
    .dot {
      width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex: none;
      background: var(--nx-surface-2); border: 2px solid var(--nx-line-strong);
    }
    .dot.first { background: var(--nx-orange-500); border-color: var(--nx-orange-500); }
    .line { flex: 1; width: 1px; background: var(--nx-line-strong); }
    .body { padding-bottom: 16px; flex: 1; min-width: 0; }
    .title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); overflow-wrap: anywhere; }
    .meta { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); margin-top: 3px; }
  `,
})
export class ProfessorTimelineComponent {
  readonly items = input.required<readonly TimelineItem[]>();
}

/** Cartão de escolha do tipo de vínculo (protótipo `VcRadioCard`). Sem `selectable` é só
 *  ilustrativo (estado vazio). */
@Component({
  selector: 'ar-prof-radio-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.on]': 'on()',
    '[class.compact]': 'compact()',
    '[class.selectable]': 'selectable()',
    '[attr.role]': 'selectable() ? "radio" : null',
    '[attr.aria-checked]': 'selectable() ? on() : null',
    '[attr.tabindex]': 'selectable() ? 0 : null',
    '(click)': 'pick()',
    '(keydown.enter)': 'pick()',
    '(keydown.space)': 'pick($event)',
  },
  template: `
    @if (selectable()) {
      <span class="radio" aria-hidden="true"><span class="fill"></span></span>
    }
    <span class="text">
      <span class="title">{{ meta().label }}</span>
      <span class="sub">{{ meta().sub }}</span>
    </span>
  `,
  styles: `
    :host {
      flex: 1; min-width: 0; display: flex; gap: 11px; padding: 14px; border-radius: var(--nx-r-3);
      background: var(--nx-surface-1); border: 1px solid var(--nx-line); text-align: left; box-sizing: border-box;
    }
    :host(.compact) { padding: 12px; }
    :host(.selectable) { cursor: pointer; }
    :host(.selectable:focus-visible) { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    :host(.on) { background: rgba(255, 106, 26, 0.08); border-color: rgba(255, 106, 26, 0.5); }
    .radio {
      width: 18px; height: 18px; border-radius: 50%; flex: none; margin-top: 1px; display: grid; place-items: center;
      border: 1.5px solid var(--nx-line-strong); box-sizing: border-box;
    }
    :host(.on) .radio { border-color: var(--nx-orange-500); }
    .fill { width: 9px; height: 9px; border-radius: 50%; background: transparent; }
    :host(.on) .fill { background: var(--nx-orange-500); }
    .text { display: block; min-width: 0; }
    .title { display: block; font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; color: var(--nx-text); }
    .sub { display: block; font-size: 11.5px; color: var(--nx-text-dim); margin-top: 3px; line-height: 1.4; }
  `,
})
export class ProfessorRadioCardComponent {
  readonly type = input.required<ProfessorLinkType>();
  readonly on = input(false);
  readonly compact = input(false);
  readonly selectable = input(true);
  readonly picked = output<ProfessorLinkType>();

  protected readonly meta = computed(() => PROFESSOR_TYPE_META[this.type()]);

  protected pick(event?: Event): void {
    if (!this.selectable()) return;
    event?.preventDefault();
    this.picked.emit(this.type());
  }
}
