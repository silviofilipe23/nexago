import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';

interface StaffMember {
  initials: string;
  name: string;
  role: string;
  roleTone: PillTone;
}

const STAFF: StaffMember[] = [
  { initials: 'CM', name: 'Carla Mendes', role: 'Treinador principal', roleTone: 'orange' },
  { initials: 'BR', name: 'Bruno Ricci', role: 'Auxiliar', roleTone: 'dim' },
  { initials: 'FS', name: 'Fernanda Sales', role: 'Preparadora física', roleTone: 'green' },
  { initials: 'MT', name: 'Marcos Teixeira', role: 'Fisioterapeuta', roleTone: 'yellow' },
  { initials: 'JL', name: 'Julia Lopes', role: 'Psicóloga', roleTone: 'dim' },
];

interface RoleScope {
  title: string;
  description: string;
}

const ROLE_SCOPES: RoleScope[] = [
  { title: 'Treinador principal', description: 'Acesso total: atletas, treinos, avaliações, financeiro da equipe' },
  { title: 'Auxiliar', description: 'Treinos, presença e comunicação — sem edição de permissões' },
  { title: 'Preparador físico', description: 'Plano de evolução física e condicionamento' },
  { title: 'Fisioterapeuta', description: 'Módulo de lesões e histórico de saúde' },
  { title: 'Psicólogo', description: 'Notas de acompanhamento mental — acesso restrito' },
];

/** Permissões (protótipo TrPermissoesScreen) — tela mock: dado de exemplo fixo, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-permissoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AthleteAvatarComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Permissões" subtitle="Comissão técnica" />

      <div class="body">
        <co-panel-card title="Papéis de acesso" kicker="5 perfis definidos">
          @for (s of staff; track s.initials; let last = $last) {
            <co-row [title]="s.name" sub="Acesso desde jan/2026" [last]="last">
              <co-athlete-avatar row-avatar [initials]="s.initials" [size]="36" />
              <co-pill row-trailing [tone]="s.roleTone">{{ s.role }}</co-pill>
            </co-row>
          }
        </co-panel-card>

        <co-panel-card title="O que cada papel enxerga" kicker="Referência rápida">
          <div class="grid">
            @for (r of roleScopes; track r.title) {
              <div class="scope-card">
                <div class="scope-title">{{ r.title }}</div>
                <div class="scope-desc">{{ r.description }}</div>
              </div>
            }
          </div>
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
    .scope-card {
      padding: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
    }
    .scope-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
      margin-bottom: 5px;
    }
    .scope-desc {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      line-height: 1.4;
    }
  `,
})
export class PanelPermissoesComponent {
  protected readonly staff = STAFF;
  protected readonly roleScopes = ROLE_SCOPES;
}
