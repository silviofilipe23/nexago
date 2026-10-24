import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { unreadBadge } from '../profissionais/arena-professor-channel.model';
import { AulasChatService } from './aulas-chat.service';
import { CLASS_TYPE_LABEL, teacherInitials, type ClassType } from './class.model';

export type AulasTab = 'visao' | 'agenda' | 'turmas' | 'alunos' | 'mensagens' | 'planos' | 'professores' | 'avaliacoes' | 'regras' | 'vitrine';

const TABS: ReadonlyArray<{ id: AulasTab; label: string; route: string }> = [
  { id: 'visao', label: 'Visão geral', route: '/painel/aulas' },
  { id: 'agenda', label: 'Agenda', route: '/painel/aulas/agenda' },
  { id: 'turmas', label: 'Turmas', route: '/painel/aulas/turmas' },
  { id: 'alunos', label: 'Alunos', route: '/painel/aulas/alunos' },
  { id: 'mensagens', label: 'Mensagens', route: '/painel/aulas/mensagens' },
  { id: 'planos', label: 'Planos', route: '/painel/aulas/planos' },
  { id: 'professores', label: 'Professores', route: '/painel/aulas/professores' },
  { id: 'avaliacoes', label: 'Avaliações', route: '/painel/aulas/avaliacoes' },
  { id: 'regras', label: 'Regras', route: '/painel/aulas/regras' },
  { id: 'vitrine', label: 'Vitrine no app', route: '/painel/aulas/vitrine' },
];

/** Página padrão do módulo Aulas (protótipo `AuWebPage`): cabeçalho, subnavegação e o gate
 *  do plano (Pro/Elite). Ações do cabeçalho entram por `[page-actions]`. */
@Component({
  selector: 'ar-aulas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="title()" [subtitle]="subtitle()">
        <ng-content select="[page-actions]" />
      </ar-page-header>
      @if (tab(); as active) {
        <nav class="subnav" aria-label="Aulas">
          @for (t of tabs; track t.id) {
            <a class="subnav-item" [class.active]="t.id === active" [routerLink]="t.route">
              {{ t.label }}
              @if (t.id === 'mensagens' && unreadMessages() > 0) {
                <span class="subnav-badge" [attr.aria-label]="unreadMessages() + ' não lidas'">{{ unreadBadge(unreadMessages()) }}</span>
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
            <p class="paywall-title">Aulas é um recurso dos planos Pro e Elite</p>
            <p class="state-text">
              Monte turmas com professor, horário e quadra fixos: a quadra sai do aluguel
              automaticamente, a chamada é feita no painel e os alunos recebem aviso quando a aula
              é cancelada.
            </p>
            <a class="ar-mini-btn ar-mini-btn-primary plans-link" routerLink="/painel/planos">Ver planos</a>
          </ar-panel-card>
        } @else {
          @if (planMissing()) {
            <div class="readonly-banner">
              Seu plano atual não inclui Aulas — as turmas existentes seguem visíveis, mas criar e
              reativar exigem o plano Pro ou Elite.
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
      display: flex;
      gap: 22px;
      padding: 0 var(--ar-pad-page-x);
      border-bottom: 1px solid var(--nx-line);
      flex: none;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .subnav-item {
      height: 44px;
      display: flex;
      align-items: center;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text-dim);
      text-decoration: none;
      white-space: nowrap;
    }

    .subnav-badge {
      margin-left: 6px;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 8px;
      box-sizing: border-box;
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-size: 10px;
      font-weight: 700;
      display: inline-grid;
      place-items: center;
    }

    .subnav-item:hover {
      color: var(--nx-text-mute);
    }

    .subnav-item.active {
      color: var(--nx-text);
      border-bottom-color: var(--nx-orange-500);
    }

    .body {
      flex: 1;
      min-height: 0;
      padding: 20px var(--ar-pad-page-x) 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
      line-height: 1.5;
    }

    .paywall-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0 0 8px;
    }

    .plans-link {
      align-self: flex-start;
      margin-top: 14px;
      text-decoration: none;
    }

    .readonly-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
      flex: none;
    }

    @include ar.below(md) {
      .body {
        padding: 16px 16px 24px;
      }
    }
  `,
})
export class AulasPageComponent {
  private readonly arenaContext = inject(ArenaContextService);

  readonly title = input.required<string>();
  readonly subtitle = input('');
  /** `null` = página interna (sem subnavegação). */
  readonly tab = input<AulasTab | null>(null);
  /** A página não tem nada para mostrar — sem o plano, vira a tela de upgrade. */
  readonly empty = input(false);

  protected readonly tabs = TABS;
  private readonly chat = inject(AulasChatService);
  /** Não lidas das conversas com os alunos (badge da aba Mensagens). */
  protected readonly unreadMessages = computed(() => this.chat.unreadTotal());
  protected readonly unreadBadge = unreadBadge;

  constructor() {
    this.chat.startInbox();
  }
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly planMissing = computed(
    () => !this.arenaContext.loading() && !this.arenaContext.hasCapability('aulas'),
  );
  protected readonly paywall = computed(() => this.planMissing() && this.empty());
}

const TYPE_TONE: Record<ClassType, { color: string; bg: string }> = {
  turma: { color: 'var(--nx-text)', bg: 'rgba(255,255,255,0.06)' },
  particular: { color: '#FF8A4A', bg: 'rgba(255,106,26,0.12)' },
  dupla: { color: '#5B9BFF', bg: 'rgba(91,155,255,0.12)' },
  experimental: { color: '#F4C543', bg: 'rgba(244,197,67,0.12)' },
};

/** Tag do tipo da aula (protótipo `AuTipoTag`). */
@Component({
  selector: 'ar-aula-type-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tag" [style.color]="tone().color" [style.background]="tone().bg">{{ label() }}</span>`,
  styles: `
    .tag {
      display: inline-flex;
      align-items: center;
      height: 18px;
      padding: 0 7px;
      border-radius: 6px;
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      white-space: nowrap;
      flex: none;
    }
  `,
})
export class AulaTypeTagComponent {
  readonly type = input.required<ClassType>();
  protected readonly tone = computed(() => TYPE_TONE[this.type()]);
  protected readonly label = computed(() => CLASS_TYPE_LABEL[this.type()]);
}

/** Avatar de iniciais na cor do professor (protótipo `AuProfAv`). */
@Component({
  selector: 'ar-teacher-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="av"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.font-size.px]="size() * 0.36"
      [style.color]="color()"
      [style.background]="color() + '22'"
      [style.border-color]="color() + '66'"
      [attr.aria-label]="name()"
    >{{ initials() }}</span>
  `,
  styles: `
    .av {
      display: inline-grid;
      place-items: center;
      border-radius: 50%;
      border: 1px solid;
      flex: none;
      font-family: var(--nx-font-display);
      font-weight: 700;
    }
  `,
})
export class TeacherAvatarComponent {
  readonly name = input.required<string>();
  readonly color = input('#FF6A1A');
  readonly size = input(28);
  protected readonly initials = computed(() => teacherInitials(this.name()));
}

/** Barra de ocupação (protótipo `AuBar`): lotada verde, baixa amarela, resto laranja. */
@Component({
  selector: 'ar-occupancy-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="track"><div class="fill" [style.width.%]="width()" [style.background]="fillColor()"></div></div>`,
  styles: `
    :host {
      display: block;
      flex: 1;
      min-width: 0;
    }

    .track {
      height: 6px;
      border-radius: 6px;
      background: var(--nx-surface-2);
      overflow: hidden;
    }

    .fill {
      height: 100%;
      border-radius: 6px;
    }
  `,
})
export class OccupancyBarComponent {
  readonly pct = input.required<number>();
  readonly color = input<string | null>(null);
  protected readonly width = computed(() => Math.max(0, Math.min(100, this.pct())));
  protected readonly fillColor = computed(() => {
    const custom = this.color();
    if (custom) return custom;
    const pct = this.pct();
    if (pct >= 100) return 'var(--nx-win)';
    if (pct < 65) return 'var(--nx-pending)';
    return 'var(--nx-orange-500)';
  });
}

/** Indicador do módulo (protótipo `AuStat`): rótulo, valor e uma linha de apoio. */
@Component({
  selector: 'ar-aula-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent],
  template: `
    <ar-panel-card pad="sm">
      <div class="label">{{ label() }}</div>
      <div class="value" [class]="'tone-' + tone()">{{ value() }}</div>
      @if (sub()) {
        <div class="sub">{{ sub() }}</div>
      }
    </ar-panel-card>
  `,
  styles: `
    :host { display: block; flex: 1; min-width: 0; }
    .label {
      font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em;
      text-transform: uppercase; color: var(--nx-text-dim);
    }
    .value {
      font-family: var(--nx-font-display); font-weight: 800; font-size: 26px; letter-spacing: -0.02em;
      color: var(--nx-text); margin-top: 8px;
    }
    .value.tone-green { color: var(--nx-win); }
    .value.tone-red { color: var(--nx-live); }
    .value.tone-orange { color: var(--nx-orange-500); }
    .sub { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); margin-top: 4px; }
  `,
})
export class AulaStatComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly sub = input('');
  readonly tone = input<'default' | 'green' | 'red' | 'orange'>('default');
}
