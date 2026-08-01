import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import {
  ARENA_ROLE_AREA_LABELS,
  ARENA_ROLE_DESCRIPTION,
  ARENA_ROLE_LABEL,
  ARENA_STAFF_ROLES,
  type ArenaStaffRole,
} from '../data/arena-roles.model';
import { arenaInviteLink, arenaInviteWhatsAppUrl, type ArenaStaffInvite, type ArenaStaffMember } from '../data/arena-staff.model';
import { ArenaStaffService } from '../data/arena-staff.service';
import { IconComponent } from '../ui/icon.component';
import { initialsOf } from '../ui/initials';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type MemberStatus = 'ativo' | 'pendente';

interface StaffRow {
  key: string;
  displayName: string;
  email: string;
  role: ArenaStaffRole;
  status: MemberStatus;
  initials: string;
  member: ArenaStaffMember | null;
  invite: ArenaStaffInvite | null;
}

interface InviteOutcome {
  email: string;
  ok: boolean;
  status?: 'active' | 'pending';
  link?: string;
  whatsappUrl?: string;
  errorMessage?: string;
}

const ROLE_TONE: Record<ArenaStaffRole, PillTone> = {
  gestor: 'orange',
  recepcao: 'dim',
  financeiro: 'dim',
  manutencao: 'dim',
};

const STATUS_LABEL: Record<MemberStatus, string> = {
  ativo: 'Ativo',
  pendente: 'Convite pendente',
};

const STATUS_TONE: Record<MemberStatus, PillTone> = {
  ativo: 'green',
  pendente: 'yellow',
};

function localPartOf(email: string): string {
  return email.split('@')[0] || email;
}

/** Tela Equipe do painel: membros ativos + convites pendentes (`arenas/{arenaId}/staff` +
 *  `arenaStaffInvites`) numa lista só, convite/troca de cargo/remoção via callables da Task 6,
 *  e gate de plano (capability `equipe`, Pro/Elite). */
@Component({
  selector: 'ar-panel-team',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PillComponent,
    IconComponent,
    ModalComponent,
    RouterLink,
  ],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <ar-panel-shell>
      <ar-page-header title="Equipe" [subtitle]="arenaName() + ' · quem tem acesso ao painel'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="openInviteModal()">
          <ar-icon name="mail" [size]="14" />
          Convidar membro
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
          </ar-panel-card>
        } @else if (arenaLoading() || loadingStaff()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Carregando equipe…</p>
          </ar-panel-card>
        } @else {
          @if (readOnly()) {
            <div class="upsell-banner">
              <div>
                <div class="upsell-title">Gestão de equipe é um recurso dos planos Pro e Elite</div>
                <div class="upsell-text">Seu plano atual não permite convidar novos membros para o painel.</div>
              </div>
              <a routerLink="/painel/planos" class="ar-mini-btn ar-mini-btn-primary">
                <ar-icon name="card" [size]="14" />
                Ver planos
              </a>
            </div>
          }

          @if (actionError(); as err) {
            <div class="notice-banner error-banner">
              {{ err }}
              <button type="button" class="notice-dismiss" (click)="actionError.set(null)">×</button>
            </div>
          }

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
              <div class="kpi-label">Assentos</div>
              <div class="kpi-value">
                {{ seatsUsed() }}
                @if (maxSeatsLabel(); as max) {
                  <span class="kpi-of">de {{ max }}</span>
                }
              </div>
            </ar-panel-card>
          </div>

          <ar-panel-card title="Membros da equipe" [kicker]="rows().length + ' pessoas'" class="table-card">
            <div class="table-head">
              <span></span>
              <span>Nome</span>
              <span>E-mail</span>
              <span>Cargo</span>
              <span>Status</span>
              <span></span>
            </div>
            <div class="table-body">
              @for (row of rows(); track row.key) {
                <div class="table-row">
                  <div class="avatar">{{ row.initials }}</div>
                  <div class="cell-name">{{ row.displayName }}</div>
                  <div class="cell-email">{{ row.email }}</div>
                  <div><ar-pill [tone]="roleTone[row.role]">{{ roleLabel[row.role] }}</ar-pill></div>
                  <div><ar-pill [tone]="statusTone[row.status]">{{ statusLabel[row.status] }}</ar-pill></div>
                  <div class="cell-action manage-cell">
                    <button type="button" class="ar-ghost-btn" (click)="toggleMenu(row.key)">Gerenciar</button>
                    @if (openMenuKey() === row.key) {
                      <div class="manage-menu">
                        @if (row.member; as member) {
                          <div class="menu-section-label">Trocar cargo</div>
                          @for (r of staffRoles; track r) {
                            <button type="button" class="menu-item" [class.active]="r === row.role" (click)="changeRole(member, r)">
                              {{ roleLabel[r] }}
                            </button>
                          }
                          <div class="menu-divider"></div>
                          <button type="button" class="menu-item danger" (click)="askRemove(member)">Remover membro</button>
                        } @else if (row.invite; as invite) {
                          <button type="button" class="menu-item danger" (click)="cancelInvite(invite)">Cancelar convite</button>
                        }
                      </div>
                    }
                  </div>
                </div>
              } @empty {
                <p class="state-text empty-text">Nenhum membro na equipe ainda.</p>
              }
            </div>
          </ar-panel-card>
        }
      </div>

      @if (showInvite()) {
        <ar-modal (close)="dismissInviteModal()">
          @if (inviteResults(); as results) {
            <h2 class="modal-title">Resultado do convite</h2>
            <p class="modal-subtitle">Confira o que aconteceu com cada e-mail convidado.</p>

            <div class="invite-results">
              @for (r of results; track r.email) {
                <div class="result-row" [class.result-error]="!r.ok">
                  <div class="result-email">{{ r.email }}</div>
                  @if (r.ok && r.status === 'active') {
                    <ar-pill tone="green">Adicionado à equipe</ar-pill>
                  } @else if (r.ok && r.status === 'pending') {
                    <div class="result-pending">
                      <ar-pill tone="yellow">Convite pendente</ar-pill>
                      <div class="link-row">
                        <input type="text" class="link-box" readonly [value]="r.link" />
                        <button type="button" class="ar-mini-btn" (click)="copyLink(r.link!)">
                          {{ copiedLink() === r.link ? 'Copiado!' : 'Copiar' }}
                        </button>
                        <a class="ar-mini-btn ar-mini-btn-primary" [href]="r.whatsappUrl" target="_blank" rel="noopener">WhatsApp</a>
                      </div>
                    </div>
                  } @else {
                    <div class="result-error-msg">{{ r.errorMessage }}</div>
                  }
                </div>
              }
            </div>

            <div class="actions">
              <button type="button" class="ar-ghost-btn" (click)="resetInviteForm()">Convidar mais</button>
              <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" (click)="closeInviteModal()">Concluir</button>
            </div>
          } @else {
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
              @for (r of staffRoles; track r) {
                <button type="button" class="role-btn" [class.active]="selectedRole() === r" (click)="selectedRole.set(r)">
                  <span>
                    <span class="role-title">{{ roleLabel[r] }}</span>
                    <span class="role-desc">{{ roleDescription[r] }}</span>
                  </span>
                  @if (selectedRole() === r) {
                    <ar-icon name="check" [size]="16" />
                  }
                </button>
              }
            </div>

            <div class="access-box">
              <div class="access-title">Este cargo terá acesso a</div>
              @for (item of roleAreaLabels[selectedRole()]; track item) {
                <div class="access-item">
                  <ar-icon name="check" [size]="13" />
                  {{ item }}
                </div>
              }
            </div>

            <div class="actions">
              <button type="button" class="ar-ghost-btn" [disabled]="sendingInvites()" (click)="dismissInviteModal()">Cancelar</button>
              <button
                type="button"
                class="ar-mini-btn ar-mini-btn-primary confirm-btn"
                [disabled]="!canSend() || sendingInvites()"
                (click)="sendInvite()"
              >
                <ar-icon name="mail" [size]="14" />
                {{ sendingInvites() ? 'Enviando…' : 'Enviar convite' }}
              </button>
            </div>
          }
        </ar-modal>
      }

      @if (removeTarget(); as target) {
        <ar-modal (close)="closeRemoveModal()">
          <h2 class="modal-title">Remover {{ target.displayName }}?</h2>
          <p class="modal-subtitle">A pessoa perde o acesso ao painel da {{ arenaName() }} imediatamente.</p>
          @if (removeError(); as err) {
            <div class="error-banner modal-error">{{ err }}</div>
          }
          <div class="actions">
            <button type="button" class="ar-ghost-btn" [disabled]="removing()" (click)="closeRemoveModal()">Cancelar</button>
            <button type="button" class="ar-mini-btn danger-btn" [disabled]="removing()" (click)="confirmRemove()">
              {{ removing() ? 'Removendo…' : 'Remover' }}
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

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .empty-text {
      margin: 12px 0;
    }

    .upsell-banner {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-radius: var(--nx-r-3);
      border: 1px solid rgba(255, 106, 26, 0.3);
      background: var(--nx-orange-tint);
      padding: 14px 18px;
    }

    .upsell-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      margin-bottom: 3px;
    }

    .upsell-text {
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .notice-banner {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .notice-banner.error-banner {
      border-color: var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
    }

    .notice-dismiss {
      background: transparent;
      border: none;
      color: inherit;
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
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

    .kpi-of {
      font-family: var(--nx-font-mono);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text-dim);
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

    .manage-cell {
      position: relative;
    }

    .manage-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 30;
      min-width: 190px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
      padding: 6px;
      text-align: left;
    }

    .menu-section-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      padding: 8px 10px 4px;
    }

    .menu-item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 9px 10px;
      background: transparent;
      border: none;
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-size: 13px;
      cursor: pointer;
    }

    .menu-item:hover {
      background: var(--nx-surface-2);
    }

    .menu-item.active {
      color: var(--nx-orange-500);
      font-weight: 600;
    }

    .menu-item.danger {
      color: var(--nx-live);
    }

    .menu-item.danger:hover {
      background: rgba(255, 59, 48, 0.08);
    }

    .menu-divider {
      height: 1px;
      background: var(--nx-line);
      margin: 6px 4px;
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

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .modal-error {
      margin-bottom: 16px;
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

    .invite-results {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-bottom: 20px;
    }

    .result-row {
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      padding: 12px 14px;
    }

    .result-row.result-error {
      border-color: rgba(255, 59, 48, 0.35);
      background: rgba(255, 59, 48, 0.06);
    }

    .result-email {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
      margin-bottom: 8px;
    }

    .result-pending {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 8px;
    }

    .link-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .link-box {
      flex: 1;
      min-width: 160px;
      height: 36px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-mono);
      font-size: 12px;
      padding: 0 10px;
    }

    .result-error-msg {
      font-size: 12.5px;
      color: var(--nx-live);
      margin-top: 6px;
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

    .danger-btn {
      height: 44px;
      padding: 0 20px;
      background: var(--nx-live);
      color: #fff;
      border: none;
    }

    .danger-btn:hover:not(:disabled) {
      background: #ff564c;
    }
  `,
})
export class PanelTeamComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly staffService = inject(ArenaStaffService);

  protected readonly staffRoles = ARENA_STAFF_ROLES;
  protected readonly roleLabel = ARENA_ROLE_LABEL;
  protected readonly roleDescription = ARENA_ROLE_DESCRIPTION;
  protected readonly roleAreaLabels = ARENA_ROLE_AREA_LABELS;
  protected readonly roleTone = ROLE_TONE;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? 'Arena');
  protected readonly readOnly = computed(() => !this.arenaContext.hasCapability('equipe'));

  protected readonly members = signal<ArenaStaffMember[]>([]);
  protected readonly invites = signal<ArenaStaffInvite[]>([]);
  protected readonly loadingStaff = signal(true);

  protected readonly rows = computed<StaffRow[]>(() => [
    ...this.members().map((m) => ({
      key: `m:${m.uid}`,
      displayName: m.displayName,
      email: m.email,
      role: m.role,
      status: 'ativo' as const,
      initials: initialsOf(m.displayName),
      member: m,
      invite: null,
    })),
    ...this.invites().map((i) => ({
      key: `i:${i.id}`,
      displayName: localPartOf(i.email),
      email: i.email,
      role: i.role,
      status: 'pendente' as const,
      initials: initialsOf(localPartOf(i.email)),
      member: null,
      invite: i,
    })),
  ]);

  protected readonly activeCount = computed(() => this.members().length);
  protected readonly pendingCount = computed(() => this.invites().length);
  protected readonly seatsUsed = computed(() => this.activeCount() + this.pendingCount());
  /** `null` quando o plano não concede assento nenhum (starter/sem plano) — nesse
   *  caso o card de upsell já está visível (`readOnly()`), então o KPI só mostra
   *  a contagem atual em vez de um "de 0" confuso pra uma arena que tinha
   *  equipe antes de rebaixar de plano (achado de review). */
  protected readonly maxSeatsLabel = computed<string | null>(() => {
    const tier = this.arenaContext.planStatus().tier;
    if (tier === 'elite') return 'ilimitado';
    if (tier === 'pro') return '5';
    return null;
  });

  protected readonly openMenuKey = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly removeTarget = signal<ArenaStaffMember | null>(null);
  protected readonly removing = signal(false);
  protected readonly removeError = signal<string | null>(null);

  protected readonly showInvite = signal(false);
  protected readonly emails = signal<string[]>([]);
  protected readonly emailDraft = signal('');
  protected readonly selectedRole = signal<ArenaStaffRole>('recepcao');
  protected readonly sendingInvites = signal(false);
  protected readonly inviteResults = signal<InviteOutcome[] | null>(null);
  protected readonly copiedLink = signal<string | null>(null);

  protected readonly canSend = computed(() => this.emails().length > 0 || this.emailDraft().trim().includes('@'));

  constructor() {
    effect((onCleanup) => {
      const arenaId = this.arenaContext.arenaId();
      this.members.set([]);
      this.invites.set([]);
      this.loadingStaff.set(true);

      if (!arenaId) {
        this.loadingStaff.set(false);
        return;
      }

      let membersReady = false;
      let invitesReady = false;
      const checkReady = () => {
        if (membersReady && invitesReady) this.loadingStaff.set(false);
      };

      const unsubMembers = this.staffService.watchMembers(arenaId, (list) => {
        this.members.set(list);
        membersReady = true;
        checkReady();
      });
      const unsubInvites = this.staffService.watchInvites(arenaId, (list) => {
        this.invites.set(list);
        invitesReady = true;
        checkReady();
      });

      // Teardown tanto na troca de arena (o efeito roda de novo, o cleanup do
      // valor anterior é chamado antes) quanto na destruição do componente —
      // sem isto os dois onSnapshot ficariam vivos além da tela.
      onCleanup(() => {
        unsubMembers();
        unsubInvites();
      });
    });
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.openMenuKey() === null) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.manage-cell')) {
      this.openMenuKey.set(null);
    }
  }

  protected toggleMenu(key: string): void {
    this.openMenuKey.update((current) => (current === key ? null : key));
  }

  protected async changeRole(member: ArenaStaffMember, role: ArenaStaffRole): Promise<void> {
    this.openMenuKey.set(null);
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || role === member.role) return;
    this.actionError.set(null);
    try {
      await this.staffService.updateRole(arenaId, member.uid, role);
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Não foi possível atualizar o cargo.');
    }
  }

  protected askRemove(member: ArenaStaffMember): void {
    this.openMenuKey.set(null);
    this.removeError.set(null);
    this.removeTarget.set(member);
  }

  protected closeRemoveModal(): void {
    if (this.removing()) return;
    this.removeTarget.set(null);
    this.removeError.set(null);
  }

  protected async confirmRemove(): Promise<void> {
    const member = this.removeTarget();
    const arenaId = this.arenaContext.arenaId();
    if (!member || !arenaId) return;
    this.removing.set(true);
    this.removeError.set(null);
    try {
      await this.staffService.remove(arenaId, member.uid);
      this.removeTarget.set(null);
    } catch (err) {
      this.removeError.set(err instanceof Error ? err.message : 'Não foi possível remover o membro.');
    } finally {
      this.removing.set(false);
    }
  }

  protected async cancelInvite(invite: ArenaStaffInvite): Promise<void> {
    this.openMenuKey.set(null);
    this.actionError.set(null);
    try {
      await this.staffService.revokeInvite(invite.id);
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Não foi possível cancelar o convite.');
    }
  }

  protected openInviteModal(): void {
    if (this.readOnly()) return;
    // Sempre parte de um estado limpo, mesmo que a sessão anterior do modal
    // tenha terminado de um jeito que não passou por closeInviteModal() (ex.:
    // resultado de um envio anterior ainda em `inviteResults`) — ver Finding 1.
    this.resetInviteForm();
    this.showInvite.set(true);
  }

  /** Fecha o modal a pedido do usuário (X, backdrop, Escape, Cancelar) — mas
   *  nunca no meio de um envio: os convites já foram disparados pro servidor
   *  e abandonar a tela nesse ponto só deixaria os resultados sem serem
   *  mostrados, sem cancelar nada de fato (achado de review, round 1). */
  protected dismissInviteModal(): void {
    if (this.sendingInvites()) return;
    this.closeInviteModal();
  }

  protected closeInviteModal(): void {
    this.showInvite.set(false);
    this.resetInviteForm();
  }

  protected resetInviteForm(): void {
    this.emails.set([]);
    this.emailDraft.set('');
    this.selectedRole.set('recepcao');
    this.inviteResults.set(null);
  }

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

  protected async sendInvite(): Promise<void> {
    this.commitDraft();
    const list = this.emails();
    const arenaId = this.arenaContext.arenaId();
    if (list.length === 0 || !arenaId || this.sendingInvites()) return;

    const role = this.selectedRole();
    const arenaName = this.arenaName();
    this.sendingInvites.set(true);

    // Um e-mail por chamada — o callable não tem forma em lote (Task 6). Em
    // sequência (não Promise.all) pra não estourar limite de assentos no meio
    // do lote: cada chamada já reflete o assento consumido pela anterior.
    const outcomes: InviteOutcome[] = [];
    for (const email of list) {
      try {
        const result = await this.staffService.invite(arenaId, email, role);
        if (result.status === 'active') {
          outcomes.push({ email, ok: true, status: 'active' });
        } else if (result.status === 'pending' && result.inviteId) {
          const link = arenaInviteLink(location.origin, result.inviteId);
          outcomes.push({ email, ok: true, status: 'pending', link, whatsappUrl: arenaInviteWhatsAppUrl(link, arenaName) });
        } else {
          // Contrato quebrado (status 'pending' sem inviteId, ou valor
          // inesperado): não presumir sucesso — errar pro lado de avisar que
          // algo pode ter sido criado sem link, nunca dizer "adicionado à
          // equipe" quando não foi isso que aconteceu (achado de review).
          outcomes.push({
            email,
            ok: false,
            errorMessage: 'O convite pode ter sido criado, mas não foi possível gerar o link. Confira a lista de Equipe.',
          });
        }
      } catch (err) {
        outcomes.push({ email, ok: false, errorMessage: err instanceof Error ? err.message : 'Não foi possível enviar o convite.' });
      }
    }

    this.sendingInvites.set(false);
    this.emails.set([]);
    this.emailDraft.set('');
    this.inviteResults.set(outcomes);
  }

  protected async copyLink(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copiedLink.set(link);
      setTimeout(() => {
        if (this.copiedLink() === link) this.copiedLink.set(null);
      }, 1600);
    } catch {
      // clipboard indisponível (permissão/contexto não seguro) — link já fica visível pra copiar manualmente.
    }
  }
}
