import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import {
  type LeagueStageDraft,
  type PublishedLeagueForStageAdd,
  emptyStageDraft,
  getPublishedLeagueForStageAdd,
  saveLeagueStage,
} from '../../data/league-create.model';
import { listMyLeagues } from '../../data/leagues-repository';
import type { OrganizerLeague } from '../../data/league.model';
import { OgCardComponent } from '../../ui/card.component';
import { OgFormFieldComponent } from '../../ui/form-field.component';
import { OgIconComponent } from '../../ui/icon.component';
import { OgReviewRowComponent } from '../../ui/review-row.component';
import { OgStepperStaticComponent } from '../../ui/stepper-static.component';
import { BrLocationsService } from '../../../shared/br-locations/br-locations.service';
import { OgWizardShellComponent } from '../../ui/wizard-shell.component';

type Step = 1 | 2 | 3;

const TITLES = ['', 'Liga e local', 'Inscrições', 'Publicar a etapa'];
const SUBTITLES = [
  '',
  'Escolha o circuito e onde a etapa acontece — categorias, formato e ranking vêm da liga.',
  'Janela de inscrição e quadras desta etapa.',
  'Confira — preço, formato e ranking seguem a liga.',
];

function dateToInput(d: Date | null): string {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inputToDate(v: string): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Wizard REAL de nova etapa — espelha `league_stage_create` (Flutter)/`saveStage`: escolhe
 *  uma liga PUBLICADA do organizador, define local/datas/inscrições, e publica o torneio da
 *  etapa (batch: torneio + merge no `stages[]` da liga, herdando categorias/preço/ranking). */
@Component({
  selector: 'og-criar-etapa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgWizardShellComponent, OgCardComponent, OgFormFieldComponent, OgStepperStaticComponent, OgReviewRowComponent, OgIconComponent],
  template: `
    @if (publishedTournamentId(); as pubId) {
      <div class="og-wizard-done" style="background:radial-gradient(60% 50% at 50% 30%, rgba(43,209,126,0.14) 0%, transparent 65%)">
        <div class="og-wizard-done-badge" style="background:var(--nx-win);box-shadow:0 0 0 1px rgba(43,209,126,0.4),0 16px 48px rgba(43,209,126,0.30)">
          <og-icon name="check" [size]="44" style="color:#0a0a0a" />
        </div>
        <div>
          <div class="og-wizard-done-kicker" style="color:var(--nx-win)">Etapa no ar</div>
          <h1>Etapa publicada!</h1>
          <p>O torneio da etapa já está aberto pra inscrições, herdando as categorias da liga.</p>
        </div>
        <div class="og-wizard-done-actions">
          <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/eventos', pubId]">Ver página da etapa</a>
          <a class="og-ghost-btn" routerLink="/painel/eventos">Meus eventos</a>
        </div>
      </div>
    } @else {
      <og-wizard-shell
        flow="Nova etapa"
        [total]="3"
        [step]="step()"
        [title]="titles[step()]!"
        [subtitle]="subtitles[step()]!"
        [ctaLabel]="step() === 3 ? 'Publicar etapa' : 'Continuar'"
        [ctaDisabled]="saving()"
        [ctaBusy]="saving()"
        ctaBusyLabel="Publicando…"
        busyTitle="Publicando etapa…"
        busyDescription="Criando a etapa e vinculando ao circuito."
        [showDraft]="false"
        (cta)="onCta()"
        (back)="onBack()"
      >
        @if (feedback(); as fb) {
          <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
        }

        @switch (step()) {
          @case (1) {
            <og-card kicker="Circuito" title="Qual liga recebe a etapa?">
              @if (loadingLeagues()) {
                <p class="og-etapa-hint">Carregando ligas…</p>
              } @else if (leagues().length === 0) {
                <p class="og-etapa-hint">Nenhuma liga publicada — crie um circuito primeiro.</p>
              } @else {
                <select class="og-select-el" [value]="selectedLeagueId() ?? ''" (change)="onLeague($event)">
                  <option value="" disabled>Escolha a liga…</option>
                  @for (l of leagues(); track l.id) {
                    <option [value]="l.id">{{ l.name }}</option>
                  }
                </select>
                @if (leagueError(); as msg) {
                  <p class="og-etapa-error">{{ msg }}</p>
                }
                @if (league(); as lg) {
                  <p class="og-etapa-hint">Etapa {{ stage().order }} · categorias herdadas: {{ lg.categoriesRaw.length }}</p>
                }
              }
            </og-card>
            <og-card kicker="Local" title="Onde acontece">
              <div class="og-field-grid">
                <og-form-field label="Nome da etapa (vazio = 'Liga · Etapa N')">
                  <input class="og-input-el" [value]="stage().name" (input)="patchStage({ name: $any($event.target).value })" />
                </og-form-field>
                <og-form-field label="Arena / local">
                  <input class="og-input-el" [value]="stage().locationName" (input)="patchStage({ locationName: $any($event.target).value })" />
                </og-form-field>
              </div>
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="UF da etapa (vazio = UF da liga)">
                  <select class="og-select-el" [value]="stage().state" (change)="onStageStateChange($any($event.target).value)">
                    <option value="">— usa UF da liga —</option>
                    @for (s of brLocations.states; track s.sigla) {
                      <option [value]="s.sigla">{{ s.name }} ({{ s.sigla }})</option>
                    }
                  </select>
                </og-form-field>
                <og-form-field label="Cidade (vazio = cidade da liga)">
                  <select class="og-select-el" [value]="stage().city" [disabled]="!stageEffectiveState()" (change)="patchStage({ city: $any($event.target).value })">
                    <option value="">{{ !stageEffectiveState() ? 'Defina a UF da liga primeiro' : '— usa cidade da liga —' }}</option>
                    @for (c of citiesForStageState(); track c) {
                      <option [value]="c">{{ c }}</option>
                    }
                  </select>
                </og-form-field>
              </div>
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="Início">
                  <input class="og-input-el" type="date" [value]="dateVal(stage().startAt)" (input)="patchStage({ startAt: toDateVal($any($event.target).value) })" />
                </og-form-field>
                <og-form-field label="Fim">
                  <input class="og-input-el" type="date" [value]="dateVal(stage().endAt)" (input)="patchStage({ endAt: toDateVal($any($event.target).value) })" />
                </og-form-field>
              </div>
            </og-card>
          }
          @case (2) {
            <og-card kicker="Período" title="Janela de inscrição (opcional)">
              <div class="og-field-grid">
                <og-form-field label="Abrem em">
                  <input class="og-input-el" type="date" [value]="dateVal(registrationOpensAt())" (input)="registrationOpensAt.set(toDateVal($any($event.target).value))" />
                </og-form-field>
                <og-form-field label="Fecham em">
                  <input class="og-input-el" type="date" [value]="dateVal(registrationClosesAt())" (input)="registrationClosesAt.set(toDateVal($any($event.target).value))" />
                </og-form-field>
              </div>
            </og-card>
            <og-card kicker="Estrutura" title="Quadras">
              <og-stepper-static label="Quadras disponíveis" [value]="'' + courtsCount()" suffix="quadras" (bump)="bumpCourts($event)" />
            </og-card>
          }
          @case (3) {
            <og-card [title]="stageName()">
              <og-review-row label="Liga" [value]="league()?.leagueName ?? '—'" />
              <og-review-row label="Local" [value]="reviewLocal()" />
              <og-review-row label="Datas" [value]="reviewDates()" />
              <og-review-row label="Categorias" [value]="(league()?.categoriesRaw?.length ?? 0) + ' herdadas da liga'" />
              <og-review-row label="Quadras" [value]="courtsCount() + ' quadras'" />
            </og-card>
          }
        }
      </og-wizard-shell>
    }
  `,
  styles: `
    .og-etapa-hint {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin: 10px 0 0;
    }
    .og-etapa-error {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
      margin: 10px 0 0;
    }
  `,
})
export class CriarEtapaComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly brLocations = inject(BrLocationsService);

  protected readonly titles = TITLES;
  protected readonly subtitles = SUBTITLES;

  protected readonly step = signal<Step>(1);
  protected readonly saving = signal(false);
  protected readonly loadingLeagues = signal(true);
  protected readonly leagues = signal<OrganizerLeague[]>([]);
  protected readonly selectedLeagueId = signal<string | null>(null);
  protected readonly league = signal<PublishedLeagueForStageAdd | null>(null);
  protected readonly leagueError = signal<string | null>(null);
  protected readonly stage = signal<LeagueStageDraft>(emptyStageDraft(1));
  protected readonly registrationOpensAt = signal<Date | null>(null);
  protected readonly registrationClosesAt = signal<Date | null>(null);
  protected readonly courtsCount = signal(4);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly publishedTournamentId = signal<string | null>(null);

  protected readonly stageName = computed(() => {
    const s = this.stage();
    const lg = this.league();
    return s.name.trim() || (lg ? `${lg.leagueName} · Etapa ${s.order}` : `Etapa ${s.order}`);
  });

  constructor() {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.loadingLeagues.set(false);
      return;
    }
    void listMyLeagues(uid)
      .then((leagues) => this.leagues.set(leagues))
      .finally(() => this.loadingLeagues.set(false));
  }

  protected patchStage(partial: Partial<LeagueStageDraft>): void {
    this.stage.update((s) => ({ ...s, ...partial }));
  }

  protected readonly stageEffectiveState = computed(() => this.stage().state || this.league()?.state || '');
  protected readonly citiesForStageState = computed(() => this.brLocations.citiesFor(this.stageEffectiveState()));

  protected onStageStateChange(uf: string): void {
    this.patchStage({ state: uf, city: '' });
  }

  protected dateVal = dateToInput;
  protected toDateVal = inputToDate;

  protected onLeague(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (!id) return;
    this.selectedLeagueId.set(id);
    this.leagueError.set(null);
    const uid = this.auth.user()?.uid;
    if (!uid) return;
    void getPublishedLeagueForStageAdd(id, uid)
      .then((league) => {
        this.league.set(league);
        const nextOrder = league.existingStages.length + 1;
        this.stage.update((s) => ({ ...s, order: nextOrder, id: `stage-${nextOrder}-${Date.now()}` }));
      })
      .catch((e) => {
        this.league.set(null);
        this.leagueError.set((e as Error).message);
      });
  }

  protected bumpCourts(delta: number): void {
    this.courtsCount.update((v) => Math.min(Math.max(v + delta, 1), 20));
  }

  protected onCta(): void {
    this.feedback.set(null);
    const s = this.step();
    if (s === 1) {
      if (!this.league()) {
        this.feedback.set({ ok: false, message: 'Escolha uma liga publicada.' });
        return;
      }
      if (!this.stage().locationName.trim() || !this.stage().startAt) {
        this.feedback.set({ ok: false, message: 'Preencha local e data de início da etapa.' });
        return;
      }
      this.step.set(2);
      return;
    }
    if (s === 2) {
      this.step.set(3);
      return;
    }
    void this.publish();
  }

  protected onBack(): void {
    this.feedback.set(null);
    if (this.step() > 1) this.step.set((this.step() - 1) as Step);
  }

  private async publish(): Promise<void> {
    const uid = this.auth.user()?.uid;
    const league = this.league();
    if (!uid || !league || this.saving()) return;
    this.saving.set(true);
    try {
      const tournamentId = await saveLeagueStage({
        league,
        stage: this.stage(),
        managerId: uid,
        registrationOpensAt: this.registrationOpensAt(),
        registrationClosesAt: this.registrationClosesAt(),
        courtsCount: this.courtsCount(),
      });
      this.publishedTournamentId.set(tournamentId);
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao publicar a etapa.' });
    } finally {
      this.saving.set(false);
    }
  }

  protected reviewLocal(): string {
    const s = this.stage();
    const lg = this.league();
    return `${s.locationName.trim()} · ${s.city.trim() || lg?.city || ''}`;
  }

  protected reviewDates(): string {
    const s = this.stage();
    if (!s.startAt) return 'Data a definir';
    return `${dateToInput(s.startAt)}${s.endAt ? ` a ${dateToInput(s.endAt)}` : ''}`;
  }
}
