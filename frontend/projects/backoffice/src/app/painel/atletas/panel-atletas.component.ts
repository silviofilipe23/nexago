import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { callableErrorMessage } from '../data/callable-error';
import type { BackofficeUser } from '../organizadores/data/organizers.repository';
import { roleLabels, userDisplayName } from '../organizadores/role-subject';
import { ConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { FieldComponent } from '../ui/field.component';
import { IconComponent } from '../ui/icon.component';
import { KpiMiniComponent } from '../ui/kpi-mini.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { AthletesRepository } from './data/athletes.repository';

type LoadState = 'loading' | 'ok' | 'error';

interface ProDecision {
  user: BackofficeUser;
  isPro: boolean;
}

/** Contas de atleta: busca no Auth e controle do status PRO. */
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
            placeholder="Nome, e-mail ou UID — Enter para buscar"
            aria-label="Buscar conta"
            [value]="term()"
            (input)="term.set(value($event))"
            (keydown.enter)="reload()"
          />
          @if (term()) {
            <button type="button" class="clear" aria-label="Limpar busca" (click)="clearSearch()">✕</button>
          }
        </div>
        <button type="button" class="bo-mini-btn" (click)="reload()">Buscar</button>
      </div>

      <div class="body">
        @if (feedback(); as message) {
          <div class="bo-feedback">
            <bo-icon name="check" [size]="15" />
            <span>{{ message }}</span>
          </div>
        }

        <div class="kpi-grid">
          <bo-kpi-mini label="Contas carregadas" [value]="loadedCount()" />
          <bo-kpi-mini label="PRO nesta lista" [value]="proCount()" tone="green" />
          <bo-kpi-mini label="Desativadas" [value]="disabledCount()" />
          <bo-kpi-mini label="E-mail pendente" [value]="unverifiedCount()" />
        </div>

        <bo-panel-card
          pad="sm"
          [kicker]="term() ? 'busca: ' + term() : 'ordem do firebase auth'"
          title="Contas"
        >
          @if (state() === 'error') {
            <div class="bo-alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ errorMessage() }}</span>
            </div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else {
            <div class="table-head">
              <span>Pessoa</span>
              <span>Papéis</span>
              <span>PRO</span>
              <span>E-mail</span>
              <span>Status</span>
              <span></span>
            </div>

            <div>
              @for (row of rows(); track row.uid) {
                <div class="table-row">
                  <div class="cell-who">
                    <div class="who-name">{{ name(row) }}</div>
                    <div class="who-id">{{ row.email || row.uid }}</div>
                  </div>
                  <div class="cell-roles">{{ roles(row) }}</div>
                  <div>
                    @if (isPro(row)) {
                      <bo-pill tone="green">PRO</bo-pill>
                    } @else {
                      <span class="cell-dim">—</span>
                    }
                  </div>
                  <div>
                    <bo-pill [tone]="row.emailVerified ? 'green' : 'yellow'">
                      {{ row.emailVerified ? 'Verificado' : 'Pendente' }}
                    </bo-pill>
                  </div>
                  <div>
                    <bo-pill [tone]="row.disabled ? 'red' : 'green'">
                      {{ row.disabled ? 'Desativada' : 'Ativa' }}
                    </bo-pill>
                  </div>
                  <div class="right">
                    <button type="button" class="bo-ghost-btn" (click)="askPro(row, !isPro(row))">
                      {{ isPro(row) ? 'Remover PRO' : 'Tornar PRO' }}
                    </button>
                  </div>
                </div>
              } @empty {
                @if (state() === 'loading') {
                  <p class="status">Carregando contas…</p>
                } @else {
                  <p class="status">
                    @if (term()) {
                      Nenhuma conta encontrada para “{{ term() }}”.
                    } @else {
                      Nenhuma conta neste projeto.
                    }
                  </p>
                }
              }
            </div>

            @if (nextPageToken()) {
              <button
                type="button"
                class="bo-mini-btn more"
                [disabled]="state() === 'loading'"
                (click)="loadMore()"
              >
                {{ state() === 'loading' ? 'Carregando…' : 'Carregar mais' }}
              </button>
            }
          }
        </bo-panel-card>
      </div>

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
          (dismissed)="cancelPro()"
        >
          @if (target.isPro) {
            <bo-field label="PRO até" hint="Em branco = sem prazo definido">
              <input type="date" class="bo-input" [value]="expiry()" (input)="expiry.set(value($event))" />
            </bo-field>
          }
        </bo-confirm-dialog>
      }
    </bo-panel-shell>
  `,
  styles: `
    .search {
      flex: 1;
      max-width: 420px;
      height: 34px;
      padding: 0 12px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      display: flex;
      align-items: center;
      gap: 9px;
      color: var(--nx-text-dim);
    }

    .search:focus-within {
      border-color: rgba(255, 106, 26, 0.5);
    }

    .search-input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }

    .clear {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--nx-text-dim);
      font: inherit;
      padding: 0 2px;
    }

    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .status {
      margin: 16px 0 4px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .retry,
    .more {
      align-self: flex-start;
      margin-top: 14px;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 2fr 1.3fr 70px 110px 110px 130px;
      gap: 10px;
      align-items: center;
    }

    .table-head {
      padding: 0 4px 10px;
      border-bottom: 1px solid var(--nx-line-strong);
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-row {
      padding: 11px 4px;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .right {
      text-align: right;
    }

    .cell-who {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .who-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .who-id {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-roles {
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .cell-dim {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-dim);
    }

    @media (max-width: 720px) {
      .kpi-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class PanelAtletasComponent {
  private readonly repository = inject(AthletesRepository);

  protected readonly name = userDisplayName;

  protected readonly term = signal('');
  protected readonly rows = signal<readonly BackofficeUser[]>([]);
  protected readonly nextPageToken = signal<string | null>(null);
  protected readonly pro = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');

  protected readonly proTarget = signal<ProDecision | null>(null);
  protected readonly expiry = signal('');
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly feedback = signal<string | null>(null);

  constructor() {
    void this.reload();
  }

  protected readonly loadedCount = computed(() =>
    this.state() === 'error' ? '—' : String(this.rows().length),
  );
  protected readonly proCount = computed(() =>
    this.state() === 'error' ? '—' : String(this.rows().filter((r) => this.isPro(r)).length),
  );
  protected readonly disabledCount = computed(() =>
    this.state() === 'error' ? '—' : String(this.rows().filter((r) => r.disabled).length),
  );
  protected readonly unverifiedCount = computed(() =>
    this.state() === 'error' ? '—' : String(this.rows().filter((r) => !r.emailVerified).length),
  );

  protected readonly subtitle = computed(() => {
    if (this.state() === 'loading' && this.rows().length === 0) {
      return 'Carregando contas…';
    }
    if (this.state() === 'error') {
      return 'Não foi possível carregar as contas';
    }
    const total = this.rows().length;
    const more = this.nextPageToken() ? '+' : '';
    return `${total}${more} ${total === 1 ? 'conta carregada' : 'contas carregadas'}`;
  });

  protected isPro(row: BackofficeUser): boolean {
    return this.pro().has(row.uid);
  }

  protected roles(row: BackofficeUser): string {
    return roleLabels(row.roles) || '—';
  }

  protected clearSearch(): void {
    this.term.set('');
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.state.set('loading');
    this.rows.set([]);
    this.nextPageToken.set(null);
    try {
      const [page, pro] = await Promise.all([
        this.repository.listUsers(this.term(), null),
        this.loadPro(),
      ]);
      this.rows.set(page.rows);
      this.nextPageToken.set(page.nextPageToken);
      this.pro.set(pro);
      this.state.set('ok');
    } catch (err) {
      this.errorMessage.set(callableErrorMessage(err));
      this.state.set('error');
    }
  }

  protected async loadMore(): Promise<void> {
    const token = this.nextPageToken();
    if (!token || this.state() === 'loading') {
      return;
    }
    this.state.set('loading');
    try {
      const page = await this.repository.listUsers(this.term(), token);
      this.rows.update((current) => [...current, ...page.rows]);
      this.nextPageToken.set(page.nextPageToken);
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

  protected askPro(user: BackofficeUser, isPro: boolean): void {
    this.submitError.set(null);
    this.feedback.set(null);
    this.expiry.set('');
    this.proTarget.set({ user, isPro });
  }

  protected cancelPro(): void {
    if (this.submitting()) {
      return;
    }
    this.proTarget.set(null);
  }

  protected async confirmPro(): Promise<void> {
    const target = this.proTarget();
    if (!target || this.submitting()) {
      return;
    }
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

  /** " até 31/12/2026" ou vazio quando o PRO fica sem prazo. */
  private expiryLabel(): string {
    const raw = this.expiry();
    if (!raw) {
      return '';
    }
    const [year, month, day] = raw.split('-');
    return day && month && year ? ` até ${day}/${month}/${year}` : '';
  }

  /** `expiresAt` do callable é epoch em segundos; o input date devolve YYYY-MM-DD. */
  private expiresAtSeconds(): number | undefined {
    const raw = this.expiry();
    if (!raw) {
      return undefined;
    }
    const parsed = new Date(`${raw}T23:59:59`);
    return Number.isNaN(parsed.getTime()) ? undefined : Math.floor(parsed.getTime() / 1000);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
