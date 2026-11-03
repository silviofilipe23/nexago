import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SchedulePlansStore } from './schedule-plans.store';

export type PhTab = 'planos' | 'assinantes' | 'grade' | 'espera';

const TABS: ReadonlyArray<{ id: PhTab; label: string; route: string }> = [
  { id: 'planos', label: 'Planos', route: '/painel/planos-horario' },
  { id: 'assinantes', label: 'Assinantes', route: '/painel/planos-horario/assinantes' },
  { id: 'grade', label: 'Grade', route: '/painel/planos-horario/grade' },
  { id: 'espera', label: 'Lista de espera', route: '/painel/planos-horario/espera' },
];

/** Página padrão de Planos de horário (protótipo `PhTabs` + shell): cabeçalho, abas com contagem
 *  real e o gate do plano (Pro/Elite, como Aulas). Ações do cabeçalho entram por `[page-actions]`. */
@Component({
  selector: 'ar-ph-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="title()" [subtitle]="subtitle()">
        <ng-content select="[page-actions]" />
      </ar-page-header>
      @if (tab(); as active) {
        <nav class="subnav" aria-label="Planos de horário">
          @for (t of tabs; track t.id) {
            <a class="subnav-item" [class.active]="t.id === active" [routerLink]="t.route">
              {{ t.label }}
              @if (countOf(t.id); as n) {
                <span class="count">{{ n }}</span>
              }
            </a>
          }
        </nav>
      }
      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (paywall()) {
          <ar-panel-card pad="lg">
            <p class="paywall-title">Planos de horário é um recurso dos planos Pro e Elite</p>
            <p class="state-text">
              Venda horário fixo toda semana com mensalidade: o atleta assina pelo app, a quadra fica
              com ele toda semana, e a arena controla reposição, pausa, rateio e lista de espera.
            </p>
            <a class="ar-mini-btn ar-mini-btn-primary plans-link" routerLink="/painel/planos">Ver planos</a>
          </ar-panel-card>
        } @else {
          @if (planMissing()) {
            <div class="readonly-banner">
              Seu plano atual não inclui Planos de horário — os planos e assinantes existentes seguem
              visíveis, mas criar e publicar exigem o plano Pro ou Elite.
            </div>
          }
          <ng-content />
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    @use 'breakpoints' as ar;
    .subnav {
      display: flex; gap: 22px; padding: 0 var(--ar-pad-page-x); border-bottom: 1px solid var(--nx-line);
      flex: none; overflow-x: auto; scrollbar-width: none;
    }
    .subnav-item {
      height: 44px; display: flex; align-items: center; gap: 7px; border-bottom: 2px solid transparent; margin-bottom: -1px;
      font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text-dim);
      text-decoration: none; white-space: nowrap;
    }
    .subnav-item:hover { color: var(--nx-text-mute); }
    .subnav-item.active { color: var(--nx-text); border-bottom-color: var(--nx-orange-500); }
    .count { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; color: var(--nx-text-dim); }
    .subnav-item.active .count { color: var(--nx-orange-500); }
    .body {
      flex: 1; min-height: 0; padding: 20px var(--ar-pad-page-x) 28px; display: flex; flex-direction: column; gap: 16px;
      overflow: auto;
    }
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; line-height: 1.5; }
    .paywall-title { font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; color: var(--nx-text); margin: 0 0 8px; }
    .plans-link { align-self: flex-start; margin-top: 14px; text-decoration: none; }
    .readonly-banner {
      border-radius: var(--nx-r-2); border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1);
      padding: 10px 14px; font-size: 12.5px; color: var(--nx-text-mute); flex: none;
    }
    @include ar.below(md) {
      .body { padding: 16px 16px 24px; }
    }
  `,
})
export class PhPageComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly store = inject(SchedulePlansStore);

  readonly title = input('Planos de horário');
  readonly subtitle = input('');
  /** `null` = página interna (editor), sem abas. */
  readonly tab = input<PhTab | null>(null);
  /** A página não tem nada para mostrar — sem o plano, vira a tela de upgrade. */
  readonly empty = input(false);

  protected readonly tabs = TABS;
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly planMissing = computed(() => !this.arenaContext.loading() && !this.arenaContext.hasCapability('planosHorario'));
  protected readonly paywall = computed(() => this.planMissing() && this.empty());

  constructor() {
    this.store.attach(inject(DestroyRef));
  }

  protected countOf(tab: PhTab): number | null {
    if (this.store.loading()) return null;
    switch (tab) {
      case 'planos':
        return this.store.visiblePlans().length || null;
      case 'assinantes':
        return this.store.subscriptions().length || null;
      case 'espera':
        return this.store.waitingCount() || null;
      default:
        return null;
    }
  }
}

export type PhIconName = 'pause' | 'queue' | 'split' | 'undo' | 'trend' | 'holiday' | 'rain' | 'swap' | 'alert';

/** Ícones próprios do protótipo de Planos de horário (`PhIc*` + `WxIcRain/WxIcSwap`). */
@Component({
  selector: 'ar-ph-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (name()) {
        @case ('pause') { <rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /> }
        @case ('queue') { <path d="M4 6h16M4 12h10M4 18h7" /><circle cx="18" cy="16" r="3" /><path d="M18 14.6V16l1 .8" /> }
        @case ('split') {
          <circle cx="7" cy="8" r="3" /><circle cx="17" cy="8" r="3" />
          <path d="M2 20c0-2.8 2.2-5 5-5s5 2.2 5 5M12 20c0-2.8 2.2-5 5-5s5 2.2 5 5" />
        }
        @case ('undo') { <path d="M4 9h11a5 5 0 0 1 0 10H8" /><path d="M8 5 4 9l4 4" /> }
        @case ('trend') { <path d="M3 17 9 11l4 4 8-8" /><path d="M15 7h6v6" /> }
        @case ('holiday') { <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9.5 15 1.8 1.8 3.4-3.6" /> }
        @case ('rain') { <path d="M7 15a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.4 1.5A3.5 3.5 0 0 1 17 15H7z" /><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2" /> }
        @case ('swap') { <path d="M4 8h13l-3-3M20 16H7l3 3" /> }
        @case ('alert') { <path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17v.5" /> }
      }
    </svg>
  `,
  styles: `:host { display: inline-flex; flex: none; }`,
})
export class PhIconComponent {
  readonly name = input.required<PhIconName>();
  readonly size = input(18);
}

export type PhTone = 'orange' | 'green' | 'yellow' | 'red' | 'dim';

/** Ícone em caixa colorida (protótipo `PhIconBox`). */
@Component({
  selector: 'ar-ph-icon-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhIconComponent],
  template: `
    <div class="box" [class]="'box tone-' + tone()" [style.width.px]="size()" [style.height.px]="size()">
      <ar-ph-icon [name]="icon()" [size]="iconSize()" />
    </div>
  `,
  styles: `
    .box { border-radius: 10px; flex: none; display: grid; place-items: center; }
    .tone-orange { background: var(--nx-orange-tint); color: var(--nx-orange-500); }
    .tone-green { background: rgba(43, 209, 126, 0.1); color: var(--nx-win); }
    .tone-yellow { background: rgba(244, 197, 67, 0.1); color: var(--nx-pending); }
    .tone-red { background: rgba(255, 59, 48, 0.1); color: var(--nx-live); }
    .tone-dim { background: var(--nx-surface-1); color: var(--nx-text-mute); }
  `,
})
export class PhIconBoxComponent {
  readonly icon = input.required<PhIconName>();
  readonly tone = input<PhTone>('orange');
  readonly size = input(36);
  protected readonly iconSize = computed(() => Math.round(this.size() * 0.47));
}

/** Indicador do topo (protótipo `PhStat`). */
@Component({
  selector: 'ar-ph-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stat">
      <div class="label">{{ label() }}</div>
      <div class="value" [class]="'value tone-' + tone()">{{ value() }}</div>
      @if (sub()) {
        <div class="sub">{{ sub() }}</div>
      }
    </div>
  `,
  styles: `
    :host { display: block; flex: 1; min-width: 0; }
    .stat { height: 100%; box-sizing: border-box; padding: 14px 16px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .value { font-family: var(--nx-font-mono); font-weight: 800; font-size: 22px; letter-spacing: -0.02em; color: var(--nx-text); margin-top: 8px; }
    .value.tone-green { color: var(--nx-win); }
    .value.tone-yellow { color: var(--nx-pending); }
    .value.tone-red { color: var(--nx-live); }
    .sub { font-family: var(--nx-font-ui); font-size: 11.5px; color: var(--nx-text-dim); margin-top: 4px; }
  `,
})
export class PhStatComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly sub = input('');
  readonly tone = input<'default' | 'green' | 'yellow' | 'red'>('default');
}

/** Linha chave → valor (protótipo `PhLine`). */
@Component({
  selector: 'ar-ph-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span>{{ k() }}</span><span class="v" [class.strong]="strong()" [style.color]="color()">{{ v() }}</span>`,
  styles: `
    :host { display: flex; justify-content: space-between; gap: 12px; font-family: var(--nx-font-ui); font-size: 12.5px; color: var(--nx-text-mute); }
    .v { font-family: var(--nx-font-mono); font-weight: 500; text-align: right; color: var(--nx-text-mute); }
    .v.strong { font-weight: 700; color: var(--nx-text); }
  `,
})
export class PhLineComponent {
  readonly k = input.required<string>();
  readonly v = input.required<string>();
  readonly strong = input(false);
  readonly color = input<string | null>(null);
}

/** Barra de progresso (protótipo `PhBar`). */
@Component({
  selector: 'ar-ph-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="track" [style.height.px]="h()"><div class="fill" [style.width.%]="pct()" [style.background]="color()"></div></div>`,
  styles: `
    :host { display: block; }
    .track { border-radius: 99px; background: var(--nx-surface-2); overflow: hidden; }
    .fill { height: 100%; border-radius: 99px; }
  `,
})
export class PhBarComponent {
  readonly v = input.required<number>();
  readonly max = input(100);
  readonly color = input('var(--nx-orange-500)');
  readonly h = input(6);
  protected readonly pct = computed(() => (this.max() > 0 ? Math.max(0, Math.min(100, (this.v() / this.max()) * 100)) : 0));
}
