import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { DashboardRepository, type DashboardData } from './data/dashboard.repository';

interface PendingItem {
  icon: 'arena' | 'cash' | 'users';
  label: string;
  meta: string;
  count: string;
  tone: PillTone;
  link: string;
  query?: Record<string, string>;
}

interface BaseLine {
  label: string;
  value: number;
  hint: string;
}

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function greetingFor(hour: number): string {
  if (hour < 12) {
    return 'Bom dia';
  }
  if (hour < 18) {
    return 'Boa tarde';
  }
  return 'Boa noite';
}

const int = new Intl.NumberFormat('pt-BR');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * Home do painel com os números reais da plataforma: atletas ativos (cadastro completo + já
 * entrou), arenas, torneios, base de atletas e o que está pendente de ação.
 */
@Component({
  selector: 'bo-panel-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiCardComponent,
    LineChartComponent,
    PillComponent,
    IconComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header [title]="greetingTitle()" [subtitle]="todayLabel()">
        <div class="header-actions">
          <button type="button" class="bo-mini-btn" [disabled]="loading()" (click)="reload()">
            <bo-icon name="swap" [size]="13" />
            {{ loading() ? 'Atualizando…' : 'Atualizar' }}
          </button>
          <div class="bo-avatar" style="width: 38px; height: 38px; font-size: 13px;" aria-hidden="true">
            {{ initials() }}
          </div>
        </div>
      </bo-page-header>

      <div class="body">
        <div class="kpi-row">
          <bo-kpi-card
            label="Atletas ativos"
            [value]="fmt(data()?.athletes?.active)"
            [delta]="athleteDelta().text"
            [deltaTone]="athleteDelta().tone"
            note="cadastro completo + já entrou"
          />
          <bo-kpi-card label="Arenas cadastradas" [value]="fmt(data()?.arenas?.registered)" [note]="arenaNote()" />
          <bo-kpi-card label="Torneios" [value]="fmt(data()?.tournaments?.total)" [note]="tournamentNote()" />
          <bo-kpi-card
            label="Ativos · últimos 30 dias"
            [value]="fmt(data()?.athletes?.activeSeenLast30d)"
            note="abriram o app ou o portal"
          />
        </div>

        @if (failedSources().length > 0 && !loading()) {
          <div class="bo-alert">
            <bo-icon name="alert" [size]="16" />
            <span>Não foi possível ler: {{ failedSources().join(', ') }}. Os cards com “—” não têm número.</span>
          </div>
        }

        <div class="main-grid">
          <div class="col-left">
            <bo-panel-card kicker="Últimos 12 meses · pela data do cadastro" title="Crescimento de atletas ativos" class="chart-card">
              @if (growth(); as g) {
                <bo-line-chart [height]="126" [data]="g.data" [months]="g.months" ariaLabel="Atletas ativos acumulados nos últimos 12 meses" />
              } @else {
                <p class="status">{{ loading() ? 'Carregando…' : 'Sem dados de atletas.' }}</p>
              }
            </bo-panel-card>

            <bo-panel-card title="Base de atletas" kicker="contas de atleta">
              <a class="bo-ghost-btn" routerLink="/painel/atletas" card-actions>Ver a base</a>
              <div class="list">
                @for (line of baseLines(); track line.label) {
                  <div class="bo-row">
                    <div class="bo-row-body">
                      <div class="bo-row-title">{{ line.label }}</div>
                      <div class="bo-row-meta">{{ line.hint }}</div>
                    </div>
                    <span class="num">{{ fmt(line.value) }}</span>
                  </div>
                } @empty {
                  <p class="status">{{ loading() ? 'Carregando…' : 'Sem dados de atletas.' }}</p>
                }
              </div>
            </bo-panel-card>
          </div>

          <div class="col-right">
            <bo-panel-card pad="sm" title="Pendente de ação">
              <div class="list">
                @for (item of pending(); track item.label) {
                  <a class="bo-row link-row" [routerLink]="item.link" [queryParams]="item.query">
                    <div class="bo-row-icon">
                      <bo-icon [name]="item.icon" [size]="16" />
                    </div>
                    <div class="bo-row-body">
                      <div class="bo-row-title">{{ item.label }}</div>
                      <div class="bo-row-meta">{{ item.meta }}</div>
                    </div>
                    <bo-pill [tone]="item.tone">{{ item.count }}</bo-pill>
                    <bo-icon name="chevron-right" [size]="14" />
                  </a>
                }
              </div>
            </bo-panel-card>

            <bo-panel-card pad="sm" title="Atalhos" class="shortcuts-card">
              <div class="shortcuts-grid">
                <a class="bo-shortcut" routerLink="/painel/arenas/pre-cadastro"><bo-icon name="plus" [size]="16" /><span>Pré-cadastro de arena</span></a>
                <a class="bo-shortcut" routerLink="/painel/torneios"><bo-icon name="trophy" [size]="16" /><span>Torneios</span></a>
                <a class="bo-shortcut" routerLink="/painel/atletas"><bo-icon name="users" [size]="16" /><span>Atletas</span></a>
                <a class="bo-shortcut" routerLink="/painel/financeiro"><bo-icon name="cash" [size]="16" /><span>Financeiro</span></a>
              </div>
            </bo-panel-card>
          </div>
        </div>
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .header-actions { display: flex; align-items: center; gap: 10px; }
    .body { flex: 1; padding: 22px 32px 28px; display: flex; flex-direction: column; gap: 16px; overflow: auto; }
    .kpi-row { display: flex; gap: 16px; flex: none; }
    .main-grid { flex: 1; display: grid; grid-template-columns: 1fr 372px; gap: 16px; min-height: 0; align-items: start; }
    .col-left,
    .col-right { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .list { display: flex; flex-direction: column; margin-top: -6px; }
    .status { margin: 8px 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .num { font-family: var(--nx-font-mono); font-size: 14px; font-weight: 600; color: var(--nx-text); }
    a.bo-ghost-btn,
    a.bo-shortcut,
    .link-row { text-decoration: none; color: inherit; }
    .link-row { cursor: pointer; }
    .link-row:hover .bo-row-title { color: var(--nx-orange-500); }
    .shortcuts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 1180px) { .main-grid { grid-template-columns: 1fr; } }
    @media (max-width: 720px) { .kpi-row { flex-wrap: wrap; } .body { padding: 16px; } }
  `,
})
export class PanelHomeComponent {
  private readonly auth = inject(AuthService);
  private readonly repository = inject(DashboardRepository);

  protected readonly data = signal<DashboardData | null>(null);
  protected readonly loading = signal(true);

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.data.set(await this.repository.load());
    } finally {
      this.loading.set(false);
    }
  }

  protected fmt(value: number | null | undefined): string {
    return value == null ? '—' : int.format(value);
  }

  protected readonly failedSources = computed(() => {
    const d = this.data();
    if (!d) return [];
    const out: string[] = [];
    if (!d.athletes) out.push('atletas');
    if (!d.arenas) out.push('arenas');
    if (!d.tournaments) out.push('torneios');
    if (!d.pendingWithdrawals) out.push('saques');
    return out;
  });

  /** Variação real: ativos ao fim deste mês vs ao fim do anterior (pela data do cadastro). */
  protected readonly athleteDelta = computed<{ text: string; tone: 'green' | 'red' }>(() => {
    const months = this.data()?.athletes?.activeByMonth ?? [];
    const cur = months[months.length - 1]?.count;
    const prev = months[months.length - 2]?.count;
    if (cur == null || prev == null || prev === 0) return { text: '', tone: 'green' };
    const pct = ((cur - prev) / prev) * 100;
    return {
      text: `${pct.toFixed(1).replace('.', ',')}%`,
      tone: pct < 0 ? 'red' : 'green',
    };
  });

  protected readonly arenaNote = computed(() => {
    const a = this.data()?.arenas;
    return a ? `+${int.format(a.preRegistered)} em pré-cadastro · ${int.format(a.total)} na base` : '';
  });

  protected readonly tournamentNote = computed(() => {
    const t = this.data()?.tournaments;
    return t ? `${int.format(t.active)} ativos · ${int.format(t.completed)} concluídos` : '';
  });

  protected readonly growth = computed(() => {
    const months = this.data()?.athletes?.activeByMonth ?? [];
    if (months.length === 0) return null;
    return {
      data: months.map((m) => m.count),
      months: months.map((m) => MONTH_SHORT[Number(m.month.slice(5, 7)) - 1] ?? m.month),
    };
  });

  protected readonly baseLines = computed<BaseLine[]>(() => {
    const s = this.data()?.athletes;
    if (!s) return [];
    return [
      { label: 'Contas na plataforma', value: s.accounts, hint: 'todas as contas do login, inclusive equipe e organizadores' },
      { label: 'Contas de atleta', value: s.athletes, hint: 'papel atleta (ou sem papel)' },
      { label: 'Ativos', value: s.active, hint: 'cadastro completo e já entraram' },
      { label: 'Cadastro incompleto', value: s.incomplete, hint: 'entraram mas não concluíram o cadastro' },
      { label: 'Nunca entraram', value: s.neverSignedIn, hint: 'conta criada sem nenhum login' },
      { label: 'Marcadas inativas', value: s.inactive, hint: 'marcação manual do backoffice' },
      { label: 'Desativadas', value: s.disabled, hint: 'login bloqueado no Firebase Auth' },
    ];
  });

  protected readonly pending = computed<PendingItem[]>(() => {
    const d = this.data();
    const w = d?.pendingWithdrawals;
    const s = d?.athletes;
    const a = d?.arenas;
    return [
      {
        icon: 'cash',
        label: 'Saques pra revisar',
        meta: w ? (w.count > 0 ? `${brl.format(w.totalReais)} no total` : 'nenhum na fila') : 'não foi possível ler',
        count: w ? String(w.count) : '—',
        tone: w && w.count > 0 ? 'orange' : 'dim',
        link: '/painel/financeiro',
      },
      {
        icon: 'users',
        label: 'Cadastros incompletos',
        meta: 'atletas que ainda não são usuários de fato',
        count: s ? String(s.incomplete + s.neverSignedIn) : '—',
        tone: s && s.incomplete + s.neverSignedIn > 0 ? 'yellow' : 'dim',
        link: '/painel/atletas',
        query: { situacao: 'incomplete' },
      },
      {
        icon: 'arena',
        label: 'Arenas em pré-cadastro',
        meta: 'prospecção do comercial — status na tela de Arenas',
        count: a ? String(a.preRegistered) : '—',
        tone: 'dim',
        link: '/painel/arenas',
      },
    ];
  });

  protected readonly greetingTitle = computed(() => {
    const source = this.auth.displayName() || this.auth.user()?.email || '';
    const firstName = source.split(/[\s@.]/)[0] || '';
    const greeting = greetingFor(new Date().getHours());
    return firstName ? `${greeting}, ${firstName}.` : `${greeting}.`;
  });

  protected readonly todayLabel = computed(() => {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(now).replace('.', '');
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(now).replace('.', '');
    return `${weekday} · ${date} · GMT-3`;
  });

  protected readonly initials = computed(() => {
    const name = this.auth.displayName() || this.auth.user()?.email || '·';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return '·';
    }
    const first = parts[0]![0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
    return (first + last).toUpperCase();
  });
}
