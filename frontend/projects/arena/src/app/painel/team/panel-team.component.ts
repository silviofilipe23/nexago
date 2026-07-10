import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
import { initialsOf } from '../ui/initials';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type MemberStatus = 'ativo' | 'pendente';
type MemberRole = 'Gestor' | 'Recepção' | 'Manutenção';

interface Member {
  name: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  initials: string;
}

const ROLE_TONE: Record<MemberRole, PillTone> = {
  Gestor: 'orange',
  Recepção: 'dim',
  Manutenção: 'dim',
};

const STATUS_LABEL: Record<MemberStatus, string> = {
  ativo: 'Ativo',
  pendente: 'Convite pendente',
};

const STATUS_TONE: Record<MemberStatus, PillTone> = {
  ativo: 'green',
  pendente: 'yellow',
};

const MEMBERS: Member[] = [
  { name: 'Rafael Souza', email: 'rafael@arenacfc.com', role: 'Gestor', status: 'ativo', initials: 'RS' },
  { name: 'Bianca Alves', email: 'bianca@arenacfc.com', role: 'Recepção', status: 'ativo', initials: 'BA' },
  { name: 'Diego Farias', email: 'diego@arenacfc.com', role: 'Manutenção', status: 'ativo', initials: 'DF' },
  { name: 'Tatiane Lima', email: 'tatiane@arenacfc.com', role: 'Recepção', status: 'pendente', initials: 'TL' },
];

const ROLE_OPTIONS: { key: MemberRole; description: string }[] = [
  { key: 'Gestor', description: 'Acesso total: financeiro, equipe e configurações' },
  { key: 'Recepção', description: 'Agenda, comandas e reservas' },
  { key: 'Manutenção', description: 'Quadras e estoque, sem acesso financeiro' },
];

const ROLE_PERMISSIONS: Record<MemberRole, string[]> = {
  Gestor: ['Financeiro e relatórios', 'Equipe e configurações', 'Agenda e comandas'],
  Recepção: ['Comandas e estoque', 'Agenda e reservas'],
  Manutenção: ['Quadras e estoque'],
};

/** Tela Equipe do painel (protótipo ArEquipeScreen): KPIs e tabela de membros. */
@Component({
  selector: 'ar-panel-team',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Equipe" [subtitle]="arenaName() + ' · quem tem acesso ao painel'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="showInvite.set(true)">
          <ar-icon name="mail" [size]="14" />
          Convidar membro
        </button>
      </ar-page-header>

      <div class="body">
        <div class="kpi-row">
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Membros ativos</div>
            <div class="kpi-value">{{ activeCount() }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Convites pendentes</div>
            <div class="kpi-value tone-pending">{{ pendingCount() }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Cargos</div>
            <div class="kpi-value">{{ roleCount() }}</div>
          </ar-panel-card>
        </div>

        <ar-panel-card title="Membros da equipe" [kicker]="members().length + ' pessoas'" class="table-card">
          <div class="table-head">
            <span></span>
            <span>Nome</span>
            <span>E-mail</span>
            <span>Cargo</span>
            <span>Status</span>
            <span></span>
          </div>
          <div class="table-body">
            @for (m of members(); track m.email) {
              <div class="table-row">
                <div class="avatar">{{ m.initials }}</div>
                <div class="cell-name">{{ m.name }}</div>
                <div class="cell-email">{{ m.email }}</div>
                <div><ar-pill [tone]="roleTone[m.role]">{{ m.role }}</ar-pill></div>
                <div><ar-pill [tone]="statusTone[m.status]">{{ statusLabel[m.status] }}</ar-pill></div>
                <div class="cell-action"><button type="button" class="ar-ghost-btn">Gerenciar</button></div>
              </div>
            }
          </div>
        </ar-panel-card>
      </div>

      @if (showInvite()) {
        <ar-modal (close)="showInvite.set(false)">
          <h2 class="modal-title">Convidar membro</h2>
          <p class="modal-subtitle">Envie um convite por e-mail para acessar o painel da {{ arenaName() }}</p>

          <div class="field-label">E-mail</div>
          <div class="email-box">
            @for (email of emails(); track email) {
              <span class="email-chip">
                {{ email }}
                <button type="button" (click)="removeEmail(email)" aria-label="Remover e-mail">×</button>
              </span>
            }
            <input
              type="email"
              class="email-input"
              placeholder="nome@email.com…"
              [value]="emailDraft()"
              (input)="emailDraft.set($any($event.target).value)"
              (keydown)="handleEmailKeydown($event)"
            />
          </div>
          <div class="hint-line">Separe múltiplos e-mails com vírgula ou Enter</div>

          <div class="field-label role-label">Cargo</div>
          <div class="role-list">
            @for (opt of roleOptions; track opt.key) {
              <button type="button" class="role-btn" [class.active]="selectedRole() === opt.key" (click)="selectedRole.set(opt.key)">
                <span>
                  <span class="role-title">{{ opt.key }}</span>
                  <span class="role-desc">{{ opt.description }}</span>
                </span>
                @if (selectedRole() === opt.key) {
                  <ar-icon name="check" [size]="16" />
                }
              </button>
            }
          </div>

          <div class="access-box">
            <div class="access-title">Este cargo terá acesso a</div>
            @for (perm of rolePermissions[selectedRole()]; track perm) {
              <div class="access-item">
                <ar-icon name="check" [size]="13" />
                {{ perm }}
              </div>
            }
          </div>

          <div class="actions">
            <button type="button" class="ar-ghost-btn" (click)="showInvite.set(false)">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="!canSend()" (click)="sendInvite()">
              <ar-icon name="mail" [size]="14" />
              Enviar convite
            </button>
          </div>
        </ar-modal>
      }
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: hidden;
    }

    .kpi-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .kpi-card {
      flex: 1;
    }

    .kpi-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .kpi-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .kpi-value.tone-pending {
      color: var(--nx-pending);
    }

    .table-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 46px 1.4fr 1.2fr 120px 150px 90px;
      gap: 12px;
      align-items: center;
    }

    .table-head {
      padding: 0 0 10px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .table-body::-webkit-scrollbar {
      display: none;
    }

    .table-row {
      padding: 13px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-orange-500);
    }

    .cell-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .cell-email {
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .cell-action {
      text-align: right;
    }

    @media (max-width: 720px) {
      .kpi-row {
        flex-wrap: wrap;
      }
    }

    .modal-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
    }

    .modal-subtitle {
      font-size: 13px;
      color: var(--nx-text-dim);
      margin: 4px 0 20px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .role-label {
      margin-top: 22px;
    }

    .email-box {
      min-height: 50px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
    }

    .email-box:focus-within {
      border-color: var(--nx-orange-500);
    }

    .email-chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 30px;
      padding: 0 6px 0 10px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-family: var(--nx-font-mono);
      font-size: 12px;
    }

    .email-chip button {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--nx-text-dim);
      font-size: 13px;
      line-height: 1;
      display: grid;
      place-items: center;
    }

    .email-chip button:hover {
      background: var(--nx-line-strong);
      color: var(--nx-text);
    }

    .email-input {
      flex: 1;
      min-width: 140px;
      height: 30px;
      background: transparent;
      border: none;
      outline: none;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
    }

    .hint-line {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 8px;
    }

    .role-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 18px;
    }

    .role-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      cursor: pointer;
      text-align: left;
      transition: all 140ms var(--nx-ease-out);
    }

    .role-btn:hover {
      background: var(--nx-surface-2);
    }

    .role-btn.active {
      background: var(--nx-orange-tint);
      border-color: var(--nx-orange-500);
      color: var(--nx-orange-500);
    }

    .role-title {
      display: block;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14.5px;
    }

    .role-desc {
      display: block;
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }

    .access-box {
      padding: 14px 16px;
      border-radius: var(--nx-r-3);
      border: 1px dashed var(--nx-line-strong);
      background: var(--nx-surface-1);
      margin-bottom: 22px;
    }

    .access-title {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .access-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--nx-text);
      padding: 4px 0;
    }

    .access-item ar-icon {
      color: var(--nx-win);
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .confirm-btn {
      height: 44px;
      padding: 0 20px;
    }
  `,
})
export class PanelTeamComponent {
  private readonly auth = inject(AuthService);

  protected readonly members = signal<Member[]>(MEMBERS);
  protected readonly roleTone = ROLE_TONE;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly rolePermissions = ROLE_PERMISSIONS;

  protected readonly activeCount = computed(() => this.members().filter((m) => m.status === 'ativo').length);
  protected readonly pendingCount = computed(() => this.members().filter((m) => m.status === 'pendente').length);
  protected readonly roleCount = computed(() => new Set(this.members().map((m) => m.role)).size);

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected readonly showInvite = signal(false);
  protected readonly emails = signal<string[]>([]);
  protected readonly emailDraft = signal('');
  protected readonly selectedRole = signal<MemberRole>('Recepção');

  protected readonly canSend = computed(() => this.emails().length > 0 || this.emailDraft().trim().includes('@'));

  protected removeEmail(email: string): void {
    this.emails.update((current) => current.filter((e) => e !== email));
  }

  protected handleEmailKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commitDraft();
    } else if (event.key === 'Backspace' && this.emailDraft() === '' && this.emails().length > 0) {
      this.emails.update((current) => current.slice(0, -1));
    }
  }

  private commitDraft(): void {
    const raw = this.emailDraft().trim().replace(/,$/, '');
    if (raw && !this.emails().includes(raw)) {
      this.emails.update((current) => [...current, raw]);
    }
    this.emailDraft.set('');
  }

  protected sendInvite(): void {
    this.commitDraft();
    const list = this.emails();
    if (list.length === 0) {
      return;
    }
    const role = this.selectedRole();
    const newMembers: Member[] = list.map((email) => {
      const name = email.split('@')[0];
      return { name, email, role, status: 'pendente', initials: initialsOf(name) };
    });
    this.members.update((current) => [...current, ...newMembers]);
    this.showInvite.set(false);
    this.emails.set([]);
    this.emailDraft.set('');
    this.selectedRole.set('Recepção');
  }
}
