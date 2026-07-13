import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';

type InjuryStatus = 'recuperacao' | 'liberado' | 'restricao';

interface Injury {
  athleteName: string;
  athleteInitials: string;
  type: string;
  since: string;
  forecast: string;
  status: InjuryStatus;
}

const INJURIES: Injury[] = [
  { athleteName: 'Lucas Ramos', athleteInitials: 'LR', type: 'Entorse de tornozelo', since: '01/07', forecast: '13/07', status: 'recuperacao' },
  { athleteName: 'Pedro Silva', athleteInitials: 'PS', type: 'Tendinite no ombro', since: '20/06', forecast: 'Restrição contínua', status: 'restricao' },
  { athleteName: 'Rafael Nunes', athleteInitials: 'RN', type: 'Lombalgia', since: '02/06', forecast: 'Liberado em 15/06', status: 'liberado' },
];

const STATUS_LABEL: Record<InjuryStatus, string> = {
  recuperacao: 'Recuperação',
  liberado: 'Liberado',
  restricao: 'Restrição',
};
const STATUS_TONE: Record<InjuryStatus, PillTone> = {
  recuperacao: 'yellow',
  liberado: 'green',
  restricao: 'red',
};

/** Lesões (protótipo TrLesoesScreen) — tela mock: dado de exemplo fixo, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-evolucao-lesoes-mock-design.md. */
@Component({
  selector: 'co-panel-lesoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AthleteAvatarComponent,
    IconComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    PillComponent,
    RowComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Lesões" subtitle="3 registros ativos">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/lesoes/novo">
          <co-icon name="plus" [size]="14" />
          Registrar lesão
        </a>
      </co-page-header>

      <div class="body">
        <co-panel-card title="Registros">
          @for (injury of injuries; track injury.athleteName; let last = $last) {
            <co-row [title]="injury.athleteName + ' · ' + injury.type" [sub]="'Desde ' + injury.since + ' · Previsão: ' + injury.forecast" [last]="last">
              <co-athlete-avatar row-avatar [initials]="injury.athleteInitials" [size]="34" status="lesionado" />
              <co-pill row-trailing [tone]="statusTone(injury.status)">{{ statusLabel(injury.status) }}</co-pill>
            </co-row>
          }
        </co-panel-card>

        <co-panel-card title="Novo registro" kicker="Ficha de lesão">
          <div class="field"><div class="f-label">Tipo</div><div class="f-value">Entorse de tornozelo grau I</div></div>
          <div class="field"><div class="f-label">Data</div><div class="f-value">01/07/2026</div></div>
          <div class="field"><div class="f-label">Previsão de retorno</div><div class="f-value">13/07/2026</div></div>
          <div class="field"><div class="f-label">Médico responsável</div><div class="f-value">Dr. Felipe Aguiar — Ortopedia</div></div>
          <div class="field"><div class="f-label">Observações</div><div class="f-value">Uso de tornozeleira nos treinos por 30 dias após retorno.</div></div>
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
      min-height: 0;
      overflow: hidden;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 14px;
    }
    .field:last-child {
      margin-bottom: 0;
    }
    .f-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .f-value {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
    }
  `,
})
export class PanelLesoesComponent {
  protected readonly injuries = INJURIES;

  protected statusLabel(status: InjuryStatus): string {
    return STATUS_LABEL[status];
  }

  protected statusTone(status: InjuryStatus): PillTone {
    return STATUS_TONE[status];
  }
}
