import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { OG_PAY_LABEL, OG_PAY_TONE, initialsOf } from '../data/mock-data';
import { listInscriptions } from '../data/inscriptions-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { listMyTournaments } from '../data/tournaments-repository';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

/** Status de pagamento da linha, no vocabulário do design (`OG_PAY_TONE`/`OG_PAY_LABEL`). O
 *  schema real (`isPaid`/`waitlist` em `TournamentInscription`) não modela estorno — a aba
 *  "estornado" fica sempre vazia até esse conceito existir no backend. */
type PayStatus = keyof typeof OG_PAY_TONE;
type Tab = 'todos' | PayStatus;

interface InscricaoRow {
  id: string;
  name: string;
  evento: string;
  categoria: string;
  pay: PayStatus;
  date: string;
  createdAt: Date | null;
}

/** Teto de torneios consultados em paralelo pra montar a lista agregada — mesmo convite de
 *  `eventos-list.component.ts` (MAX_INSCRITOS_FETCH) pra evitar N+1 sem limite. */
const MAX_INSCRITOS_FETCH = 20;

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

/** Atletas e duplas inscritos em todos os torneios do organizador, com status de pagamento. */
@Component({
  selector: 'og-inscricoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgChartTabsComponent, OgIconComponent, OgPillComponent, OgAvatarComponent],
  template: `
    <og-page-header title="Inscrições" subtitle="Atletas e duplas inscritos em todos os eventos">
      <!-- mock (fase 2): busca do header ainda decorativa em toda a IA do protótipo (idem Início) -->
      <div class="og-search-box"><og-icon name="search" [size]="15" /><span>Buscar…</span></div>
      <!-- mock (fase 2): exportação real fica pra depois -->
      <button type="button" class="og-mini-btn"><og-icon name="download" [size]="14" />Exportar</button>
    </og-page-header>

    <div class="og-content">
      <div class="og-kpi-row">
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Total de inscritos</div>
          <div class="og-kpi-value sm">{{ rows().length }}</div>
        </og-card>
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Pagamentos pendentes</div>
          <div class="og-kpi-value sm" style="color:var(--nx-pending)">{{ pendentes() }}</div>
        </og-card>
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Categorias abertas</div>
          <div class="og-kpi-value sm">{{ categoriasAbertas() }}</div>
        </og-card>
      </div>

      <og-chart-tabs [tabs]="tabs" [active]="tab()" (changed)="tab.set($any($event))" />

      <og-card pad="0" flex="1">
        <div class="og-table-head">
          <span style="flex:1.4">Atleta / Dupla</span>
          <span style="flex:1">Evento</span>
          <span style="width:70px">Data</span>
          <span style="width:110px">Pagamento</span>
          <span style="width:80px"></span>
        </div>
        <div class="og-table-body">
          @if (loading()) {
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="og-row">
                <div class="og-skeleton-line" style="width:100%"></div>
              </div>
            }
          } @else {
            @for (r of filtered(); track r.id) {
              <div class="og-row">
                <og-avatar [initials]="initialsOf(r.name, ' ')" [size]="34" />
                <span style="flex:1.4;min-width:0">
                  <div class="og-inscricoes-name">{{ r.name }}</div>
                  <div class="og-inscricoes-cat">{{ r.categoria }}</div>
                </span>
                <span style="flex:1" class="og-inscricoes-evento">{{ r.evento }}</span>
                <span style="width:70px" class="og-inscricoes-date">{{ r.date }}</span>
                <span style="width:110px"><og-pill [tone]="payTone[r.pay]">{{ payLabel[r.pay] }}</og-pill></span>
                <button type="button" class="og-ghost-btn">Detalhes</button>
              </div>
            } @empty {
              <p class="og-empty">Nenhuma inscrição ainda</p>
            }
          }
        </div>
      </og-card>
    </div>
  `,
  styles: `
    .og-inscricoes-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-inscricoes-cat {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
    .og-inscricoes-evento {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .og-inscricoes-date {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 16px;
      margin: 0;
    }
    .og-skeleton-line {
      height: 34px;
      border-radius: 6px;
      background: var(--nx-surface-1);
      position: relative;
      overflow: hidden;
    }
    .og-skeleton-line::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, var(--nx-surface-2), transparent);
      animation: og-shimmer 1.2s infinite;
    }
    @keyframes og-shimmer {
      from {
        transform: translateX(-100%);
      }
      to {
        transform: translateX(100%);
      }
    }
  `,
})
export class InscricoesComponent {
  private readonly auth = inject(AuthService);

  protected readonly tabs = ['todos', 'pago', 'pendente', 'estornado'];
  protected readonly tab = signal<Tab>('todos');
  protected readonly payTone = OG_PAY_TONE;
  protected readonly payLabel = OG_PAY_LABEL;
  protected readonly initialsOf = initialsOf;

  protected readonly loading = signal(true);
  protected readonly tournaments = signal<OrganizerTournament[]>([]);
  protected readonly rows = signal<InscricaoRow[]>([]);

  protected readonly pendentes = computed(() => this.rows().filter((r) => r.pay === 'pendente').length);

  /** Categorias com inscrições abertas agora — soma das categorias dos torneios em status
   *  "inscricoes" entre os torneios agregados nesta tela. */
  protected readonly categoriasAbertas = computed(() =>
    this.tournaments()
      .filter((t) => t.status === 'inscricoes')
      .reduce((sum, t) => sum + t.categories.length, 0),
  );

  protected readonly filtered = computed<InscricaoRow[]>(() => {
    const t = this.tab();
    return t === 'todos' ? this.rows() : this.rows().filter((r) => r.pay === t);
  });

  constructor() {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.loading.set(false);
      return;
    }
    void this.load(uid);
  }

  private async load(uid: string): Promise<void> {
    try {
      const tournaments = (await listMyTournaments(uid)).slice(0, MAX_INSCRITOS_FETCH);
      this.tournaments.set(tournaments);

      const lists = await Promise.all(tournaments.map((t) => listInscriptions(t.id)));
      const rows: InscricaoRow[] = [];
      tournaments.forEach((t, i) => {
        const categoryNames = new Map(t.categories.map((c) => [c.id, c.name]));
        for (const insc of lists[i] ?? []) {
          rows.push({
            id: insc.id,
            name: insc.teamName,
            evento: t.name,
            categoria: (insc.categoryId && categoryNames.get(insc.categoryId)) || '—',
            pay: insc.paid ? 'pago' : 'pendente',
            date: insc.createdAt ? SHORT_DATE.format(insc.createdAt) : '—',
            createdAt: insc.createdAt,
          });
        }
      });
      rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      this.rows.set(rows);
    } finally {
      this.loading.set(false);
    }
  }
}
