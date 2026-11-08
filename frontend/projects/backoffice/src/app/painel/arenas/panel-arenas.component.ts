import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { ConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { FieldComponent } from '../ui/field.component';
import { IconComponent } from '../ui/icon.component';
import { KpiMiniComponent } from '../ui/kpi-mini.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  CRM_STATUSES,
  crmLabel,
  effectiveCrmStatus,
  isCrmStatus,
  type ArenaCrmEntry,
  type ArenaCrmStatus,
} from './data/arena-crm';
import { ArenasRepository, type ArenaPlanTier, type ArenaRow } from './data/arenas.repository';
import { ArenasDemoComponent } from './ui/arenas-demo.component';

/** Filtros com sinal real no doc da arena — não existe campo de aprovação/suspensão. */
const FILTERS = ['Todas', 'Com plano', 'Sem plano', 'Pagamento online', 'Sem quadras'] as const;

type ArenaFilter = (typeof FILTERS)[number];

type LoadState = 'loading' | 'ok' | 'error';

const PLAN_LABEL: Record<ArenaPlanTier, string> = {
  starter: 'Essencial',
  pro: 'Pro',
  elite: 'Parceiro',
};

const PLAN_TONE: Record<ArenaPlanTier, PillTone> = {
  starter: 'dim',
  pro: 'orange',
  elite: 'green',
};

/** Minúsculas e sem acento, para a busca achar "Goiania" em "Goiânia". */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Tela de Arenas: a base inteira (cadastradas + pré-cadastro) de uma vez, com o status
 * comercial de cada uma (CRM simples, em `arenaCrm`) e filtros no cliente.
 */
@Component({
  selector: 'bo-panel-arenas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiMiniComponent,
    PillComponent,
    IconComponent,
    ConfirmDialogComponent,
    FieldComponent,
    ArenasDemoComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Arenas" [subtitle]="subtitle()">
        <div class="header-actions">
          <div class="search">
            <bo-icon name="search" [size]="15" />
            <input
              type="search"
              class="search-input"
              placeholder="Nome ou cidade da arena"
              aria-label="Buscar arena"
              [value]="term()"
              (input)="term.set(value($event))"
            />
            @if (term()) {
              <button type="button" class="clear" aria-label="Limpar busca" (click)="term.set('')">✕</button>
            }
          </div>
          <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="reload()">
            <bo-icon name="swap" [size]="13" />
            Atualizar
          </button>
        </div>
      </bo-page-header>

      <div class="bo-filter-bar chips">
        <span class="bar-label">Comercial</span>
        <button type="button" class="bo-chip" [class.active]="crmFilter() === null" (click)="crmFilter.set(null)">
          Todos · {{ rows().length }}
        </button>
        @for (s of crmStatuses; track s.id) {
          <button type="button" class="bo-chip" [class.active]="crmFilter() === s.id" (click)="crmFilter.set(s.id)">
            {{ s.label }} · {{ crmCounts()[s.id] }}
          </button>
        }
      </div>

      <div class="bo-filter-bar">
        <bo-icon name="filter" [size]="14" style="color: var(--nx-text-dim); flex: none" />
        @for (f of filters; track f) {
          <button type="button" class="bo-chip" [class.active]="activeFilter() === f" (click)="activeFilter.set(f)">
            {{ f }}
          </button>
        }
      </div>

      <div class="body">
        @if (feedback(); as message) {
          <div class="bo-feedback">
            <bo-icon name="check" [size]="15" />
            <span>{{ message }}</span>
          </div>
        }

        @if (crmError()) {
          <div class="bo-alert">
            <bo-icon name="alert" [size]="16" />
            <span>Não foi possível ler o status comercial — mostrando o padrão (pré-cadastro = não contatada). Alterações podem falhar.</span>
          </div>
        }

        <div class="kpi-grid">
          <bo-kpi-mini label="Arenas na base" [value]="count(rows().length)" />
          <bo-kpi-mini label="Cadastradas (com conta)" [value]="count(claimedCount())" tone="green" />
          <bo-kpi-mini label="Pré-cadastro" [value]="count(rows().length - claimedCount())" />
          <bo-kpi-mini label="Em negociação" [value]="count(crmCounts().negotiating)" tone="yellow" />
        </div>

        <bo-panel-card pad="sm" kicker="base completa · sem paginação" title="Todas as arenas">
          @if (state() === 'error') {
            <div class="bo-alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ errorMessage() }}</span>
            </div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else {
            @if (filtered().length !== rows().length) {
              <div class="bo-results-hint">Mostrando {{ filtered().length }} de {{ rows().length }} arenas</div>
            }

            <div class="table-scroll">
              <div class="table-head">
                <span>Arena</span>
                <span>Cidade</span>
                <span>Comercial</span>
                <span>Plano</span>
                <span class="right">Quadras</span>
                <span class="right">Nota</span>
                <span>Pagamento</span>
              </div>

              @for (arena of filtered(); track arena.id) {
                <div class="table-row">
                  <div class="cell-name">
                    <span class="name">{{ arena.name }}</span>
                    @if (arena.unclaimed) {
                      <span class="tag">pré-cadastro</span>
                    }
                  </div>
                  <div class="cell-city">{{ arena.city || '—' }}</div>
                  <div class="cell-crm">
                    <select
                      class="bo-select crm-select"
                      [attr.aria-label]="'Status comercial de ' + arena.name"
                      [value]="crmStatusOf(arena)"
                      [disabled]="savingId() === arena.id"
                      (change)="changeCrm(arena, $event)"
                    >
                      @for (s of crmStatuses; track s.id) {
                        <option [value]="s.id" [selected]="s.id === crmStatusOf(arena)">{{ s.label }}</option>
                      }
                    </select>
                    <button
                      type="button"
                      class="note-btn"
                      [class.has-note]="!!crmOf(arena)?.note"
                      [attr.aria-label]="'Anotação comercial de ' + arena.name"
                      [title]="crmOf(arena)?.note || 'Adicionar anotação'"
                      (click)="openNote(arena)"
                    >
                      <bo-icon name="edit" [size]="13" />
                    </button>
                  </div>
                  <div>
                    @if (arena.planTier) {
                      <bo-pill [tone]="planTone[arena.planTier]">{{ planLabel[arena.planTier] }}</bo-pill>
                    } @else {
                      <span class="cell-dim">sem plano</span>
                    }
                  </div>
                  <div class="right cell-num">{{ arena.courtsCount || '—' }}</div>
                  <div class="right cell-num">{{ rating(arena) }}</div>
                  <div>
                    @if (arena.onlinePaymentEnabled) {
                      <bo-pill tone="green">Online</bo-pill>
                    } @else {
                      <span class="cell-dim">só presencial</span>
                    }
                  </div>
                </div>
              } @empty {
                <p class="status">
                  @if (state() === 'loading') {
                    Carregando arenas…
                  } @else if (rows().length > 0) {
                    Nenhuma arena com esses filtros.
                  } @else {
                    Nenhuma arena cadastrada neste projeto.
                  }
                </p>
              }
            </div>
          }
        </bo-panel-card>

        <bo-arenas-demo />
      </div>

      @if (noteTarget(); as target) {
        <bo-confirm-dialog
          [open]="true"
          [title]="'Anotação · ' + target.name"
          [description]="'Status atual: ' + crmLabelOf(crmStatusOf(target)) + '. A anotação só aparece no backoffice.'"
          confirmLabel="Salvar anotação"
          tone="primary"
          [busy]="savingId() === target.id"
          [error]="noteError()"
          (confirmed)="saveNote(target)"
          (dismissed)="noteTarget.set(null)"
        >
          <bo-field label="Anotação" hint="Até 500 caracteres — ex.: falar com o dono na terça">
            <textarea class="bo-input note-input" rows="4" maxlength="500" [value]="noteDraft()" (input)="noteDraft.set(value($event))"></textarea>
          </bo-field>
        </bo-confirm-dialog>
      }
    </bo-panel-shell>
  `,
  styles: `
    .chips { flex-wrap: wrap; }
    .header-actions { display: flex; align-items: center; gap: 10px; }
    .search {
      width: 280px; height: 34px; padding: 0 12px; display: flex; align-items: center; gap: 9px;
      background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-2);
      color: var(--nx-text-dim);
    }
    .search:focus-within { border-color: rgba(255, 106, 26, 0.5); }
    .search-input {
      flex: 1; min-width: 0; background: transparent; border: none; outline: none;
      color: var(--nx-text); font-family: var(--nx-font-ui); font-size: 13px;
    }
    .clear { background: transparent; border: none; cursor: pointer; color: var(--nx-text-dim); font: inherit; padding: 0 2px; }
    .bar-label {
      font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--nx-text-dim); flex: none;
    }
    .body { flex: 1; padding: 22px 32px 28px; display: flex; flex-direction: column; gap: 16px; overflow: auto; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .status { margin: 16px 0 4px; font-size: 12.5px; color: var(--nx-text-dim); }
    .retry { align-self: flex-start; margin-top: 14px; }
    .table-scroll { overflow-x: auto; }
    .table-head,
    .table-row {
      display: grid; grid-template-columns: 2fr 1.3fr 196px 100px 70px 60px 110px;
      min-width: 900px; gap: 8px; align-items: center;
    }
    .table-head { padding: 0 4px 10px; border-bottom: 1px solid var(--nx-line-strong); }
    .table-head span {
      font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--nx-text-dim);
    }
    .right { text-align: right; }
    .table-row { padding: 9px 4px; border-bottom: 1px solid var(--nx-line); }
    .table-row:last-child { border-bottom: none; }
    .cell-name { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .name {
      font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .tag {
      font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--nx-text-dim);
    }
    .cell-city { min-width: 0; font-size: 12.5px; color: var(--nx-text-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cell-crm { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .crm-select { flex: 1; min-width: 0; height: 30px; font-size: 12px; }
    .note-btn {
      flex: none; width: 28px; height: 28px; display: grid; place-items: center; cursor: pointer;
      background: transparent; border: 1px solid var(--nx-line); border-radius: var(--nx-r-2); color: var(--nx-text-dim);
    }
    .note-btn.has-note { color: var(--nx-orange-500); border-color: rgba(255, 106, 26, 0.45); }
    .note-input { width: 100%; resize: vertical; min-height: 90px; padding: 8px 10px; }
    .cell-num { font-family: var(--nx-font-mono); font-size: 12.5px; color: var(--nx-text); }
    .cell-dim { font-family: var(--nx-font-mono); font-size: 11.5px; color: var(--nx-text-dim); }
    @media (max-width: 720px) {
      .kpi-grid { grid-template-columns: 1fr 1fr; }
      .search { width: 100%; }
    }
  `,
})
export class PanelArenasComponent {
  private readonly repository = inject(ArenasRepository);
  private readonly auth = inject(AuthService);

  protected readonly filters = FILTERS;
  protected readonly crmStatuses = CRM_STATUSES;
  protected readonly planLabel = PLAN_LABEL;
  protected readonly planTone = PLAN_TONE;
  protected readonly crmLabelOf = crmLabel;

  protected readonly term = signal('');
  protected readonly activeFilter = signal<ArenaFilter>('Todas');
  protected readonly crmFilter = signal<ArenaCrmStatus | null>(null);
  protected readonly rows = signal<readonly ArenaRow[]>([]);
  protected readonly crm = signal<ReadonlyMap<string, ArenaCrmEntry>>(new Map());
  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly savingId = signal<string | null>(null);
  protected readonly feedback = signal<string | null>(null);
  protected readonly noteTarget = signal<ArenaRow | null>(null);
  protected readonly noteDraft = signal('');
  protected readonly noteError = signal<string | null>(null);
  protected readonly crmError = signal(false);

  constructor() {
    void this.reload();
  }

  protected readonly claimedCount = computed(() => this.rows().filter((a) => !a.unclaimed).length);

  protected readonly crmCounts = computed(() => {
    const counts: Record<ArenaCrmStatus, number> = {
      not_contacted: 0,
      contacted: 0,
      negotiating: 0,
      not_interested: 0,
      registered: 0,
    };
    for (const arena of this.rows()) {
      counts[this.crmStatusOf(arena)]++;
    }
    return counts;
  });

  protected readonly filtered = computed<readonly ArenaRow[]>(() => {
    const q = fold(this.term().trim());
    const crmFilter = this.crmFilter();
    return this.rows().filter((a) => {
      if (q && !fold(`${a.name} ${a.city ?? ''}`).includes(q)) return false;
      if (crmFilter && this.crmStatusOf(a) !== crmFilter) return false;
      switch (this.activeFilter()) {
        case 'Com plano':
          return a.planTier != null;
        case 'Sem plano':
          return a.planTier == null;
        case 'Pagamento online':
          return a.onlinePaymentEnabled;
        case 'Sem quadras':
          return a.courtsCount === 0;
        default:
          return true;
      }
    });
  });

  protected readonly subtitle = computed(() => {
    if (this.state() === 'loading' && this.rows().length === 0) {
      return 'Carregando arenas…';
    }
    if (this.state() === 'error') {
      return 'Não foi possível carregar as arenas';
    }
    const total = this.rows().length;
    const claimed = this.claimedCount();
    return `${total} na base · ${claimed} com conta`;
  });

  protected count(value: number): string {
    return this.state() === 'ok' ? String(value) : '—';
  }

  protected crmOf(arena: ArenaRow): ArenaCrmEntry | undefined {
    return this.crm().get(arena.id);
  }

  protected crmStatusOf(arena: ArenaRow): ArenaCrmStatus {
    return effectiveCrmStatus(arena.unclaimed, this.crm().get(arena.id));
  }

  protected rating(arena: ArenaRow): string {
    return arena.reviewsCount > 0 ? arena.ratingAverage.toFixed(1).replace('.', ',') : '—';
  }

  protected async reload(): Promise<void> {
    this.state.set('loading');
    try {
      // O CRM é complementar: se a leitura falhar (ex.: regra ainda não publicada), a lista
      // aparece com o status padrão e o aviso, em vez de sumir a tela inteira.
      const [rows, crm] = await Promise.all([
        this.repository.listAll(),
        this.repository.crmEntries().catch(() => null),
      ]);
      this.rows.set(rows);
      this.crm.set(crm ?? new Map());
      this.crmError.set(crm == null);
      this.state.set('ok');
    } catch (err) {
      this.errorMessage.set(this.messageOf(err));
      this.state.set('error');
    }
  }

  protected async changeCrm(arena: ArenaRow, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const status = select.value;
    if (!isCrmStatus(status) || status === this.crmStatusOf(arena)) {
      return;
    }
    try {
      await this.save(arena, status, this.crmOf(arena)?.note ?? null);
      this.flash(`${arena.name}: ${crmLabel(status)}.`);
    } catch (err) {
      // Volta o select para o valor gravado: a tela nunca mostra status que não foi salvo.
      select.value = this.crmStatusOf(arena);
      this.flash(`Não foi possível salvar o status de ${arena.name}: ${this.messageOf(err)}`);
    }
  }

  protected openNote(arena: ArenaRow): void {
    this.noteDraft.set(this.crmOf(arena)?.note ?? '');
    this.noteError.set(null);
    this.noteTarget.set(arena);
  }

  protected async saveNote(arena: ArenaRow): Promise<void> {
    try {
      await this.save(arena, this.crmStatusOf(arena), this.noteDraft());
      this.noteTarget.set(null);
      this.flash(`Anotação de ${arena.name} salva.`);
    } catch (err) {
      this.noteError.set(this.messageOf(err));
    }
  }

  private async save(arena: ArenaRow, status: ArenaCrmStatus, note: string | null): Promise<void> {
    const user = this.auth.user();
    if (!user) {
      throw new Error('Sessão expirada. Entre novamente.');
    }
    const name = this.auth.displayName() || user.email || user.uid;
    this.savingId.set(arena.id);
    try {
      await this.repository.setCrmStatus(arena.id, status, note, { uid: user.uid, name });
      const cleanNote = note?.trim() ? note.trim().slice(0, 500) : null;
      this.crm.update((current) => {
        const next = new Map(current);
        next.set(arena.id, { status, note: cleanNote, updatedAtMs: Date.now(), updatedByName: name });
        return next;
      });
    } finally {
      this.savingId.set(null);
    }
  }

  private flash(message: string): void {
    this.feedback.set(message);
    setTimeout(() => {
      if (this.feedback() === message) this.feedback.set(null);
    }, 4000);
  }

  private messageOf(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    if (code.includes('permission-denied')) {
      return 'Sem permissão (a regra do CRM de arenas já foi publicada?).';
    }
    return err instanceof Error ? err.message : 'Falha ao ler as arenas.';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }
}
