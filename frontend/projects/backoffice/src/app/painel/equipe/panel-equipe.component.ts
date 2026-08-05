import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
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
import { TeamRepository, generateTemporaryPassword } from './data/team.repository';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; rows: readonly BackofficeUser[] }
  | { kind: 'error'; message: string };

const SUPER_ADMIN_ONLY = 'Só o super administrador pode alterar a equipe do backoffice.';

/** Equipe do backoffice: quem tem a claim `admin` e acessa este painel. */
@Component({
  selector: 'bo-panel-equipe',
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
      <bo-page-header title="Equipe" [subtitle]="subtitle()">
        <div class="header-actions">
          <button type="button" class="bo-mini-btn" [disabled]="loading()" (click)="load()">
            <bo-icon name="swap" [size]="13" />
            Atualizar
          </button>
          <button
            type="button"
            class="bo-mini-btn bo-mini-btn-primary"
            [disabled]="!canManage()"
            [title]="canManage() ? '' : superAdminOnly"
            (click)="openCreate()"
          >
            <bo-icon name="plus" [size]="14" />
            Novo admin
          </button>
        </div>
      </bo-page-header>

      <div class="body">
        @if (feedback(); as message) {
          <div class="bo-feedback">
            <bo-icon name="check" [size]="15" />
            <span>{{ message }}</span>
          </div>
        }

        @if (!canManage()) {
          <div class="notice">
            <bo-icon name="lock" [size]="15" />
            <span>
              Você entra como administrador da plataforma e enxerga a equipe, mas criar ou remover
              acesso ao backoffice é restrito ao super administrador.
            </span>
          </div>
        }

        <div class="kpi-grid">
          <bo-kpi-mini label="Admins do backoffice" [value]="total()" />
          <bo-kpi-mini label="Contas ativas" [value]="active()" tone="green" />
          <bo-kpi-mini label="Desativadas" [value]="disabled()" [tone]="hasDisabled() ? 'red' : 'neutral'" />
          <bo-kpi-mini label="E-mail pendente" [value]="unverified()" />
        </div>

        <bo-panel-card pad="sm" kicker="claim admin" title="Quem tem acesso ao backoffice">
          @switch (state().kind) {
            @case ('loading') {
              <p class="status">Carregando equipe…</p>
            }
            @case ('error') {
              <div class="bo-alert">
                <bo-icon name="alert" [size]="16" />
                <span>{{ errorMessage() }}</span>
              </div>
              <button type="button" class="bo-mini-btn retry" (click)="load()">Tentar de novo</button>
            }
            @case ('ok') {
              <div class="table-head">
                <span>Pessoa</span>
                <span>Papéis</span>
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
                      @if (blockedReason(row); as reason) {
                        <span class="blocked" [title]="reason">{{ reason }}</span>
                      } @else {
                        <button type="button" class="bo-ghost-btn danger" (click)="askRevoke(row)">
                          Tirar acesso
                        </button>
                      }
                    </div>
                  </div>
                } @empty {
                  <p class="status">Nenhuma conta com a claim <code>admin</code> neste projeto.</p>
                }
              </div>
            }
          }
        </bo-panel-card>
      </div>

      @if (creating()) {
        <bo-confirm-dialog
          [open]="true"
          title="Novo admin do backoffice"
          description="A conta é criada já com acesso ao backoffice e senha temporária: no primeiro login o sistema exige a troca."
          confirmLabel="Criar acesso"
          [busy]="submitting()"
          [confirmDisabled]="!formValid()"
          [error]="submitError()"
          (confirmed)="confirmCreate()"
          (dismissed)="cancelCreate()"
        >
          <div class="form">
            <bo-field label="Nome completo">
              <input
                type="text"
                class="bo-input"
                autocomplete="name"
                [value]="fullName()"
                (input)="fullName.set(value($event))"
              />
            </bo-field>

            <bo-field label="E-mail" hint="Vira o login no backoffice">
              <input
                type="email"
                class="bo-input"
                autocomplete="off"
                [value]="email()"
                (input)="email.set(value($event))"
              />
            </bo-field>

            <bo-field label="Senha temporária" hint="Mínimo 6 caracteres — combine por um canal seguro">
              <div class="password-row">
                <input type="text" class="bo-input" [value]="password()" (input)="password.set(value($event))" />
                <button type="button" class="bo-mini-btn" (click)="regenerate()">Gerar</button>
              </div>
            </bo-field>
          </div>
        </bo-confirm-dialog>
      }

      @if (revokeTarget(); as target) {
        <bo-confirm-dialog
          [open]="true"
          title="Tirar acesso ao backoffice"
          [description]="revokeDescription(target)"
          confirmLabel="Tirar acesso"
          tone="danger"
          [busy]="submitting()"
          [error]="submitError()"
          (confirmed)="confirmRevoke()"
          (dismissed)="cancelRevoke()"
        />
      }
    </bo-panel-shell>
  `,
  styles: `
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
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

    .notice {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 11px 14px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text-mute);
      font-size: 12.5px;
      line-height: 1.5;
    }

    .notice bo-icon {
      flex: none;
      margin-top: 1px;
    }

    .status {
      margin: 16px 0 4px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .status code {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-mute);
    }

    .retry {
      align-self: flex-start;
      margin-top: 12px;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 2fr 1.4fr 110px 110px 130px;
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

    .blocked {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .bo-ghost-btn.danger {
      color: var(--nx-live);
      white-space: nowrap;
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .password-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .password-row .bo-input {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
    }

    @media (max-width: 720px) {
      .kpi-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class PanelEquipeComponent {
  private readonly repository = inject(TeamRepository);
  private readonly auth = inject(AuthService);

  protected readonly superAdminOnly = SUPER_ADMIN_ONLY;
  protected readonly name = userDisplayName;

  protected readonly state = signal<LoadState>({ kind: 'loading' });
  protected readonly creating = signal(false);
  protected readonly revokeTarget = signal<BackofficeUser | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly feedback = signal<string | null>(null);

  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');

  constructor() {
    void this.load();
  }

  protected readonly canManage = computed(() => this.auth.isSuperAdmin());

  protected readonly rows = computed<readonly BackofficeUser[]>(() => {
    const state = this.state();
    return state.kind === 'ok' ? state.rows : [];
  });

  protected readonly loading = computed(() => this.state().kind === 'loading');

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  });

  private readonly loaded = computed(() => this.state().kind === 'ok');
  protected readonly total = computed(() => (this.loaded() ? String(this.rows().length) : '—'));
  protected readonly active = computed(() =>
    this.loaded() ? String(this.rows().filter((r) => !r.disabled).length) : '—',
  );
  protected readonly disabled = computed(() =>
    this.loaded() ? String(this.rows().filter((r) => r.disabled).length) : '—',
  );
  protected readonly unverified = computed(() =>
    this.loaded() ? String(this.rows().filter((r) => !r.emailVerified).length) : '—',
  );
  protected readonly hasDisabled = computed(() => this.rows().some((r) => r.disabled));

  protected readonly subtitle = computed(() => {
    const state = this.state();
    if (state.kind === 'loading') {
      return 'Carregando equipe…';
    }
    if (state.kind === 'error') {
      return 'Não foi possível carregar a equipe';
    }
    const total = state.rows.length;
    return `${total} ${total === 1 ? 'conta com acesso' : 'contas com acesso'}`;
  });

  protected readonly formValid = computed(
    () =>
      this.fullName().trim().length > 2 &&
      /.+@.+\..+/.test(this.email().trim()) &&
      this.password().length >= 6,
  );

  protected async load(): Promise<void> {
    this.state.set({ kind: 'loading' });
    try {
      this.state.set({ kind: 'ok', rows: await this.repository.listAdmins() });
    } catch (err) {
      this.state.set({ kind: 'error', message: callableErrorMessage(err) });
    }
  }

  protected roles(row: BackofficeUser): string {
    return roleLabels(row.roles) || '—';
  }

  /** Mesmas travas de `removeUserRole`: ninguém tira o próprio acesso nem fica sem papel. */
  protected blockedReason(row: BackofficeUser): string {
    if (!this.canManage()) {
      return 'super admin';
    }
    if (row.uid === this.auth.user()?.uid) {
      return 'sua conta';
    }
    if (row.roles.length <= 1) {
      return 'único papel';
    }
    return '';
  }

  protected revokeDescription(row: BackofficeUser): string {
    const remaining = row.roles.filter((r) => r !== 'admin');
    return (
      `${this.name(row)} perde o acesso ao backoffice e fica com: ${roleLabels(remaining)}. ` +
      'A conta continua existindo no app. Só vale quando a pessoa pegar um token novo — sair e entrar de novo.'
    );
  }

  protected openCreate(): void {
    this.submitError.set(null);
    this.feedback.set(null);
    this.fullName.set('');
    this.email.set('');
    this.password.set(generateTemporaryPassword());
    this.creating.set(true);
  }

  protected cancelCreate(): void {
    if (this.submitting()) {
      return;
    }
    this.creating.set(false);
  }

  protected regenerate(): void {
    this.password.set(generateTemporaryPassword());
  }

  protected async confirmCreate(): Promise<void> {
    if (this.submitting() || !this.formValid()) {
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);
    try {
      await this.repository.createAdmin({
        fullName: this.fullName(),
        email: this.email(),
        temporaryPassword: this.password(),
      });
      const created = this.email().trim();
      this.creating.set(false);
      this.feedback.set(
        `Acesso criado para ${created}. Passe a senha temporária por um canal seguro — a troca é obrigatória no primeiro login.`,
      );
      await this.load();
    } catch (err) {
      this.submitError.set(callableErrorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }

  protected askRevoke(row: BackofficeUser): void {
    this.submitError.set(null);
    this.feedback.set(null);
    this.revokeTarget.set(row);
  }

  protected cancelRevoke(): void {
    if (this.submitting()) {
      return;
    }
    this.revokeTarget.set(null);
  }

  protected async confirmRevoke(): Promise<void> {
    const target = this.revokeTarget();
    if (!target || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);
    try {
      const remaining = await this.repository.revokeAdminRole(target.uid);
      this.revokeTarget.set(null);
      this.feedback.set(
        `${this.name(target)} não acessa mais o backoffice — papéis atuais: ${roleLabels(remaining) || '—'}.`,
      );
      await this.load();
    } catch (err) {
      this.submitError.set(callableErrorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
