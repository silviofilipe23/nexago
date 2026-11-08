import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { athleteSportLabel, levelDisplayLabel } from '@nexago/levels';
import { callableErrorMessage } from '../data/callable-error';
import { roleLabels, userDisplayName, userInitials } from '../organizadores/role-subject';
import { ConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { FieldComponent } from '../ui/field.component';
import { IconComponent } from '../ui/icon.component';
import { KpiMiniComponent } from '../ui/kpi-mini.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PhotoViewerComponent } from '../ui/photo-viewer.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { AthleteLevelDialogComponent } from './athlete-level-dialog.component';
import {
  AthletesRepository,
  type AthleteBaseRow,
  type AthleteBaseStatus,
  type AthleteBaseSummary,
  type AthleteLevelChange,
} from './data/athletes.repository';

type LoadState = 'loading' | 'ok' | 'error';
type SortKey = 'recent' | 'seen' | 'name';

interface ProDecision {
  user: AthleteBaseRow;
  isPro: boolean;
}

const STATUS: Record<AthleteBaseStatus, { label: string; tone: PillTone }> = {
  active: { label: 'Ativo', tone: 'green' },
  incomplete: { label: 'Cadastro incompleto', tone: 'yellow' },
  never_signed_in: { label: 'Nunca entrou', tone: 'yellow' },
  inactive: { label: 'Inativa', tone: 'dim' },
  disabled: { label: 'Desativada', tone: 'red' },
};

const STATUS_ORDER: readonly AthleteBaseStatus[] = ['active', 'incomplete', 'never_signed_in', 'inactive', 'disabled'];

/** Minúsculas e sem acento: "brunao" acha "Brunão". */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const DAY_MS = 86_400_000;

/**
 * Atletas: a base inteira de uma vez (sem "Carregar mais"), com a situação real de cada conta,
 * busca/filtro no cliente, marca manual de inativa, PRO e troca de nível.
 */
@Component({
  selector: 'bo-panel-atletas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiMiniComponent,
    PillComponent,
    IconComponent,
    FieldComponent,
    ConfirmDialogComponent,
    AthleteLevelDialogComponent,
    PhotoViewerComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Atletas" [subtitle]="subtitle()">
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="reload()">
          <bo-icon name="swap" [size]="13" />
          Atualizar
        </button>
      </bo-page-header>

      <div class="bo-filter-bar">
        <div class="search">
          <bo-icon name="search" [size]="15" />
          <input
            type="search"
            class="search-input"
            placeholder="Nome, apelido, e-mail ou UID"
            aria-label="Buscar conta"
            [value]="term()"
            (input)="term.set(value($event))"
          />
          @if (term()) {
            <button type="button" class="clear" aria-label="Limpar busca" (click)="term.set('')">✕</button>
          }
        </div>
        <select class="bo-select sort" aria-label="Ordenar" [value]="sort()" (change)="sort.set(sortValue($event))">
          <option value="recent">Cadastro mais recente</option>
          <option value="seen">Visto por último</option>
          <option value="name">Nome (A–Z)</option>
        </select>
      </div>

      <div class="bo-filter-bar chips">
        <button type="button" class="bo-chip" [class.active]="statusFilter() === null" (click)="statusFilter.set(null)">
          Todas · {{ rows().length }}
        </button>
        @for (s of statusOrder; track s) {
          <button type="button" class="bo-chip" [class.active]="statusFilter() === s" (click)="statusFilter.set(s)">
            {{ statusInfo[s].label }} · {{ statusCounts()[s] }}
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

        <div class="kpi-grid">
          <bo-kpi-mini label="Contas na base" [value]="kpi('accounts')" />
          <bo-kpi-mini label="Atletas ativos" [value]="kpi('active')" tone="green" />
          <bo-kpi-mini label="Ativos · últimos 30 dias" [value]="kpi('activeSeenLast30d')" />
          <bo-kpi-mini label="Cadastro incompleto" [value]="kpi('incomplete')" tone="yellow" />
          <bo-kpi-mini label="Marcadas inativas" [value]="kpi('inactive')" />
        </div>

        <p class="rule">
          <strong>Atleta ativo</strong> = conta de atleta com cadastro completo que já entrou pelo menos uma vez,
          não marcada como inativa. Marcar inativa não bloqueia o login nem apaga dados — só tira a conta dos números.
        </p>

        <bo-panel-card pad="sm" kicker="base completa · sem paginação" title="Contas">
          @if (state() === 'error') {
            <div class="bo-alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ errorMessage() }}</span>
            </div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else {
            @if (filtered().length !== rows().length) {
              <div class="bo-results-hint">Mostrando {{ filtered().length }} de {{ rows().length }} contas</div>
            }
            <div class="table-scroll">
              <div class="table-head">
                <span>Pessoa</span>
                <span>Papéis</span>
                <span>Nível</span>
                <span>PRO</span>
                <span>Visto por último</span>
                <span>Situação</span>
                <span></span>
              </div>

              @for (row of filtered(); track row.uid) {
                <div class="table-row">
                  <div class="cell-who">
                    @if (photoOf(row); as photo) {
                      <button
                        type="button"
                        class="who-photo-btn"
                        [attr.aria-label]="'Ampliar foto de ' + name(row)"
                        (click)="photoTarget.set({ user: row, src: photo })"
                      >
                        <img class="who-photo" [src]="photo" alt="" width="36" height="36" loading="lazy" (error)="photoFailed(row.uid)" />
                      </button>
                    } @else {
                      <div class="bo-avatar who-photo" aria-hidden="true">{{ initials(row) }}</div>
                    }
                    <div class="who-text">
                      <div class="who-name">{{ name(row) }}</div>
                      @if (row.nickname) {
                        <div class="who-nick" title="Apelido">“{{ row.nickname }}”</div>
                      }
                      <div class="who-id">{{ row.email || row.uid }}</div>
                    </div>
                  </div>
                  <div class="cell-roles">{{ roles(row) }}</div>
                  <div class="cell-level">
                    @if (row.level) {
                      <bo-pill tone="dim">{{ levelLabel(row.level) }}</bo-pill>
                      <span class="who-id">{{ sportLabel(row.sportCode) }}</span>
                    } @else {
                      <span class="cell-dim">—</span>
                    }
                  </div>
                  <div>
                    @if (isPro(row)) {
                      <bo-pill tone="green">PRO</bo-pill>
                    } @else {
                      <span class="cell-dim">—</span>
                    }
                  </div>
                  <div class="cell-dim" [title]="dateTime(row.lastSeenMs)">{{ ago(row.lastSeenMs) }}</div>
                  <div [title]="inactiveTitle(row)">
                    <bo-pill [tone]="statusInfo[row.status].tone">{{ statusInfo[row.status].label }}</bo-pill>
                  </div>
                  <div class="cell-actions">
                    <button type="button" class="bo-ghost-btn" (click)="askLevel(row)">Nível</button>
                    <button type="button" class="bo-ghost-btn" (click)="askPro(row, !isPro(row))">
                      {{ isPro(row) ? 'Remover PRO' : 'Tornar PRO' }}
                    </button>
                    <button type="button" class="bo-ghost-btn" (click)="askInactive(row)">
                      {{ row.inactive ? 'Reativar' : 'Marcar inativa' }}
                    </button>
                  </div>
                </div>
              } @empty {
                <p class="status">
                  @if (state() === 'loading') {
                    Carregando a base inteira…
                  } @else if (term()) {
                    Nenhuma conta encontrada para “{{ term() }}”.
                  } @else if (rows().length > 0) {
                    Nenhuma conta nessa situação.
                  } @else {
                    Nenhuma conta neste projeto.
                  }
                </p>
              }
            </div>
          }
        </bo-panel-card>
      </div>

      @if (photoTarget(); as target) {
        <bo-photo-viewer
          [src]="target.src"
          [name]="name(target.user)"
          [nickname]="target.user.nickname"
          [detail]="target.user.email || target.user.uid"
          (dismissed)="photoTarget.set(null)"
        />
      }

      @if (levelTarget(); as target) {
        <bo-athlete-level-dialog [user]="target" (changed)="onLevelChanged(target, $event)" (dismissed)="levelTarget.set(null)" />
      }

      @if (proTarget(); as target) {
        <bo-confirm-dialog
          [open]="true"
          [title]="target.isPro ? 'Ativar PRO' : 'Remover PRO'"
          [description]="proDescription(target)"
          [confirmLabel]="target.isPro ? 'Ativar PRO' : 'Remover PRO'"
          [tone]="target.isPro ? 'primary' : 'danger'"
          [busy]="submitting()"
          [error]="submitError()"
          (confirmed)="confirmPro()"
          (dismissed)="cancelDialog()"
        >
          @if (target.isPro) {
            <bo-field label="PRO até" hint="Em branco = sem prazo definido">
              <input type="date" class="bo-input" [value]="expiry()" (input)="expiry.set(value($event))" />
            </bo-field>
          }
        </bo-confirm-dialog>
      }

      @if (inactiveTarget(); as target) {
        <bo-confirm-dialog
          [open]="true"
          [title]="target.inactive ? 'Reativar conta' : 'Marcar conta como inativa'"
          [description]="inactiveDescription(target)"
          [confirmLabel]="target.inactive ? 'Reativar' : 'Marcar inativa'"
          [tone]="target.inactive ? 'primary' : 'danger'"
          [busy]="submitting()"
          [error]="submitError()"
          (confirmed)="confirmInactive()"
          (dismissed)="cancelDialog()"
        >
          @if (!target.inactive) {
            <bo-field label="Motivo" hint="Opcional, até 300 caracteres — ex.: conta duplicada, teste, não usa mais">
              <input type="text" class="bo-input" maxlength="300" [value]="reason()" (input)="reason.set(value($event))" />
            </bo-field>
          }
        </bo-confirm-dialog>
      }
    </bo-panel-shell>
  `,
  styles: `
    .chips { flex-wrap: wrap; }
    .search {
      flex: 1; max-width: 420px; height: 34px; padding: 0 12px; display: flex; align-items: center; gap: 9px;
      background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-2); color: var(--nx-text-dim);
    }
    .search:focus-within { border-color: rgba(255, 106, 26, 0.5); }
    .search-input {
      flex: 1; min-width: 0; background: transparent; border: none; outline: none;
      color: var(--nx-text); font-family: var(--nx-font-ui); font-size: 13px;
    }
    .clear { background: transparent; border: none; cursor: pointer; color: var(--nx-text-dim); font: inherit; padding: 0 2px; }
    .sort { width: 200px; height: 34px; }
    .body { flex: 1; padding: 22px 32px 28px; display: flex; flex-direction: column; gap: 16px; overflow: auto; }
    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
    .rule { margin: -4px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-dim); }
    .rule strong { color: var(--nx-text-mute); }
    .status { margin: 16px 0 4px; font-size: 12.5px; color: var(--nx-text-dim); }
    .retry { align-self: flex-start; margin-top: 14px; }
    .table-scroll { overflow-x: auto; }
    .table-head,
    .table-row {
      display: grid; grid-template-columns: 1.6fr 1fr 124px 56px 104px 150px 300px;
      min-width: 1090px; gap: 10px; align-items: center;
    }
    .table-head { padding: 0 4px 10px; border-bottom: 1px solid var(--nx-line-strong); }
    .table-head span {
      font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--nx-text-dim);
    }
    /* Centenas de linhas: o navegador pula o layout das que estão fora da tela. */
    .table-row {
      padding: 11px 4px; border-bottom: 1px solid var(--nx-line);
      content-visibility: auto; contain-intrinsic-size: auto 62px;
    }
    .table-row:last-child { border-bottom: none; }
    .cell-actions { display: flex; justify-content: flex-end; gap: 6px; }
    .cell-actions .bo-ghost-btn { flex: none; white-space: nowrap; }
    .cell-level { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; }
    .cell-who { min-width: 0; display: flex; align-items: center; gap: 10px; }
    .who-photo {
      width: 36px; height: 36px; flex: none; border-radius: 50%; object-fit: cover;
      background: var(--nx-surface-0); border: 1px solid var(--nx-line);
    }
    .bo-avatar.who-photo { font-size: 12px; }
    .who-photo-btn { flex: none; padding: 0; border: none; border-radius: 50%; background: transparent; cursor: zoom-in; display: flex; }
    .who-photo-btn:hover .who-photo,
    .who-photo-btn:focus-visible .who-photo { outline: 2px solid var(--nx-orange-500); outline-offset: 1px; }
    .who-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .who-nick { font-size: 12px; color: var(--nx-orange-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .who-name {
      font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .who-id { font-family: var(--nx-font-mono); font-size: 9.5px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cell-roles { font-size: 12.5px; color: var(--nx-text-mute); }
    .cell-dim { font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text-dim); }
    @media (max-width: 1100px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 720px) { .kpi-grid { grid-template-columns: 1fr 1fr; } .sort { width: 100%; } }
  `,
})
export class PanelAtletasComponent {
  private readonly repository = inject(AthletesRepository);

  protected readonly name = userDisplayName;
  protected readonly initials = userInitials;
  protected readonly statusInfo = STATUS;
  protected readonly statusOrder = STATUS_ORDER;

  protected readonly term = signal('');
  protected readonly sort = signal<SortKey>('recent');
  protected readonly statusFilter = signal<AthleteBaseStatus | null>(null);
  protected readonly rows = signal<readonly AthleteBaseRow[]>([]);
  protected readonly summary = signal<AthleteBaseSummary | null>(null);
  protected readonly pro = signal<ReadonlySet<string>>(new Set<string>());
  /** Fotos que não carregaram (URL expirada/removida): a linha volta às iniciais. */
  private readonly brokenPhotos = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');

  protected readonly photoTarget = signal<{ user: AthleteBaseRow; src: string } | null>(null);
  protected readonly levelTarget = signal<AthleteBaseRow | null>(null);
  protected readonly proTarget = signal<ProDecision | null>(null);
  protected readonly inactiveTarget = signal<AthleteBaseRow | null>(null);
  protected readonly expiry = signal('');
  protected readonly reason = signal('');
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly feedback = signal<string | null>(null);

  constructor() {
    // O dashboard abre a tela já filtrada (?situacao=incomplete).
    const initial = inject(ActivatedRoute).snapshot.queryParamMap.get('situacao');
    if (initial && (STATUS_ORDER as readonly string[]).includes(initial)) {
      this.statusFilter.set(initial as AthleteBaseStatus);
    }
    void this.reload();
  }

  protected readonly statusCounts = computed(() => {
    const counts: Record<AthleteBaseStatus, number> = { active: 0, incomplete: 0, never_signed_in: 0, inactive: 0, disabled: 0 };
    for (const row of this.rows()) counts[row.status]++;
    return counts;
  });

  protected readonly filtered = computed<readonly AthleteBaseRow[]>(() => {
    const q = fold(this.term().trim());
    const status = this.statusFilter();
    const out = this.rows().filter((r) => {
      if (status && r.status !== status) return false;
      if (!q) return true;
      return fold([r.fullName, r.displayName, r.nickname, r.email, r.uid].filter(Boolean).join(' ')).includes(q);
    });
    const sort = this.sort();
    return [...out].sort((a, b) => {
      if (sort === 'name') return this.name(a).localeCompare(this.name(b), 'pt-BR');
      const key = sort === 'seen' ? 'lastSeenMs' : 'createdAtMs';
      return (b[key] ?? 0) - (a[key] ?? 0);
    });
  });

  protected readonly subtitle = computed(() => {
    const s = this.summary();
    if (this.state() === 'loading' && !s) return 'Carregando a base…';
    if (this.state() === 'error') return 'Não foi possível carregar a base';
    if (!s) return '';
    return `${s.accounts} contas · ${s.athletes} de atleta · ${s.active} ativos`;
  });

  protected kpi(key: 'accounts' | 'active' | 'activeSeenLast30d' | 'incomplete' | 'inactive'): string {
    const s = this.summary();
    if (!s || this.state() === 'error') return '—';
    // "Incompleto" no KPI soma quem nunca entrou: os dois ainda não são usuários de fato.
    return String(key === 'incomplete' ? s.incomplete + s.neverSignedIn : s[key]);
  }

  protected isPro(row: AthleteBaseRow): boolean {
    return this.pro().has(row.uid);
  }

  protected photoOf(row: AthleteBaseRow): string | null {
    return this.brokenPhotos().has(row.uid) ? null : row.photoUrl;
  }

  protected photoFailed(uid: string): void {
    this.brokenPhotos.update((current) => new Set([...current, uid]));
  }

  protected levelLabel(raw: string | null): string {
    return levelDisplayLabel(raw);
  }

  protected sportLabel(code: string | null): string {
    return code ? athleteSportLabel(code) : '';
  }

  protected roles(row: AthleteBaseRow): string {
    return roleLabels(row.roles) || '—';
  }

  protected ago(ms: number | null): string {
    if (ms == null) return '—';
    const days = Math.floor((Date.now() - ms) / DAY_MS);
    if (days <= 0) return 'hoje';
    if (days === 1) return 'ontem';
    if (days < 30) return `há ${days} dias`;
    if (days < 365) return `há ${Math.floor(days / 30)} ${Math.floor(days / 30) === 1 ? 'mês' : 'meses'}`;
    return `há ${Math.floor(days / 365)} ${Math.floor(days / 365) === 1 ? 'ano' : 'anos'}`;
  }

  protected dateTime(ms: number | null): string {
    return ms == null ? 'Sem registro' : new Date(ms).toLocaleString('pt-BR');
  }

  protected inactiveTitle(row: AthleteBaseRow): string {
    const mark = row.inactive;
    if (!mark) return '';
    const parts = [mark.reason ? `Motivo: ${mark.reason}` : 'Sem motivo informado'];
    if (mark.markedByName) parts.push(`por ${mark.markedByName}`);
    if (mark.markedAtMs) parts.push(new Date(mark.markedAtMs).toLocaleDateString('pt-BR'));
    return parts.join(' · ');
  }

  protected async reload(): Promise<void> {
    this.state.set('loading');
    this.brokenPhotos.set(new Set<string>());
    try {
      const [base, pro] = await Promise.all([this.repository.athleteBase(true), this.loadPro()]);
      this.rows.set(base.rows);
      this.summary.set(base.summary);
      this.pro.set(pro);
      this.state.set('ok');
    } catch (err) {
      this.errorMessage.set(callableErrorMessage(err));
      this.state.set('error');
    }
  }

  /** O PRO é opcional na tela: se a leitura falhar, a coluna fica vazia em vez de derrubar a lista. */
  private async loadPro(): Promise<ReadonlySet<string>> {
    try {
      return await this.repository.proUids();
    } catch {
      return new Set<string>();
    }
  }

  protected proDescription({ user, isPro }: ProDecision): string {
    const who = this.name(user);
    return isPro
      ? `${who} passa a ter os recursos PRO no app. Vale a partir de um token novo — sair e entrar de novo.`
      : `${who} perde os recursos PRO. A assinatura em si não é cancelada aqui — isso é feito no provedor de pagamento.`;
  }

  protected inactiveDescription(row: AthleteBaseRow): string {
    const who = this.name(row);
    return row.inactive
      ? `${who} volta a contar na base (ativo, se tiver cadastro completo).`
      : `${who} sai dos números de atletas ativos. A conta continua entrando no app normalmente e nenhum dado é apagado.`;
  }

  protected askLevel(user: AthleteBaseRow): void {
    this.feedback.set(null);
    this.levelTarget.set(user);
  }

  /** A linha é atualizada com a resposta do callable — o doc leva alguns segundos para refletir. */
  protected onLevelChanged(user: AthleteBaseRow, change: AthleteLevelChange): void {
    this.levelTarget.set(null);
    if (!user.sportCode || user.sportCode === change.sportCode) {
      this.patchRow(user.uid, { sportCode: change.sportCode, level: change.toLevel });
    }
    this.feedback.set(
      change.applied ?
        `${this.name(user)} agora é ${levelDisplayLabel(change.toLevel)} no ${athleteSportLabel(change.sportCode)}.` :
        `${this.name(user)} já estava nesse nível — nada mudou.`,
    );
  }

  protected askPro(user: AthleteBaseRow, isPro: boolean): void {
    this.submitError.set(null);
    this.feedback.set(null);
    this.expiry.set('');
    this.proTarget.set({ user, isPro });
  }

  protected askInactive(user: AthleteBaseRow): void {
    this.submitError.set(null);
    this.feedback.set(null);
    this.reason.set('');
    this.inactiveTarget.set(user);
  }

  protected cancelDialog(): void {
    if (this.submitting()) return;
    this.proTarget.set(null);
    this.inactiveTarget.set(null);
  }

  protected async confirmPro(): Promise<void> {
    const target = this.proTarget();
    if (!target || this.submitting()) return;
    this.submitting.set(true);
    this.submitError.set(null);
    try {
      await this.repository.setPro(target.user.uid, target.isPro, this.expiresAtSeconds());
      this.proTarget.set(null);
      this.feedback.set(
        target.isPro
          ? `${this.name(target.user)} agora é PRO${this.expiryLabel()}.`
          : `PRO removido de ${this.name(target.user)}.`,
      );
      this.pro.set(await this.loadPro());
    } catch (err) {
      this.submitError.set(callableErrorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async confirmInactive(): Promise<void> {
    const target = this.inactiveTarget();
    if (!target || this.submitting()) return;
    const inactive = !target.inactive;
    this.submitting.set(true);
    this.submitError.set(null);
    try {
      const result = await this.repository.setInactive(target.uid, inactive, inactive ? this.reason() : null);
      const mark = inactive ? { reason: result.reason, markedAtMs: Date.now(), markedByName: result.byName } : null;
      const next = { ...target, inactive: mark };
      this.patchRow(target.uid, { inactive: mark, status: this.statusOf(next) });
      this.recount();
      this.inactiveTarget.set(null);
      this.feedback.set(inactive ? `${this.name(target)} marcada como inativa.` : `${this.name(target)} reativada.`);
    } catch (err) {
      this.submitError.set(callableErrorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }

  /** Mesma precedência do servidor (`athlete-base-model.statusOf`). */
  private statusOf(row: AthleteBaseRow): AthleteBaseStatus {
    if (row.disabled) return 'disabled';
    if (row.inactive) return 'inactive';
    if (row.lastSignInMs == null) return 'never_signed_in';
    if (!row.profileComplete) return 'incomplete';
    return 'active';
  }

  private patchRow(uid: string, patch: Partial<AthleteBaseRow>): void {
    this.rows.update((rows) => rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }

  /** Depois de marcar/reativar, os KPIs refletem a lista sem reler a base inteira. */
  private recount(): void {
    const current = this.summary();
    if (!current) return;
    const athletes = this.rows().filter((r) => r.isAthlete);
    const by = (s: AthleteBaseStatus) => athletes.filter((r) => r.status === s).length;
    const active = athletes.filter((r) => r.status === 'active');
    this.summary.set({
      ...current,
      active: active.length,
      incomplete: by('incomplete'),
      neverSignedIn: by('never_signed_in'),
      inactive: by('inactive'),
      disabled: by('disabled'),
      activeSeenLast30d: active.filter((r) => r.lastSeenMs != null && Date.now() - r.lastSeenMs <= 30 * DAY_MS).length,
    });
  }

  /** " até 31/12/2026" ou vazio quando o PRO fica sem prazo. */
  private expiryLabel(): string {
    const [year, month, day] = this.expiry().split('-');
    return day && month && year ? ` até ${day}/${month}/${year}` : '';
  }

  /** `expiresAt` do callable é epoch em segundos; o input date devolve YYYY-MM-DD. */
  private expiresAtSeconds(): number | undefined {
    const raw = this.expiry();
    if (!raw) return undefined;
    const parsed = new Date(`${raw}T23:59:59`);
    return Number.isNaN(parsed.getTime()) ? undefined : Math.floor(parsed.getTime() / 1000);
  }

  protected sortValue(event: Event): SortKey {
    const v = (event.target as HTMLSelectElement).value;
    return v === 'seen' || v === 'name' ? v : 'recent';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
