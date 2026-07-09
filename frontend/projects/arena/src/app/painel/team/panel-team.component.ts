import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
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

/** Tela Equipe do painel (protótipo ArEquipeScreen): KPIs e tabela de membros. */
@Component({
  selector: 'ar-panel-team',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Equipe" [subtitle]="arenaName() + ' · quem tem acesso ao painel'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary">
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

        <ar-panel-card title="Membros da equipe" [kicker]="members.length + ' pessoas'" class="table-card">
          <div class="table-head">
            <span></span>
            <span>Nome</span>
            <span>E-mail</span>
            <span>Cargo</span>
            <span>Status</span>
            <span></span>
          </div>
          <div class="table-body">
            @for (m of members; track m.email) {
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
  `,
})
export class PanelTeamComponent {
  private readonly auth = inject(AuthService);

  protected readonly members = MEMBERS;
  protected readonly roleTone = ROLE_TONE;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  protected readonly activeCount = computed(() => this.members.filter((m) => m.status === 'ativo').length);
  protected readonly pendingCount = computed(() => this.members.filter((m) => m.status === 'pendente').length);
  protected readonly roleCount = computed(() => new Set(this.members.map((m) => m.role)).size);

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');
}
