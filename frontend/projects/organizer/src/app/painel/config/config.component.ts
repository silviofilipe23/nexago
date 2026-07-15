import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OG_EQUIPE } from '../data/mock-data';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';

interface ConfigRow {
  label: string;
  value: string;
}

const ORG_ROWS: ConfigRow[] = [
  { label: 'Nome', value: 'Liga Amadora Goiânia' },
  { label: 'Responsável', value: 'Rafael Souza' },
  { label: 'E-mail de contato', value: 'contato@ligaamadora.gg' },
  { label: 'Cidade', value: 'Goiânia · GO' },
];

const REGRAS_ROWS: ConfigRow[] = [
  { label: 'Formato padrão', value: 'Eliminação simples' },
  { label: 'Taxa da plataforma', value: '6% por inscrição' },
  { label: 'Política de estorno', value: 'Até 48h antes' },
  { label: 'Repasse', value: 'D+2 após o evento' },
];

const PAGAMENTOS_ROWS: ConfigRow[] = [
  { label: 'Conta bancária', value: 'Itaú •••• 4021' },
  { label: 'Chave Pix', value: 'contato@ligaamadora.gg' },
  { label: 'Saque automático', value: 'Semanal' },
];

/** Dados da organização, regras padrão de evento, pagamentos e equipe com acesso ao painel. */
@Component({
  selector: 'og-config',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgAvatarComponent],
  template: `
    <og-page-header title="Configurações" subtitle="Dados da organização, pagamentos e equipe" />

    <div class="og-content" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <og-card title="Organização" kicker="Perfil">
        <button card-action type="button" class="og-ghost-btn"><og-icon name="edit" [size]="13" />Editar</button>
        @for (r of orgRows; track r.label; let last = $last) {
          <div class="og-config-row" [class.last]="last">
            <span class="lbl">{{ r.label }}</span>
            <span class="val">{{ r.value }}<og-icon name="chevron" [size]="14" style="color:var(--nx-text-dim)" /></span>
          </div>
        }
      </og-card>

      <og-card title="Regras padrão de evento" kicker="Modelos">
        <button card-action type="button" class="og-ghost-btn"><og-icon name="edit" [size]="13" />Editar</button>
        @for (r of regrasRows; track r.label; let last = $last) {
          <div class="og-config-row" [class.last]="last">
            <span class="lbl">{{ r.label }}</span>
            <span class="val">{{ r.value }}<og-icon name="chevron" [size]="14" style="color:var(--nx-text-dim)" /></span>
          </div>
        }
      </og-card>

      <og-card title="Pagamentos" kicker="NexaGO Pay">
        <button card-action type="button" class="og-ghost-btn"><og-icon name="edit" [size]="13" />Gerenciar</button>
        @for (r of pagamentosRows; track r.label; let last = $last) {
          <div class="og-config-row" [class.last]="last">
            <span class="lbl">{{ r.label }}</span>
            <span class="val">{{ r.value }}<og-icon name="chevron" [size]="14" style="color:var(--nx-text-dim)" /></span>
          </div>
        }
      </og-card>

      <og-card title="Equipe" kicker="Acesso ao painel">
        <button card-action type="button" class="og-mini-btn"><og-icon name="plus" [size]="13" />Convidar</button>
        <div style="display:flex;flex-direction:column">
          @for (m of equipe; track m.name; let last = $last) {
            <div class="og-config-membro" [class.last]="last">
              <og-avatar [initials]="m.initials" [size]="32" />
              <span style="flex:1">
                <div class="og-config-membro-name">{{ m.name }}</div>
                <div class="og-config-membro-role">{{ m.role }}</div>
              </span>
              <button type="button" class="og-ghost-btn">Remover</button>
            </div>
          }
        </div>
      </og-card>
    </div>
  `,
  styles: `
    .og-config-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 13px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-config-row.last {
      border-bottom: none;
    }
    .og-config-row .lbl {
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }
    .og-config-row .val {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-config-membro {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-config-membro.last {
      border-bottom: none;
    }
    .og-config-membro-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-config-membro-role {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
  `,
})
export class ConfigComponent {
  protected readonly orgRows = ORG_ROWS;
  protected readonly regrasRows = REGRAS_ROWS;
  protected readonly pagamentosRows = PAGAMENTOS_ROWS;
  protected readonly equipe = OG_EQUIPE;
}
