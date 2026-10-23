import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { personColor, initialsOf } from '../domain/models';
import { IconComponent } from './icon.component';
import { PhotoViewerService } from './photo-viewer';

/** Cabeçalho da página (protótipo BoPageHeader): título, subtítulo e ações à direita. */
@Component({
  selector: 'ct-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <div class="titles">
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <div class="sub">{{ subtitle() }}</div>
        }
      </div>
      <div class="actions"><ng-content /></div>
    </div>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 16px; padding: 22px var(--ct-gutter) 16px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { flex: 1; min-width: 220px; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 24px; letter-spacing: -0.025em; color: var(--nx-text); }
    .sub { margin-top: 4px; font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); }
    .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}

/** Número em destaque (AuStat). */
@Component({
  selector: 'ct-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stat">
      <div class="ct-kick">{{ label() }}</div>
      <div class="value" [class]="'value ' + tone()">{{ value() }}</div>
      @if (sub()) {
        <div class="sub">{{ sub() }}</div>
      }
    </div>
  `,
  styles: `
    .stat { padding: 16px 18px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); height: 100%; }
    .value { margin-top: 8px; font-family: var(--nx-font-display); font-weight: 800; font-size: 24px; letter-spacing: -0.02em; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .value.green { color: var(--nx-win); }
    .value.orange { color: var(--nx-orange-500); }
    .value.red { color: var(--nx-live); }
    .sub { margin-top: 4px; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
  `,
})
export class StatComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly sub = input('');
  readonly tone = input<'' | 'green' | 'orange' | 'red'>('');
}

/**
 * Avatar redondo (CtAv) + nome e linha de apoio (CtPerson). Com `photoUrl` mostra a foto (iniciais
 * se ela não carregar); com `zoomable` e foto, o avatar vira botão que abre a foto inteira. Sem
 * foto não vira botão — nada de afordância falsa.
 */
@Component({
  selector: 'ct-person',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canZoom()) {
      <button type="button" class="av zoom" [attr.aria-label]="'Ver foto de ' + name()" [style.width.px]="size()" [style.height.px]="size()" [style.border-color]="color() + '55'" (click)="zoom()">
        <img [src]="photoUrl()" alt="" (error)="broken.set(true)" />
      </button>
    } @else if (showPhoto()) {
      <span class="av" [style.width.px]="size()" [style.height.px]="size()" [style.border-color]="color() + '55'">
        <img [src]="photoUrl()" alt="" (error)="broken.set(true)" />
      </span>
    } @else {
      <span class="av" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.34" [style.color]="color()" [style.background]="color() + '1F'" [style.border-color]="color() + '55'">{{ ini() }}</span>
    }
    @if (name()) {
      <span class="txt">
        <span class="line"><span class="nm">{{ name() }}</span><ng-content /></span>
        @if (sub()) {
          <span class="sb">{{ sub() }}</span>
        }
      </span>
    }
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .av { border-radius: 50%; flex: none; display: grid; place-items: center; border: 1px solid; font-family: var(--nx-font-display); font-weight: 700; overflow: hidden; padding: 0; background: var(--nx-surface-2); }
    .av img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .zoom { cursor: zoom-in; }
    .zoom:hover, .zoom:focus-visible { outline: 2px solid var(--nx-orange-400); outline-offset: 2px; }
    .txt { min-width: 0; display: flex; flex-direction: column; }
    .line { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .nm { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sb { margin-top: 1px; font-size: 11.5px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `,
})
export class PersonComponent {
  readonly name = input('');
  readonly sub = input<string | null>('');
  readonly size = input(32);
  /** Chave da cor estável (uid/id); sem ela usa o nome. */
  readonly colorKey = input('');
  readonly photoUrl = input<string | null>(null);
  /** Clique no avatar abre a foto inteira (só quando há foto). */
  readonly zoomable = input(false);
  /** Kicker do visualizador. */
  readonly role = input('Atleta');
  private readonly viewer = inject(PhotoViewerService);
  protected readonly broken = signal(false);
  protected readonly ini = computed(() => initialsOf(this.name() || '·'));
  protected readonly color = computed(() => personColor(this.colorKey() || this.name()));
  protected readonly showPhoto = computed(() => !!this.photoUrl() && !this.broken());
  protected readonly canZoom = computed(() => this.zoomable() && this.showPhoto());

  protected zoom(): void {
    const url = this.photoUrl();
    if (url) this.viewer.open({ url, name: this.name(), role: this.role() });
  }
}

/** Faixa de alerta (CtBanner). `inline` = dentro de card; sem = topo da página. */
@Component({
  selector: 'ct-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="banner" [class]="'banner ' + tone()" [class.inline]="inline()">
      <ct-icon name="alert" [size]="17" class="ic" />
      <div class="body">
        @if (title()) {
          <div class="t">{{ title() }}</div>
        }
        <div class="d"><ng-content /></div>
      </div>
      <ng-content select="[action]" />
    </div>
  `,
  styles: `
    .banner { display: flex; align-items: center; gap: 12px; padding: 12px var(--ct-gutter); border-bottom: 1px solid; flex-wrap: wrap; }
    .banner.inline { padding: 12px 14px; border: 1px solid; border-radius: var(--nx-r-3); }
    .body { flex: 1; min-width: 200px; }
    .t { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .d { margin-top: 2px; font-size: 12.5px; line-height: 1.45; color: var(--nx-text-mute); }
    .red { background: rgba(255,59,48,0.10); border-color: rgba(255,59,48,0.35); } .red .ic, .red .t { color: var(--nx-live); }
    .yellow { background: rgba(244,197,67,0.09); border-color: rgba(244,197,67,0.32); } .yellow .ic, .yellow .t { color: var(--nx-pending); }
    .orange { background: rgba(255,106,26,0.10); border-color: rgba(255,106,26,0.32); } .orange .ic, .orange .t { color: var(--nx-orange-400); }
    .blue { background: rgba(91,155,255,0.09); border-color: rgba(91,155,255,0.32); } .blue .ic, .blue .t { color: var(--nx-blue); }
    .green { background: rgba(43,209,126,0.09); border-color: rgba(43,209,126,0.30); } .green .ic, .green .t { color: var(--nx-win); }
  `,
})
export class BannerComponent {
  readonly tone = input<'red' | 'yellow' | 'orange' | 'blue' | 'green'>('red');
  readonly title = input('');
  readonly inline = input(false);
}

/** Interruptor (AuToggle) com two-way binding via `model()`. */
@Component({
  selector: 'ct-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" role="switch" class="tg" [class.on]="on()" [attr.aria-checked]="on()" [attr.aria-label]="label() || null" [disabled]="disabled()" (click)="on.set(!on())">
      <span class="knob"></span>
    </button>
  `,
  styles: `
    .tg { width: 36px; height: 20px; flex: none; border-radius: 999px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-2); position: relative; cursor: pointer; padding: 0; transition: background 140ms var(--nx-ease-out); }
    .tg.on { background: var(--nx-orange-500); border-color: transparent; }
    .tg:disabled { opacity: 0.5; cursor: default; }
    .knob { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform 160ms var(--nx-ease-out); }
    .tg.on .knob { transform: translateX(16px); }
  `,
})
export class ToggleComponent {
  readonly on = model(false);
  readonly label = input('');
  readonly disabled = input(false);
}

/** Abas segmentadas (TrTabs). */
@Component({
  selector: 'ct-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ct-chart-tabs" role="tablist">
      @for (o of options(); track o.value) {
        <button type="button" role="tab" [class.active]="o.value === value()" [attr.aria-selected]="o.value === value()" [disabled]="disabled()" (click)="value.set(o.value)">{{ o.label }}</button>
      }
    </div>
  `,
})
export class SegmentedComponent {
  readonly options = input.required<{ value: string; label: string }[]>();
  readonly value = model('');
  readonly disabled = input(false);
}

/** Modal (CtModal). O conteúdo e o rodapé (`[footer]`) vêm por projeção. */
@Component({
  selector: 'ct-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="modal" role="dialog" aria-modal="true" [attr.aria-label]="title()" [style.max-width.px]="width()">
      <div class="head">
        <div class="ct-grow">
          @if (kicker()) {
            <div class="ct-kick">{{ kicker() }}</div>
          }
          <div class="title">{{ title() }}</div>
        </div>
        <button type="button" class="x" aria-label="Fechar" (click)="closed.emit()"><ct-icon name="x" [size]="14" /></button>
      </div>
      <div class="body"><ng-content /></div>
      <div class="foot"><ng-content select="[footer]" /></div>
    </div>
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 60; display: grid; place-items: start center; padding: 6vh 16px 16px; overflow-y: auto; }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.62); }
    .modal { position: relative; width: 100%; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-5); box-shadow: var(--nx-elev-3); display: flex; flex-direction: column; }
    .head { padding: 20px 22px 14px; display: flex; align-items: flex-start; gap: 10px; border-bottom: 1px solid var(--nx-line); }
    .title { margin-top: 5px; font-family: var(--nx-font-display); font-weight: 800; font-size: 18px; color: var(--nx-text); }
    .x { width: 30px; height: 30px; border-radius: 9px; background: var(--nx-surface-2); border: none; color: var(--nx-text-mute); cursor: pointer; display: grid; place-items: center; }
    .body { padding: 22px; display: flex; flex-direction: column; gap: 14px; }
    .foot { padding: 14px 22px; border-top: 1px solid var(--nx-line); display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .foot:empty { display: none; }
  `,
})
export class ModalComponent {
  readonly title = input.required<string>();
  readonly kicker = input('');
  readonly width = input(560);
  readonly closed = output<void>();
}

export interface AuditRow {
  when: string;
  who: string;
  what: string;
  why?: string;
}

/** Trilha de auditoria (CtAudit): linha do tempo vertical. */
@Component({
  selector: 'ct-audit-trail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (r of rows(); track $index; let first = $first; let last = $last) {
      <div class="row">
        <div class="rail">
          <span class="dot" [class.first]="first"></span>
          @if (!last) {
            <span class="line"></span>
          }
        </div>
        <div class="txt" [class.pad]="!last">
          <div class="what">{{ r.what }}</div>
          <div class="when">{{ r.when }} · {{ r.who }}</div>
          @if (r.why) {
            <div class="why">“{{ r.why }}”</div>
          }
        </div>
      </div>
    } @empty {
      <div class="ct-dim">Nada registrado ainda.</div>
    }
  `,
  styles: `
    .row { display: grid; grid-template-columns: 14px 1fr; gap: 10px; }
    .rail { display: flex; flex-direction: column; align-items: center; }
    .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; background: var(--nx-surface-2); border: 1px solid var(--nx-line-strong); }
    .dot.first { background: var(--nx-orange-500); }
    .line { flex: 1; width: 1px; background: var(--nx-line-strong); margin-top: 3px; }
    .txt.pad { padding-bottom: 12px; }
    .what { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text); }
    .when { margin-top: 2px; font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); }
    .why { margin-top: 4px; font-size: 11.5px; color: var(--nx-text-mute); font-style: italic; }
  `,
})
export class AuditTrailComponent {
  readonly rows = input.required<AuditRow[]>();
}
