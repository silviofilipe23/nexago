import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormSelectComponent } from '../ui/form-select.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';
import { TabsComponent } from '../ui/tabs.component';
import { SquadContextService } from '../ui/squad-context.service';
import { AthletesService, type RosterAthlete } from './athletes.service';

const STATUS_LABEL: Record<string, string> = {
  ativo: 'Ativo',
  lesionado: 'Lesionado',
  afastado: 'Afastado',
  ferias: 'Férias',
};
const STATUS_TONE: Record<string, 'green' | 'red' | 'yellow' | 'dim'> = {
  ativo: 'green',
  lesionado: 'red',
  afastado: 'yellow',
  ferias: 'dim',
};

/** Gestão de atletas (protótipo TrAtletasScreen) — sem a aba "Estatísticas" do protótipo
 *  ainda, porque depende de dados de torneio (Task 16). */
@Component({
  selector: 'co-panel-atletas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AthleteAvatarComponent,
    FormFieldComponent,
    FormSelectComponent,
    FormTextareaComponent,
    IconComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    PillComponent,
    RowComponent,
    TabsComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Gestão de atletas" [subtitle]="subtitle()">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/atletas/novo">
          <co-icon name="plus" [size]="14" />
          Convidar atleta
        </a>
      </co-page-header>

      <div class="body">
        <co-panel-card pad="sm" title="Lista de atletas" [kicker]="roster().length + ' atletas'" class="list-card">
          <div class="list">
            @for (a of roster(); track a.athleteUid) {
              <div class="list-row" [class.active]="selectedUid() === a.athleteUid" (click)="select(a.athleteUid)">
                <co-athlete-avatar [initials]="a.initials" [size]="34" [status]="a.status" />
                <div class="list-body">
                  <div class="list-name">{{ a.displayName }}</div>
                  <div class="list-meta">{{ a.category || 'Sem categoria' }}</div>
                </div>
              </div>
            } @empty {
              <p class="empty">Nenhum atleta vinculado ainda. Convide o primeiro atleta da sua equipe.</p>
            }
          </div>
        </co-panel-card>

        @if (selected(); as athlete) {
          <div class="detail">
            <co-panel-card class="header-card">
              <div class="header-row">
                <co-athlete-avatar [initials]="athlete.initials" [size]="60" [status]="athlete.status" />
                <div class="header-body">
                  <div class="header-name">{{ athlete.displayName }}</div>
                  <div class="header-meta">{{ athlete.category || 'Sem categoria' }} · {{ athlete.position || 'Posição não definida' }}</div>
                </div>
                <co-pill [tone]="statusTone(athlete.status)">{{ statusLabel(athlete.status) }}</co-pill>
                <button type="button" class="co-ghost-btn" (click)="toggleEdit(athlete)">
                  <co-icon name="edit" [size]="14" />
                  {{ editing() ? 'Cancelar' : 'Editar' }}
                </button>
              </div>
            </co-panel-card>

            @if (editing()) {
              <co-panel-card title="Editar dados do vínculo" kicker="Só o treinador vê estes campos">
                <form [formGroup]="editForm" class="grid">
                  <co-form-select label="Status na equipe" [options]="statusOptions" formControlName="status" />
                  <co-form-field label="Posição" formControlName="position" />
                  <co-form-select label="Braço dominante" [options]="['Direito', 'Esquerdo']" formControlName="dominantHand" />
                  <co-form-field label="Altura (cm)" type="number" formControlName="heightCm" />
                  <co-form-field label="Peso (kg)" type="number" formControlName="weightKg" />
                  <co-form-field label="Contato de emergência" formControlName="emergencyContact" [wide]="true" />
                  <co-form-textarea label="Observações" formControlName="notes" />
                </form>
                <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving()" (click)="save(athlete.athleteUid)">
                  @if (saving()) { Salvando… } @else { Salvar alterações }
                </button>
              </co-panel-card>
            } @else {
              <co-tabs [tabs]="tabs" [active]="activeTab()" (change)="activeTab.set($event)" />

              @if (activeTab() === 'Dados pessoais') {
                <co-panel-card>
                  <div class="grid readonly">
                    <div><div class="f-label">Contato de emergência</div><div class="f-value">{{ athlete.emergencyContact || '—' }}</div></div>
                    <div><div class="f-label">Altura</div><div class="f-value">{{ athlete.heightCm ? athlete.heightCm + ' cm' : '—' }}</div></div>
                    <div><div class="f-label">Peso</div><div class="f-value">{{ athlete.weightKg ? athlete.weightKg + ' kg' : '—' }}</div></div>
                    <div><div class="f-label">Braço dominante</div><div class="f-value">{{ athlete.dominantHand || '—' }}</div></div>
                  </div>
                </co-panel-card>
              } @else {
                <co-panel-card>
                  <div class="grid readonly">
                    <div><div class="f-label">Posição</div><div class="f-value">{{ athlete.position || '—' }}</div></div>
                    <div><div class="f-label">Categoria</div><div class="f-value">{{ athlete.category || '—' }}</div></div>
                    <div><div class="f-label">Observações</div><div class="f-value">{{ athlete.notes || '—' }}</div></div>
                  </div>
                </co-panel-card>
              }
            }
          </div>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 20px 32px 28px;
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: 16px;
      min-height: 0;
    }
    .list-card {
      min-height: 0;
      overflow: hidden;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 3px;
      overflow: auto;
    }
    .list-row {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      cursor: pointer;
      border: 1px solid transparent;
    }
    .list-row.active {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
    }
    .list-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .list-meta {
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
      padding: 8px 4px;
    }
    .detail {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
      overflow: hidden;
    }
    .header-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header-body {
      flex: 1;
    }
    .header-name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      color: var(--nx-text);
    }
    .header-meta {
      font-size: 12.5px;
      color: var(--nx-text-mute);
      margin-top: 3px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }
    .grid.readonly {
      gap: 20px;
    }
    .f-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 4px;
    }
    .f-value {
      font-size: 13px;
      color: var(--nx-text);
    }
  `,
})
export class PanelAtletasComponent {
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly tabs = ['Dados pessoais', 'Perfil esportivo'];
  protected readonly statusOptions = ['ativo', 'lesionado', 'afastado', 'ferias'];

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  protected readonly subtitle = computed(() => {
    const squad = this.squadContext.activeSquad();
    const n = this.roster().length;
    return `${squad ? squad.name : 'Todas as equipes'} · ${n} atleta${n === 1 ? '' : 's'}`;
  });

  protected readonly selectedUid = signal<string | null>(null);
  protected readonly activeTab = signal('Dados pessoais');
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);

  protected readonly selected = computed<RosterAthlete | null>(() => {
    const uid = this.selectedUid() ?? this.roster()[0]?.athleteUid ?? null;
    return this.roster().find((a) => a.athleteUid === uid) ?? null;
  });

  protected readonly editForm = this.fb.group({
    status: 'ativo',
    position: '',
    dominantHand: 'Direito',
    heightCm: '',
    weightKg: '',
    emergencyContact: '',
    notes: '',
  });

  protected select(uid: string): void {
    this.selectedUid.set(uid);
    this.editing.set(false);
  }

  protected statusLabel(status: string): string {
    return STATUS_LABEL[status] ?? status;
  }

  protected statusTone(status: string): 'green' | 'red' | 'yellow' | 'dim' {
    return STATUS_TONE[status] ?? 'dim';
  }

  protected toggleEdit(athlete: RosterAthlete): void {
    if (!this.editing()) {
      this.editForm.setValue({
        status: athlete.status,
        position: athlete.position,
        dominantHand: athlete.dominantHand || 'Direito',
        heightCm: athlete.heightCm != null ? String(athlete.heightCm) : '',
        weightKg: athlete.weightKg != null ? String(athlete.weightKg) : '',
        emergencyContact: athlete.emergencyContact,
        notes: athlete.notes,
      });
    }
    this.editing.set(!this.editing());
  }

  protected async save(athleteUid: string): Promise<void> {
    this.saving.set(true);
    try {
      const raw = this.editForm.getRawValue();
      await this.athletesService.updateAthleteLink(athleteUid, {
        status: raw.status as RosterAthlete['status'],
        position: raw.position,
        dominantHand: raw.dominantHand,
        heightCm: raw.heightCm ? Number(raw.heightCm) : null,
        weightKg: raw.weightKg ? Number(raw.weightKg) : null,
        emergencyContact: raw.emergencyContact,
        notes: raw.notes,
      });
      this.editing.set(false);
    } finally {
      this.saving.set(false);
    }
  }
}
