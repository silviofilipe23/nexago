import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { listInscriptions } from '../data/inscriptions-repository';
import {
  confirmRegistrationPayment,
  moveToWaitlist,
  removeFromCategory,
  resendRegistrationPayment,
  respondCancellationRequest,
} from '../data/organizer-ops.service';
import type { OrganizerTournament } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import { OgConfirmDialogComponent, type ConfirmPrompt } from '../ui/confirm-dialog.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgInscricoesListComponent } from './inscricoes-list.component';
import {
  INSCRICAO_TABS,
  LGPD_LABEL,
  PAY_LABEL,
  normalizeSearch,
  type InscricaoAction,
  type InscricaoRow,
  type InscricaoTab,
  type LgpdStatus,
  type PayStatus,
} from './inscricoes.model';

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const LONG_DATE = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

/** Ação que apaga inscrição ou libera vaga pede confirmação — as outras são reversíveis. */
interface PendingConfirm {
  title: string;
  message: string;
  confirmLabel: string;
  /** Texto exigido no diálogo; `run` recebe o que foi digitado (vazio quando não há prompt). */
  prompt?: ConfirmPrompt;
  run: (value: string) => void;
}

/** Inscrições do torneio em contexto (nível 2 da cascata), com as MESMAS ações do app
 *  (`organizer_category_ops_service.dart`): confirmar pagamento manual, mover pra lista de
 *  espera, remover da categoria e reenviar cobrança — todas via Cloud Functions com validação
 *  no servidor. O torneio vem da rota (`/painel/eventos/:id/inscricoes`).
 *
 *  Este componente cuida de dados, filtros e ações; o desenho da lista é do
 *  `og-inscricoes-list`. Os contadores por situação vivem nas próprias abas de filtro — a fila
 *  de cards de KPI que existia aqui repetia números que já estavam uma linha abaixo, e empurrava
 *  a lista (que é o assunto da tela) pra fora da primeira dobra. */
@Component({
  selector: 'og-inscricoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgIconComponent, OgInscricoesListComponent, OgConfirmDialogComponent],
  template: `
    <og-page-header title="Inscrições" [subtitle]="headerSubtitle()">
      <label class="og-insc-search">
        <og-icon name="search" [size]="15" />
        <input
          type="search"
          placeholder="Buscar dupla, atleta ou categoria"
          aria-label="Buscar inscrição por dupla, atleta ou categoria"
          [value]="query()"
          (input)="onQueryInput($event)"
        />
      </label>
      <button type="button" class="og-mini-btn" [disabled]="filtered().length === 0" (click)="exportCsv()">
        <og-icon name="download" [size]="14" />Exportar
      </button>
    </og-page-header>

    <div class="og-content">
      @if (feedback(); as fb) {
        <div class="og-banner" [class.win]="fb.ok" role="status">{{ fb.message }}</div>
      }

      @if (categorias().length > 1) {
        <div class="og-filter-bar" role="group" aria-label="Filtrar por categoria">
          <button
            type="button"
            class="og-chip"
            [class.active]="categoryFilter() === null"
            [attr.aria-pressed]="categoryFilter() === null"
            (click)="categoryFilter.set(null)"
          >
            Todas ({{ rows().length }})
          </button>
          @for (c of categorias(); track c.id) {
            <button
              type="button"
              class="og-chip"
              [class.active]="categoryFilter() === c.id"
              [attr.aria-pressed]="categoryFilter() === c.id"
              (click)="categoryFilter.set(c.id)"
            >
              {{ c.name }} · {{ countOf(c.id) }}
            </button>
          }
        </div>
      }

      <div class="og-chart-tabs og-insc-tabs" role="group" aria-label="Filtrar por situação">
        @for (t of tabs; track t.id) {
          <button
            type="button"
            [class.active]="tab() === t.id"
            [attr.aria-pressed]="tab() === t.id"
            (click)="tab.set(t.id)"
          >
            {{ t.label }}
            <span class="n" [class]="countTone(t.id)">{{ countForTab(t.id) }}</span>
          </button>
        }
      </div>

      <og-inscricoes-list
        [rows]="filtered()"
        [loading]="loading()"
        [busy]="busy()"
        [busyKey]="busyKey()"
        [openId]="actionsFor()"
        [emptyTitle]="emptyTitle()"
        [emptyHint]="emptyHint()"
        [canClear]="hasFilters()"
        (toggled)="toggleActions($event)"
        (action)="onAction($event)"
        (cleared)="clearFilters()"
      />
    </div>

    @if (pendingConfirm(); as c) {
      <og-confirm-dialog
        [title]="c.title"
        [message]="c.message"
        [confirmLabel]="c.confirmLabel"
        [destructive]="true"
        [busy]="busy()"
        [prompt]="c.prompt ?? null"
        (confirmed)="c.run($event)"
        (cancelled)="pendingConfirm.set(null)"
      />
    }
  `,
  styles: `
    .og-insc-search {
      display: flex;
      align-items: center;
      gap: 9px;
      width: 268px;
      height: 38px;
      padding: 0 12px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      color: var(--nx-text-dim);
      transition: border-color var(--nx-d-fast) var(--nx-ease-out);
    }

    .og-insc-search:focus-within {
      border-color: var(--nx-line-strong);
    }

    .og-insc-search input {
      flex: 1;
      min-width: 0;
      border: none;
      outline: none;
      background: transparent;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }

    /* O anel de foco fica na caixa inteira, não só no input sem borda. */
    .og-insc-search:has(input:focus-visible) {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }

    .og-insc-tabs {
      align-self: flex-start;
    }

    .og-insc-tabs button {
      gap: 7px;
      display: inline-flex;
      align-items: center;
    }

    .og-insc-tabs .n {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
    }

    .og-insc-tabs button.active .n {
      color: var(--nx-text);
    }

    /* Contador colorido só onde há trabalho parado — é o que substituiu os cards de KPI. */
    .og-insc-tabs .n.warn {
      color: var(--nx-pending);
    }

    .og-insc-tabs .n.check {
      color: var(--nx-orange-500);
    }

    .og-insc-tabs .n.danger {
      color: var(--nx-live);
    }
  `,
})
export class InscricoesComponent {
  readonly id = input<string>('');

  protected readonly tabs = INSCRICAO_TABS;
  protected readonly tab = signal<InscricaoTab>('todos');
  protected readonly categoryFilter = signal<string | null>(null);
  protected readonly query = signal('');

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  /** Qual ação/inscrição está processando (`'confirm:<id>'` etc.) — o botão certo mostra spinner. */
  protected readonly busyKey = signal<string | null>(null);
  protected readonly actionsFor = signal<string | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly pendingConfirm = signal<PendingConfirm | null>(null);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly rows = signal<InscricaoRow[]>([]);

  protected readonly categorias = computed(() => this.tournament()?.categories ?? []);

  protected readonly headerSubtitle = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const n = this.rows().length;
    return `${t.name} · ${n} ${n === 1 ? 'inscrição' : 'inscrições'}`;
  });

  /** Recorte por categoria e busca — a base sobre a qual as abas contam. Sem isso, o número da
   *  aba diria "9 pendentes" enquanto a categoria filtrada tem só 2. */
  private readonly scoped = computed<InscricaoRow[]>(() => {
    const cat = this.categoryFilter();
    const q = normalizeSearch(this.query());
    return this.rows().filter(
      (r) => (cat === null || r.categoriaId === cat) && (q === '' || r.search.includes(q)),
    );
  });

  protected readonly filtered = computed<InscricaoRow[]>(() => {
    const tab = this.tab();
    return this.scoped().filter((r) => this.matchesTab(r, tab));
  });

  protected readonly hasFilters = computed(
    () => this.tab() !== 'todos' || this.categoryFilter() !== null || this.query().trim() !== '',
  );

  protected readonly emptyTitle = computed(() => {
    if (this.rows().length === 0) return 'Nenhuma inscrição ainda';
    const q = this.query().trim();
    if (q !== '' && this.scoped().length === 0) return `Nada encontrado para “${q}”`;
    return `Nenhuma inscrição em “${this.tabLabel(this.tab())}”`;
  });

  protected readonly emptyHint = computed(() => {
    if (this.rows().length === 0) return 'Assim que alguém se inscrever, a dupla aparece aqui.';
    const q = this.query().trim();
    if (q !== '' && this.scoped().length === 0) return 'Busque por nome da dupla, de um atleta ou da categoria.';
    return 'Troque de situação ou limpe os filtros para ver as outras inscrições.';
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      this.tournament.set(null);
      this.rows.set([]);
      this.categoryFilter.set(null);
      this.query.set('');
      this.tab.set('todos');
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
      // No modo direto o atleta DECLARA que pagou; no modo app o dinheiro entrou de verdade.
      // A legenda da linha não pode dizer a mesma coisa nos dois casos.
      const direct = tournament?.paymentMode === 'directWithOrganizer';
      const rows: InscricaoRow[] = inscriptions.map((insc) => {
        const accepted = new Set(insc.lgpdAcceptedUids);
        const athletes =
          insc.participants.length > 0
            ? insc.participants.map((p) => ({
                name: p.name,
                photoUrl: p.photoUrl,
                lgpdAccepted: accepted.has(p.uid),
              }))
            : [{ name: insc.teamName, photoUrl: null, lgpdAccepted: false }];
        const missing = insc.participants.filter((p) => !accepted.has(p.uid));
        const lgpd: LgpdStatus =
          insc.participants.length > 0 && missing.length === 0
            ? 'aceito'
            : missing.length < insc.participants.length
              ? 'parcial'
              : 'pendente';
        const pay: PayStatus = insc.needsVerification
          ? 'conferir'
          : insc.paid
            ? 'pago'
            : insc.paymentStatus === 'waitlist'
              ? 'espera'
              : 'pendente';
        // Em categoria de equipe a conta é sobre o elenco COMPLETO (teamSize), não sobre quem
        // já entrou — "1 de 4 pagaram" com 2 confirmados no elenco conta a história certa.
        const total = insc.teamSize ?? insc.participants.length;
        const partial = pay !== 'conferir' && total > 1 && insc.sharePaidCount > 0 && insc.sharePaidCount < total;
        const categoria = (insc.categoryId && categoryNames.get(insc.categoryId)) || '—';
        return {
          id: insc.id,
          name: insc.teamName,
          athletes: athletes.slice(0, 5),
          categoriaId: insc.categoryId,
          categoria,
          pay,
          payTitle:
            pay === 'conferir'
              ? 'Os atletas declararam ter pago o Pix do organizador. Confira o recebimento e confirme.'
              : '',
          payNote: partial
            ? `${insc.sharePaidCount} de ${total} ${direct ? 'declararam' : 'pagaram'}`
            : pay === 'conferir'
              ? 'Declarado pelos atletas'
              : null,
          roster:
            insc.teamSize != null && insc.partnerPending
              ? `Elenco ${insc.participants.length}/${insc.teamSize}`
              : null,
          cancelPending: insc.cancellationRequest?.status === 'pending',
          cancelReason: insc.cancellationRequest?.reason ?? '',
          lgpd,
          lgpdMissing: missing.map((p) => p.name),
          date: insc.createdAt ? SHORT_DATE.format(insc.createdAt) : '—',
          dateLong: insc.createdAt ? LONG_DATE.format(insc.createdAt) : 'Data não registrada',
          createdAt: insc.createdAt,
          search: normalizeSearch([insc.teamName, ...insc.participants.map((p) => p.name), categoria].join(' ')),
        };
      });
      rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      this.rows.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  private matchesTab(r: InscricaoRow, tab: InscricaoTab): boolean {
    if (tab === 'todos') return true;
    if (tab === 'cancelamento') return r.cancelPending;
    return r.pay === tab;
  }

  private tabLabel(tab: InscricaoTab): string {
    return INSCRICAO_TABS.find((t) => t.id === tab)?.label ?? tab;
  }

  protected countForTab(tab: InscricaoTab): number {
    return this.scoped().filter((r) => this.matchesTab(r, tab)).length;
  }

  /** Contador ganha cor só quando aponta trabalho parado — e só na aba que não está ativa,
   *  porque a ativa já tem o próprio destaque. */
  protected countTone(tab: InscricaoTab): string {
    if (this.countForTab(tab) === 0) return '';
    if (tab === 'pendente') return 'warn';
    if (tab === 'conferir') return 'check';
    if (tab === 'cancelamento') return 'danger';
    return '';
  }

  protected countOf(categoryId: string): number {
    return this.rows().filter((r) => r.categoriaId === categoryId).length;
  }

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.actionsFor.set(null);
  }

  protected clearFilters(): void {
    this.tab.set('todos');
    this.categoryFilter.set(null);
    this.query.set('');
  }

  protected toggleActions(id: string): void {
    this.actionsFor.update((cur) => (cur === id ? null : id));
  }

  protected onAction(a: InscricaoAction): void {
    const { kind, row, note } = a;
    switch (kind) {
      case 'confirm':
        void this.run(`confirm:${row.id}`, () => confirmRegistrationPayment(row.id), `Pagamento de ${row.name} confirmado.`);
        return;
      case 'resend':
        void this.run(`resend:${row.id}`, () => resendRegistrationPayment(row.id), `Cobrança reenviada pra ${row.name}.`);
        return;
      case 'waitlist':
        void this.run(`waitlist:${row.id}`, () => moveToWaitlist(row.id), `${row.name} movido pra lista de espera.`);
        return;
      case 'cancel-decline':
        void this.run(
          `cancel-decline:${row.id}`,
          () => respondCancellationRequest(row.id, false, note ?? ''),
          `Pedido de ${row.name} recusado. A inscrição foi mantida.`,
        );
        return;
      // A inscrição é DELETADA: o motivo escrito aqui é a única explicação que o atleta
      // recebe por perder a vaga (chega como notificação) — por isso é obrigatório.
      case 'remove':
        this.pendingConfirm.set({
          title: 'Remover da categoria',
          message:
            `${row.name} sai da categoria ${row.categoria} e a vaga é liberada. Não dá pra desfazer.` +
            (row.pay === 'pago' ? ' A nexaGO não estorna o valor — combine a devolução direto com o atleta.' : ''),
          confirmLabel: 'Remover',
          prompt: {
            label: 'Motivo para o atleta',
            placeholder: 'Explique por que a inscrição está sendo removida',
            minLength: 10,
            helper: 'Mínimo de 10 caracteres. O atleta recebe este texto por notificação.',
          },
          run: (description) =>
            void this.run(
              `remove:${row.id}`,
              () => removeFromCategory(row.id, description),
              `${row.name} removido da categoria. O motivo foi enviado ao atleta.`,
            ),
        });
        return;
      // Aprovar = remover a inscrição e liberar a vaga. Sem estorno: a devolução é
      // combinada fora da plataforma, e o diálogo repete isso antes do clique final.
      case 'cancel-approve':
        this.pendingConfirm.set({
          title: 'Aprovar o cancelamento',
          message: `A inscrição de ${row.name} sai e a vaga é liberada. A nexaGO não estorna o valor — combine a devolução direto com o atleta.`,
          confirmLabel: 'Aprovar e liberar vaga',
          run: () =>
            void this.run(
              `cancel-approve:${row.id}`,
              () => respondCancellationRequest(row.id, true, note ?? ''),
              `Cancelamento de ${row.name} aprovado. Combine a devolução do valor com o atleta.`,
            ),
        });
        return;
    }
  }

  private async run(key: string, action: () => Promise<unknown>, okMessage: string): Promise<void> {
    this.busy.set(true);
    this.busyKey.set(key);
    this.feedback.set(null);
    try {
      await action();
      this.pendingConfirm.set(null);
      this.feedback.set({ ok: true, message: okMessage });
      this.actionsFor.set(null);
      const tid = this.id();
      if (tid) {
        this.loading.set(true);
        await this.load(tid);
      }
    } catch (e) {
      this.pendingConfirm.set(null);
      this.feedback.set({ ok: false, message: (e as Error).message || 'Operação falhou.' });
    } finally {
      this.busy.set(false);
      this.busyKey.set(null);
    }
  }

  /** Exporta o que está na tela (mesmos filtros e busca), separado por `;` e com BOM — é assim
   *  que o Excel em pt-BR abre o arquivo já nas colunas certas e com acento. */
  protected exportCsv(): void {
    const head = ['Dupla', 'Atletas', 'Categoria', 'Inscrita em', 'Pagamento', 'Termo de imagem', 'Cancelamento'];
    const lines = this.filtered().map((r) => [
      r.name,
      r.athletes.map((a) => a.name).join(' | '),
      r.categoria,
      r.dateLong,
      PAY_LABEL[r.pay] + (r.payNote ? ` (${r.payNote})` : ''),
      LGPD_LABEL[r.lgpd],
      r.cancelPending ? `Solicitado${r.cancelReason ? `: ${r.cancelReason}` : ''}` : '',
    ]);
    const csv = [head, ...lines].map((cols) => cols.map(csvCell).join(';')).join('\r\n');
    const name = this.tournament()?.name ?? 'torneio';
    const slug = normalizeSearch(name).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'torneio';
    downloadFile(`inscricoes-${slug}.csv`, new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    this.feedback.set({ ok: true, message: `${lines.length} inscrições exportadas.` });
  }
}

function csvCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
