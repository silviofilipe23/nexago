import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AthletesService } from '../atletas/athletes.service';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';
import { CallUpsService } from './call-ups.service';

@Component({
  selector: 'co-panel-nova-convocacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AthleteAvatarComponent,
    FormFieldComponent,
    FormTextareaComponent,
    IconComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    RowComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Nova convocação" subtitle="Enviar aos atletas">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="sending()" (click)="submit()">
          @if (sending()) {
            Enviando…
          } @else {
            Enviar convocação
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        <co-panel-card title="Detalhes da convocação" kicker="Evento">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Título" placeholder="Ex: Treino sexta às 19h" formControlName="title" [wide]="true" />
            <co-form-field label="Prazo para resposta" placeholder="Quinta, 22h" formControlName="responseDeadline" [wide]="true" />
            <co-form-textarea label="Mensagem" formControlName="message" />
          </form>
        </co-panel-card>

        <co-panel-card title="Destinatários" [kicker]="selectedCount() + ' de ' + roster().length + ' atletas selecionados'">
          @for (a of roster(); track a.athleteUid; let last = $last) {
            <co-row [title]="a.displayName" [sub]="a.category" [last]="last">
              <co-athlete-avatar row-avatar [initials]="a.initials" [size]="32" [status]="a.status" />
              <button type="button" row-trailing class="co-ghost-btn" [class.active]="isSelected(a.athleteUid)" (click)="toggle(a.athleteUid)">
                @if (isSelected(a.athleteUid)) {
                  <co-icon name="check" [size]="14" />
                } @else {
                  Selecionar
                }
              </button>
            </co-row>
          } @empty {
            <p class="empty">Nenhum atleta vinculado a esta equipe ainda.</p>
          }
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
      max-width: 640px;
      overflow: auto;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
    .co-ghost-btn.active {
      color: var(--nx-win);
    }
  `,
})
export class PanelNovaConvocacaoComponent {
  private readonly callUpsService = inject(CallUpsService);
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    title: ['', Validators.required],
    responseDeadline: [''],
    message: [''],
  });

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected isSelected(uid: string): boolean {
    return this.selected().has(uid);
  }

  protected toggle(uid: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    const squadId = this.squadContext.activeSquadId();
    if (!squadId) {
      this.error.set('Selecione uma equipe ativa.');
      return;
    }
    if (this.form.invalid || this.selected().size === 0) {
      this.error.set('Informe um título e selecione ao menos um atleta.');
      return;
    }
    this.sending.set(true);
    try {
      const raw = this.form.getRawValue();
      await this.callUpsService.sendCallUp({
        squadId,
        title: raw.title,
        message: raw.message,
        responseDeadline: raw.responseDeadline,
        recipients: Array.from(this.selected()),
      });
      void this.router.navigateByUrl('/painel/convocacoes');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível enviar a convocação.');
    } finally {
      this.sending.set(false);
    }
  }
}
