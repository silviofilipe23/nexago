import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormSelectComponent } from '../ui/form-select.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';
import { AthletesService, type AthleteSearchHit } from './athletes.service';

@Component({
  selector: 'co-panel-novo-atleta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AthleteAvatarComponent,
    FormFieldComponent,
    FormSelectComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Convidar atleta" subtitle="Vincular um atleta que já tem conta no nexaGO" />

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        @if (sent()) {
          <co-panel-card title="Convite enviado!" kicker="Aguardando aceite">
            <p class="desc">
              {{ found()?.displayName }} vai receber uma notificação para aceitar o vínculo. Assim que aceitar, aparece na sua lista de atletas.
            </p>
            <button type="button" class="co-ghost-btn" (click)="reset()">Convidar outro atleta</button>
          </co-panel-card>
        } @else {
          <co-panel-card title="Buscar atleta" kicker="Por e-mail cadastrado no nexaGO">
            <form [formGroup]="searchForm" class="search-row" (ngSubmit)="search()">
              <co-form-field label="E-mail do atleta" type="text" placeholder="atleta@email.com" formControlName="email" [wide]="true" />
              <button type="submit" class="co-mini-btn co-mini-btn-primary" [disabled]="searching()">
                @if (searching()) { Buscando… } @else { Buscar }
              </button>
            </form>

            @if (searched() && !found()) {
              <p class="desc">Nenhum atleta encontrado com este e-mail.</p>
            }

            @if (found(); as hit) {
              <div class="found-row">
                <co-athlete-avatar [initials]="hit.initials" [size]="44" />
                <div class="found-body">
                  <div class="found-name">{{ hit.displayName }}</div>
                </div>
              </div>
              <form [formGroup]="assignForm">
                <co-form-select label="Equipe (opcional)" [options]="squadOptions()" formControlName="squadName" />
              </form>
              <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="inviting()" (click)="invite(hit)">
                @if (inviting()) { Enviando… } @else { Enviar convite }
              </button>
            }
          </co-panel-card>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      max-width: 560px;
    }
    .search-row {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      margin-bottom: 16px;
    }
    .search-row co-form-field {
      flex: 1;
    }
    .desc {
      color: var(--nx-text-mute);
      font-size: 13px;
      line-height: 1.5;
    }
    .found-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-top: 1px solid var(--nx-line);
      margin-top: 4px;
      margin-bottom: 16px;
    }
    .found-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }
  `,
})
export class PanelNovoAtletaComponent {
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly searchForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly assignForm = this.fb.group({
    squadName: 'Nenhuma',
  });

  protected readonly squadOptions = () => ['Nenhuma', ...this.squadContext.squads().map((s) => s.name)];

  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  protected readonly found = signal<AthleteSearchHit | null>(null);
  protected readonly inviting = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async search(): Promise<void> {
    this.error.set(null);
    if (this.searchForm.invalid) {
      this.error.set('Informe um e-mail válido.');
      return;
    }
    this.searching.set(true);
    this.searched.set(false);
    this.found.set(null);
    try {
      const hit = await this.athletesService.searchAthleteByEmail(this.searchForm.getRawValue().email);
      this.found.set(hit);
      this.searched.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível buscar o atleta.');
    } finally {
      this.searching.set(false);
    }
  }

  protected async invite(hit: AthleteSearchHit): Promise<void> {
    this.error.set(null);
    this.inviting.set(true);
    try {
      const squadName = this.assignForm.getRawValue().squadName;
      const squad = this.squadContext.squads().find((s) => s.name === squadName);
      await this.athletesService.inviteAthlete(hit.uid, hit.displayName, squad?.id ?? null);
      this.sent.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível enviar o convite.');
    } finally {
      this.inviting.set(false);
    }
  }

  protected reset(): void {
    this.searchForm.reset({ email: '' });
    this.assignForm.reset({ squadName: 'Nenhuma' });
    this.searched.set(false);
    this.found.set(null);
    this.sent.set(false);
  }
}
