import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { NxSkeletonComponent } from '../../shared/loading/nx-skeleton.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { OrganizerSettingsError, saveOrganizerDefaults } from '../data/organizer-settings-repository';
import {
  DEFAULT_ORGANIZER_EVENT_DEFAULTS,
  ORGANIZER_DEFAULTS_RANGE,
  clampOrganizerDefault,
  type OrganizerDefaultsCounter,
  type OrganizerEventDefaults,
} from '../data/organizer-settings.model';
import {
  BEST_OF_LABEL,
  BRACKET_SYSTEM_LABEL,
  SPORT_LABEL,
  SUPPORTED_BRACKET_SYSTEMS,
  type TournamentBestOf,
  type TournamentBracketSystem,
  type TournamentSport,
} from '../data/tournament-create.model';
import { OgCardComponent } from '../ui/card.component';
import { OgFormFieldComponent } from '../ui/form-field.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgRadioRowComponent } from '../ui/radio-row.component';
import { OgStepperStaticComponent } from '../ui/stepper-static.component';
import { OgToggleRowComponent } from '../ui/toggle-row.component';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const SPORTS: readonly TournamentSport[] = ['beachVolleyball', 'indoorVolleyball', 'footvolley'];
const BEST_OFS: readonly TournamentBestOf[] = ['singleSet', 'bestOf3', 'bestOf5'];

/** Card "Regras padrão de evento" de `/painel/config`: o que o wizard de criar torneio usa como
 *  ponto de partida (mapa `organizerDefaults`).
 *
 *  NÃO é onde se configura taxa da plataforma, estorno ou repasse: taxa de torneio é fixa em 8%
 *  com piso de R$1,50 (`TOURNAMENT_FEE_PERCENT`, functions/src/platform-fees.ts), não há estorno
 *  automático e o saque é sob demanda — nada disso é escolha do organizador.
 *
 *  As faixas dos contadores espelham as do wizard (ver `ORGANIZER_DEFAULTS_RANGE`): esta tela não
 *  pode aceitar valor que a tela que ela alimenta recusa, nem o contrário. */
@Component({
  selector: 'og-config-regras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OgCardComponent,
    OgIconComponent,
    OgFormFieldComponent,
    OgToggleRowComponent,
    OgStepperStaticComponent,
    OgRadioRowComponent,
    NxSkeletonComponent,
    NxSpinnerComponent,
  ],
  template: `
    <og-card title="Regras padrão de evento" kicker="Modelos">
      @if (!editing() && !loading()) {
        <button card-action type="button" class="og-ghost-btn" (click)="startEdit()">
          <og-icon name="edit" [size]="13" />Editar
        </button>
      }

      @if (loading()) {
        @for (i of skeletonRows; track i) {
          <div class="og-config-row" [class.last]="i === 6"><app-nx-skeleton w="40%" [h]="13" /><app-nx-skeleton w="34%" [h]="13" /></div>
        }
      } @else if (!editing()) {
        <p class="og-cfg-hint">Valem para torneios novos. Não alteram nada já criado.</p>
        <div class="og-config-row"><span class="lbl">Esporte</span><span class="val">{{ sportLabel[defaults().sport] }}</span></div>
        <div class="og-config-row"><span class="lbl">Formato padrão</span><span class="val">{{ bracketLabel[defaults().bracketSystem] }}</span></div>
        <div class="og-config-row"><span class="lbl">Partidas</span><span class="val">{{ bestOfLabel[defaults().bestOf] }}{{ defaults().finalBestOf5 ? ' · final MD5' : '' }}</span></div>
        <div class="og-config-row"><span class="lbl">Vagas por categoria</span><span class="val">{{ defaults().spots }} duplas</span></div>
        <div class="og-config-row"><span class="lbl">Inscrição padrão</span><span class="val">{{ brl(defaults().defaultPriceCents) }}</span></div>
        <div class="og-config-row"><span class="lbl">Quadras</span><span class="val">{{ defaults().courtsCount }}</span></div>
        <div class="og-config-row last"><span class="lbl">Pagamento</span><span class="val">{{ paymentLabel() }}</span></div>
      } @else {
        <p class="og-cfg-hint">Valem para torneios novos. Não alteram nada já criado.</p>

        <div class="og-field-grid">
          <og-form-field label="Esporte">
            <select class="og-select-el" [value]="draft().sport" (change)="patch({ sport: $any($event.target).value })">
              @for (s of sports; track s) {
                <option [value]="s">{{ sportLabel[s] }}</option>
              }
            </select>
          </og-form-field>
          <og-form-field label="Inscrição padrão (R$)">
            <input class="og-input-el" type="number" min="0" step="10" [value]="draft().defaultPriceCents / 100" (input)="setPrice($any($event.target).value)" />
          </og-form-field>
          <og-stepper-static label="Quadras" [value]="'' + draft().courtsCount" suffix="quadras" (bump)="bump('courtsCount', $event)" />
          <og-stepper-static label="Vagas por categoria" [value]="'' + draft().spots" suffix="duplas" (bump)="bump('spots', $event)" />
        </div>

        <div class="og-cfg-section">Formato das categorias</div>
        <div class="og-field-grid">
          <og-form-field label="Formato padrão">
            <select class="og-select-el" [value]="draft().bracketSystem" (change)="patch({ bracketSystem: $any($event.target).value })">
              @for (b of bracketOptions(); track b) {
                <option [value]="b">{{ bracketLabel[b] }}</option>
              }
            </select>
          </og-form-field>
          <og-form-field label="Partidas">
            <select class="og-select-el" [value]="draft().bestOf" (change)="patch({ bestOf: $any($event.target).value })">
              @for (b of bestOfs; track b) {
                <option [value]="b">{{ bestOfLabel[b] }}</option>
              }
            </select>
          </og-form-field>
          @if (draft().bracketSystem === 'groupsThenKnockout') {
            <og-stepper-static label="Duplas por grupo" [value]="'' + draft().teamsPerGroup" (bump)="bump('teamsPerGroup', $event)" />
            <og-stepper-static label="Classificam" [value]="'' + draft().qualifiersPerGroup" (bump)="bump('qualifiersPerGroup', $event)" />
          }
          <og-stepper-static label="Limite de inscrições por atleta" [value]="'' + draft().maxRegistrationsPerAthlete" suffix="categorias" (bump)="bump('maxRegistrationsPerAthlete', $event)" />
        </div>
        <og-toggle-row title="Final em MD5" desc="A decisão do título é melhor de 5 sets." [on]="draft().finalBestOf5" (toggled)="patch({ finalBestOf5: $event })" />

        <div class="og-cfg-section">Inscrições</div>
        <og-radio-row
          title="Pix e cartão pelo app"
          desc="A NexaGO processa e repassa pra sua carteira."
          [selected]="draft().paymentMode === 'appPixCard'"
          style="cursor:pointer"
          (click)="patch({ paymentMode: 'appPixCard' })"
        />
        <og-radio-row
          title="Direto com o organizador"
          desc="Você cobra por fora; usa os dados do card Pagamentos."
          [selected]="draft().paymentMode === 'directWithOrganizer'"
          style="cursor:pointer"
          (click)="patch({ paymentMode: 'directWithOrganizer' })"
        />
        <og-radio-row
          title="Listagem pública"
          desc="Aparece na busca de torneios do app."
          [selected]="draft().visibility === 'publicListing'"
          style="cursor:pointer;margin-top:10px"
          (click)="patch({ visibility: 'publicListing' })"
        />
        <og-radio-row
          title="Somente por link"
          desc="Só quem tem o link encontra o torneio."
          [selected]="draft().visibility === 'linkOnly'"
          style="cursor:pointer"
          (click)="patch({ visibility: 'linkOnly' })"
        />
        <og-toggle-row title="Lista de espera" desc="Quando lotar, novas duplas entram na fila." [on]="draft().waitlistEnabled" (toggled)="patch({ waitlistEnabled: $event })" />
        <og-toggle-row title="Uniforme obrigatório" desc="Pede os dados de uniforme na inscrição." [on]="draft().uniformRequired" (toggled)="patch({ uniformRequired: $event })" />
        <og-toggle-row title="Vale ranking" desc="Os resultados contam pro ranking NexaGO." [on]="draft().rankingEnabled" (toggled)="patch({ rankingEnabled: $event })" />

        <div class="og-cfg-section">Regulamento padrão</div>
        <textarea
          class="og-textarea-el"
          rows="4"
          [value]="draft().regulationNotes"
          (input)="patch({ regulationNotes: $any($event.target).value })"
          placeholder="Observações que se repetem em todos os seus torneios."
        ></textarea>

        <div class="og-cfg-actions">
          <button type="button" class="og-ghost-btn" [disabled]="saving()" (click)="cancel()">Cancelar</button>
          <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="saving()" (click)="submit()">
            @if (saving()) {
              <app-nx-spinner [size]="12" tone="dark" />
            }
            {{ saving() ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>
      }

      @if (feedback(); as f) {
        <p class="og-cfg-feedback" [style.color]="f.ok ? 'var(--nx-win)' : 'var(--nx-live)'">{{ f.message }}</p>
      }
    </og-card>
  `,
  styles: `
    .og-cfg-section {
      margin: 20px 0 12px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: var(--nx-text-mute);
    }
  `,
})
export class OgConfigRegrasCardComponent {
  readonly uid = input.required<string>();
  readonly defaults = input.required<OrganizerEventDefaults>();
  readonly loading = input(false);

  protected readonly skeletonRows = [1, 2, 3, 4, 5, 6];
  protected readonly sports = SPORTS;
  protected readonly bestOfs = BEST_OFS;
  /** Só os formatos com geração de chave implementada — default que nasce bloqueado no wizard
   *  seria uma armadilha. */
  protected readonly bracketSystems = SUPPORTED_BRACKET_SYSTEMS;
  protected readonly sportLabel = SPORT_LABEL;
  protected readonly bracketLabel = BRACKET_SYSTEM_LABEL;
  protected readonly bestOfLabel = BEST_OF_LABEL;

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly draft = signal<OrganizerEventDefaults>(DEFAULT_ORGANIZER_EVENT_DEFAULTS);

  protected readonly paymentLabel = computed(() =>
    this.defaults().paymentMode === 'appPixCard' ? 'Pix e cartão pelo app' : 'Direto com o organizador',
  );

  /** Normalmente só os formatos suportados. Se o doc trouxer um formato antigo/não suportado, ele
   *  entra na lista para o select não abrir em branco — o organizador vê o que está valendo e
   *  troca se quiser, em vez de perder a opção sem aviso. */
  protected readonly bracketOptions = computed<readonly TournamentBracketSystem[]>(() => {
    const current = this.draft().bracketSystem;
    return this.bracketSystems.includes(current) ? this.bracketSystems : [current, ...this.bracketSystems];
  });

  protected brl(cents: number): string {
    return BRL.format(cents / 100);
  }

  protected startEdit(): void {
    this.draft.set({ ...this.defaults() });
    this.feedback.set(null);
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
  }

  protected patch(partial: Partial<OrganizerEventDefaults>): void {
    this.draft.update((d) => ({ ...d, ...partial }));
  }

  protected bump(field: OrganizerDefaultsCounter, delta: number): void {
    const step = ORGANIZER_DEFAULTS_RANGE[field].step;
    const next = clampOrganizerDefault(field, this.draft()[field] + delta * step);
    this.draft.update((d) => ({ ...d, [field]: next }));
  }

  /** Mesma conversão do wizard (`toCents`): o input mostra reais, o doc guarda centavos. */
  protected setPrice(value: string): void {
    const n = Number(value);
    this.patch({ defaultPriceCents: Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0 });
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.feedback.set(null);
    try {
      await saveOrganizerDefaults(this.uid(), this.draft());
      this.editing.set(false);
      this.feedback.set({ ok: true, message: 'Regras padrão atualizadas.' });
    } catch (err) {
      const message = err instanceof OrganizerSettingsError ? err.message : 'Não foi possível salvar as regras.';
      this.feedback.set({ ok: false, message });
    } finally {
      this.saving.set(false);
    }
  }
}
