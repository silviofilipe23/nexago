import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { initialsOf, truncateName, type PillTone } from '../data/mock-data';
import { listInscriptions } from '../data/inscriptions-repository';
import { confirmRegistrationPayment, moveToWaitlist, removeFromCategory, resendRegistrationPayment } from '../data/organizer-ops.service';
import type { OrganizerTournament } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';

/** Status da linha no vocabulário real do schema (`isPaid`/`waitlist`) — "estorno" não existe
 *  no backend, então a aba do protótipo foi trocada por "espera" (fila real). */
type PayStatus = 'pago' | 'pendente' | 'espera';
type Tab = 'todos' | PayStatus;

const PAY_TONE: Record<PayStatus, PillTone> = { pago: 'green', pendente: 'yellow', espera: 'dim' };
const PAY_LABEL: Record<PayStatus, string> = { pago: 'Pago', pendente: 'Pendente', espera: 'Espera' };

/** Aceite do termo de uso de imagem/LGPD registrado na inscrição: `aceito` = todos os atletas,
 *  `parcial` = só parte da dupla, `pendente` = ninguém (inclui inscrições antigas, feitas antes
 *  do termo existir no fluxo). */
type LgpdStatus = 'aceito' | 'parcial' | 'pendente';

const LGPD_TONE: Record<LgpdStatus, PillTone> = { aceito: 'green', parcial: 'yellow', pendente: 'dim' };
const LGPD_LABEL: Record<LgpdStatus, string> = { aceito: 'Aceito', parcial: 'Parcial', pendente: 'Pendente' };

interface InscricaoAthlete {
  name: string;
  photoUrl: string | null;
}

interface InscricaoRow {
  id: string;
  name: string;
  athletes: InscricaoAthlete[];
  categoriaId: string | null;
  categoria: string;
  pay: PayStatus;
  lgpd: LgpdStatus;
  /** Tooltip da pílula LGPD — em `parcial`, diz quem ainda não aceitou. */
  lgpdTitle: string;
  date: string;
  createdAt: Date | null;
}

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

/** Inscrições do torneio em contexto (nível 2 da cascata), com as MESMAS ações do app
 *  (`organizer_category_ops_service.dart`): confirmar pagamento manual, mover pra lista de
 *  espera, remover da categoria e reenviar cobrança — todas via Cloud Functions com validação
 *  no servidor. O torneio vem da rota (`/painel/eventos/:id/inscricoes`); o filtro por
 *  categoria são os chips no topo, espelhando o protótipo da cascata. */
@Component({
  selector: 'og-inscricoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgChartTabsComponent, OgIconComponent, OgPillComponent, OgAvatarComponent, NxSpinnerComponent],
  template: `
    <og-page-header title="Inscrições" [subtitle]="headerSubtitle()">
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
          <div class="og-kpi-label">Categorias</div>
          <div class="og-kpi-value sm">{{ categorias().length }}</div>
        </og-card>
      </div>

      @if (feedback(); as fb) {
        <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
      }

      @if (categorias().length > 0) {
        <div class="og-filter-bar">
          <button type="button" class="og-chip" [class.active]="categoryFilter() === null" (click)="categoryFilter.set(null)">
            Todas ({{ rows().length }})
          </button>
          @for (c of categorias(); track c.id) {
            <button type="button" class="og-chip" [class.active]="categoryFilter() === c.id" (click)="categoryFilter.set(c.id)">
              {{ c.name }} · {{ countOf(c.id) }}
            </button>
          }
        </div>
      }

      <og-chart-tabs [tabs]="tabs" [active]="tab()" (changed)="tab.set($any($event))" />

      <og-card pad="0" flex="1">
        <div class="og-table-head">
          <span style="flex:1.4">Atleta / Dupla</span>
          <span style="flex:1">Categoria</span>
          <span style="width:70px">Data</span>
          <span style="width:110px">Pagamento</span>
          <span style="width:90px">LGPD</span>
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
              <div class="og-row" style="flex-wrap:wrap">
                <span class="og-inscricoes-avatars" [style.width.px]="r.athletes.length > 1 ? 85 : 52">
                  @for (a of r.athletes; track $index; let i = $index) {
                    <og-avatar
                      [initials]="initialsOf(a.name)"
                      [photoUrl]="a.photoUrl"
                      [size]="52"
                      [style.margin-left.px]="i ? -16 : 0"
                      [style.z-index]="r.athletes.length - i"
                    />
                  }
                </span>
                <span style="flex:1.4;min-width:0">
                  <div class="og-inscricoes-name" [title]="r.name">{{ truncate(r.name, 32) }}</div>
                </span>
                <span style="flex:1" class="og-inscricoes-cat">{{ r.categoria }}</span>
                <span style="width:70px" class="og-inscricoes-date">{{ r.date }}</span>
                <span style="width:110px"><og-pill [tone]="payTone[r.pay]">{{ payLabel[r.pay] }}</og-pill></span>
                <span style="width:90px" [title]="r.lgpdTitle"><og-pill [tone]="lgpdTone[r.lgpd]">{{ lgpdLabel[r.lgpd] }}</og-pill></span>
                <button type="button" class="og-ghost-btn" (click)="toggleActions(r.id)">{{ actionsFor() === r.id ? 'Fechar' : 'Ações' }}</button>
                @if (actionsFor() === r.id) {
                  <div class="og-inscricoes-actions">
                    @if (r.pay !== 'pago') {
                      <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="confirmPayment(r)">
                        @if (busyKey() === 'confirm:' + r.id) {
                          <app-nx-spinner [size]="12" />
                        }
                        {{ busyKey() === 'confirm:' + r.id ? 'Confirmando…' : 'Confirmar pagamento' }}
                      </button>
                      <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="resend(r)">
                        @if (busyKey() === 'resend:' + r.id) {
                          <app-nx-spinner [size]="12" />
                        }
                        {{ busyKey() === 'resend:' + r.id ? 'Reenviando…' : 'Reenviar cobrança' }}
                      </button>
                    }
                    @if (r.pay !== 'espera') {
                      <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="toWaitlist(r)">
                        @if (busyKey() === 'waitlist:' + r.id) {
                          <app-nx-spinner [size]="12" />
                        }
                        {{ busyKey() === 'waitlist:' + r.id ? 'Movendo…' : 'Mover pra espera' }}
                      </button>
                    }
                    <button type="button" class="og-ghost-btn danger" [disabled]="busy()" (click)="remove(r)">
                      @if (busyKey() === 'remove:' + r.id) {
                        <app-nx-spinner [size]="12" />
                      }
                      {{ busyKey() === 'remove:' + r.id ? 'Removendo…' : 'Remover da categoria' }}
                    </button>
                  </div>
                }
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
    .og-inscricoes-avatars {
      display: flex;
      align-items: center;
      flex: none;
      height: 34px;
    }
    .og-inscricoes-avatars .og-avatar {
      box-shadow: 0 0 0 2px var(--nx-surface-0);
    }
    .og-inscricoes-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-inscricoes-cat {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .og-inscricoes-date {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .og-inscricoes-actions {
      width: 100%;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      padding: 10px 0 4px 44px;
    }
    .og-ghost-btn.danger {
      color: var(--nx-live);
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
  readonly id = input<string>('');

  protected readonly tabs = ['todos', 'pago', 'pendente', 'espera'];
  protected readonly tab = signal<Tab>('todos');
  protected readonly categoryFilter = signal<string | null>(null);
  protected readonly payTone = PAY_TONE;
  protected readonly payLabel = PAY_LABEL;
  protected readonly lgpdTone = LGPD_TONE;
  protected readonly lgpdLabel = LGPD_LABEL;
  protected readonly initialsOf = initialsOf;
  protected readonly truncate = truncateName;

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  /** Qual ação/inscrição está processando (`'confirm:<id>'` etc.) — o botão certo mostra spinner. */
  protected readonly busyKey = signal<string | null>(null);
  protected readonly actionsFor = signal<string | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly rows = signal<InscricaoRow[]>([]);

  protected readonly categorias = computed(() => this.tournament()?.categories ?? []);
  protected readonly pendentes = computed(() => this.rows().filter((r) => r.pay === 'pendente').length);

  protected readonly headerSubtitle = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const pend = this.pendentes();
    return `${t.name} · ${this.rows().length} inscrições${pend > 0 ? ` · ${pend} pendentes` : ''}`;
  });

  protected readonly filtered = computed<InscricaoRow[]>(() => {
    const tab = this.tab();
    const cat = this.categoryFilter();
    return this.rows().filter((r) => (tab === 'todos' || r.pay === tab) && (cat === null || r.categoriaId === cat));
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      this.tournament.set(null);
      this.rows.set([]);
      this.categoryFilter.set(null);
      if (!tid) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      void this.load(tid);
    });
  }

  private async load(tid: string): Promise<void> {
    try {
      const [tournament, inscriptions] = await Promise.all([getTournament(tid), listInscriptions(tid)]);
      this.tournament.set(tournament);
      const categoryNames = new Map((tournament?.categories ?? []).map((c) => [c.id, c.name]));
      const rows: InscricaoRow[] = inscriptions.map((insc) => {
        const athletes: InscricaoAthlete[] =
          insc.participants.length > 0
            ? insc.participants.map((p) => ({ name: p.name, photoUrl: p.photoUrl }))
            : [{ name: insc.teamName, photoUrl: null }];
        const accepted = new Set(insc.lgpdAcceptedUids);
        const missing = insc.participants.filter((p) => !accepted.has(p.uid));
        const lgpd: LgpdStatus =
          insc.participants.length > 0 && missing.length === 0
            ? 'aceito'
            : missing.length < insc.participants.length
              ? 'parcial'
              : 'pendente';
        const lgpdTitle =
          lgpd === 'aceito'
            ? 'Termo de uso de imagem/LGPD aceito por todos os atletas'
            : lgpd === 'parcial'
              ? `Sem aceite do termo LGPD: ${missing.map((p) => p.name).join(', ')}`
              : 'Nenhum aceite do termo de uso de imagem/LGPD registrado nesta inscrição';
        return {
          id: insc.id,
          name: insc.teamName,
          athletes: athletes.slice(0, 2),
          categoriaId: insc.categoryId,
          categoria: (insc.categoryId && categoryNames.get(insc.categoryId)) || '—',
          pay: insc.paid ? 'pago' : insc.paymentStatus === 'waitlist' ? 'espera' : 'pendente',
          lgpd,
          lgpdTitle,
          date: insc.createdAt ? SHORT_DATE.format(insc.createdAt) : '—',
          createdAt: insc.createdAt,
        };
      });
      rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      this.rows.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  protected countOf(categoryId: string): number {
    return this.rows().filter((r) => r.categoriaId === categoryId).length;
  }

  protected toggleActions(id: string): void {
    this.actionsFor.update((cur) => (cur === id ? null : id));
  }

  private async run(key: string, action: () => Promise<unknown>, okMessage: string): Promise<void> {
    this.busy.set(true);
    this.busyKey.set(key);
    this.feedback.set(null);
    try {
      await action();
      this.feedback.set({ ok: true, message: okMessage });
      this.actionsFor.set(null);
      const tid = this.id();
      if (tid) {
        this.loading.set(true);
        await this.load(tid);
      }
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Operação falhou.' });
    } finally {
      this.busy.set(false);
      this.busyKey.set(null);
    }
  }

  protected confirmPayment(r: InscricaoRow): void {
    void this.run(`confirm:${r.id}`, () => confirmRegistrationPayment(r.id), `Pagamento de ${r.name} confirmado.`);
  }

  protected toWaitlist(r: InscricaoRow): void {
    void this.run(`waitlist:${r.id}`, () => moveToWaitlist(r.id), `${r.name} movido pra lista de espera.`);
  }

  protected remove(r: InscricaoRow): void {
    if (!confirm(`Remover ${r.name} da categoria? A vaga é liberada.`)) return;
    void this.run(`remove:${r.id}`, () => removeFromCategory(r.id), `${r.name} removido da categoria.`);
  }

  protected resend(r: InscricaoRow): void {
    void this.run(`resend:${r.id}`, () => resendRegistrationPayment(r.id), `Cobrança reenviada pra ${r.name}.`);
  }
}
