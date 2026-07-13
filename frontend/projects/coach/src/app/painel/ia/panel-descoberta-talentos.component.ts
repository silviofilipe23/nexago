import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';

interface ProspectAthlete {
  initials: string;
  name: string;
  sub: string;
}

const PROSPECTS: ProspectAthlete[] = [
  { initials: 'TC', name: 'Thiago Cardoso', sub: '19 anos · Intermediário · +180 no rating em 3 meses' },
  { initials: 'GB', name: 'Gabriela Brito', sub: '18 anos · Iniciante · +140 no rating em 3 meses' },
  { initials: 'MV', name: 'Marcelo Vaz', sub: '21 anos · Intermediário · +110 no rating em 3 meses' },
];

/** Descoberta de talentos (protótipo TrDescobertaTalentosScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-descoberta-talentos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AthleteAvatarComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Descoberta de talentos" subtitle="Atletas da região · Goiânia e entorno" />

      <div class="body">
        <co-panel-card title="Filtros" kicker="Refinar busca">
          <div class="field"><div class="f-label">Idade</div><div class="f-value">16 – 22 anos</div></div>
          <div class="field"><div class="f-label">Categoria</div><div class="f-value">Iniciante — Intermediário</div></div>
          <div class="field"><div class="f-label">Rating mínimo</div><div class="f-value">1.400</div></div>
          <div class="field"><div class="f-label">Evolução recente</div><div class="f-value">Últimos 3 meses</div></div>
        </co-panel-card>

        <co-panel-card title="Atletas promissores" kicker="Ordenado por evolução recente" class="list-card">
          @for (p of prospects; track p.initials; let last = $last) {
            <co-row [title]="p.name" [sub]="p.sub" [last]="last">
              <co-athlete-avatar row-avatar [initials]="p.initials" [size]="34" status="ativo" />
              <button row-trailing type="button" class="co-mini-btn">Convidar</button>
            </co-row>
          }
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 280px 1fr;
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
    .list-card {
      min-height: 0;
      overflow: hidden;
    }
  `,
})
export class PanelDescobertaTalentosComponent {
  protected readonly prospects = PROSPECTS;
}
