import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ArenaCourt } from '../courts/court.model';
import { fetchCourtsList } from '../courts/courts-repository';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { ToggleComponent } from '../ui/toggle.component';
import { saveArenaWeatherPolicy } from './weather-repository';
import { WxIconComponent } from './weather-ui';
import {
  DEFAULT_WEATHER_POLICY,
  WEATHER_CREDIT_VALIDITY,
  WEATHER_DEADLINE_LABEL,
  WEATHER_MID_GAME,
  WEATHER_MID_GAME_LABEL,
  WEATHER_REQUEST_DEADLINES,
  WEATHER_RESCHEDULE_DAYS,
  creditValidityLabel,
  policyCourtCount,
  policyCourtIncluded,
  togglePolicyCourt,
  weatherPolicyAthleteText,
  weatherPolicyFromArenaDoc,
  weatherPolicySummary,
  type WeatherCreditValidity,
  type WeatherPolicy,
  type WeatherTrigger,
} from './weather.model';

interface TriggerOption {
  id: WeatherTrigger;
  title: string;
  sub: string;
  badge: string | null;
}

const TRIGGER_OPTIONS: readonly TriggerOption[] = [
  {
    id: 'arena',
    title: 'A arena ativa o Modo chuva',
    sub: 'Você marca o período e as quadras. Os atletas afetados são avisados e o cancelamento é liberado na hora, sem aprovação.',
    badge: null,
  },
  {
    id: 'request',
    title: 'O atleta solicita, a arena aprova',
    sub: 'O atleta pede pela reserva e cada pedido chega para você aprovar em Solicitações.',
    badge: null,
  },
  {
    id: 'auto',
    title: 'Automático pela previsão',
    sub: 'O atleta pede; aprovamos sozinho quando a previsão da hora passa de 70% e 2 mm/h, senão vai para você.',
    badge: 'Beta',
  },
];

/** 01 · Política de clima (`/painel/agenda/chuva/politica`): grava `arenas/{id}.weatherPolicy`
 *  pela callable `saveArenaWeatherPolicy`. Enquanto não há edição, o formulário segue o doc vivo
 *  da arena; editando, o que chega do servidor não atropela o rascunho. */
@Component({
  selector: 'ar-panel-weather-policy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, ToggleComponent, IconComponent, WxIconComponent],
  styleUrl: './weather.scss',
  template: `
    <ar-panel-shell>
      <ar-page-header title="Política de clima" subtitle="Agenda · Reservas · Cancelamento por chuva">
        <div class="header-actions">
          <a class="ar-ghost-btn" routerLink="/painel/agenda/chuva">Modo chuva</a>
          <a class="ar-ghost-btn" routerLink="/painel/agenda/chuva/solicitacoes">Solicitações</a>
          <button type="button" class="ar-ghost-btn discard-btn" [disabled]="!dirty() || saving()" (click)="discard()">Descartar</button>
          <button
            type="button"
            class="ar-mini-btn ar-mini-btn-primary save-btn"
            [disabled]="readOnly() || saving() || !dirty() || !valid()"
            (click)="save()"
          >
            <ar-icon name="check" [size]="14" />
            {{ saving() ? 'Salvando…' : 'Salvar política' }}
          </button>
        </div>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else {
          @if (readOnly()) {
            <div class="info-banner">Seu cargo pode ver a política, mas não alterar.</div>
          }
          @if (error(); as err) {
            <div class="error-banner" role="alert">{{ err }}</div>
          }
          @if (notice(); as n) {
            <div class="notice" role="status">{{ n }}</div>
          }

          <div class="ar-split" style="--ar-split-aside: 360px">
            <div class="col">
              <ar-panel-card pad="sm">
                <div class="master">
                  <div class="wx-icon-tile"><ar-wx-icon name="rain" [size]="22" /></div>
                  <div class="master-text">
                    <div class="master-title">Cancelamento por chuva sem custo</div>
                    <div class="master-sub">Quando chove, o atleta remarca ou guarda o valor como crédito. O dinheiro continua na arena.</div>
                  </div>
                  <ar-toggle
                    class="master-toggle"
                    label="Cancelamento por chuva sem custo"
                    [checked]="policy().enabled"
                    [disabled]="readOnly()"
                    (changed)="patch({ enabled: $event })"
                  />
                </div>
              </ar-panel-card>

              <ar-panel-card title="O que o atleta pode escolher" kicker="Opções">
                <div class="opt-row">
                  <div class="opt-icon" [class.on]="policy().allowReschedule"><ar-wx-icon name="swap" [size]="17" /></div>
                  <div class="opt-text">
                    <div class="opt-title" [class.off]="!policy().allowReschedule">Remarcar sem custo</div>
                    <div class="opt-sub">Escolhe outro horário livre. Se o novo horário for mais caro, paga só a diferença na arena; se for mais barato, a sobra vira crédito.</div>
                    <div class="chip-row opt-chips">
                      @for (d of rescheduleDays; track d; let first = $first) {
                        <button
                          type="button"
                          class="ar-chip reschedule-chip"
                          [class.active]="policy().rescheduleDays === d"
                          [disabled]="readOnly() || !policy().allowReschedule"
                          (click)="patch({ rescheduleDays: d })"
                        >
                          {{ first ? 'Usar em até ' + d + ' dias' : d + ' dias' }}
                        </button>
                      }
                    </div>
                  </div>
                  <ar-toggle label="Remarcar sem custo" [checked]="policy().allowReschedule" [disabled]="readOnly()" (changed)="patch({ allowReschedule: $event })" />
                </div>

                <div class="opt-row">
                  <div class="opt-icon on"><ar-wx-icon name="credit" [size]="17" /></div>
                  <div class="opt-text">
                    <div class="opt-title">Guardar como crédito na arena</div>
                    <div class="opt-sub">
                      O valor pago vira saldo do atleta, aceito em qualquer reserva da {{ arenaName() }}. Fica sempre ligado: é o destino de
                      quem não escolher em 24h.
                    </div>
                    <div class="chip-row opt-chips">
                      @for (v of creditValidity; track $index) {
                        <button
                          type="button"
                          class="ar-chip validity-chip"
                          [class.active]="policy().creditValidityDays === v"
                          [disabled]="readOnly()"
                          (click)="setValidity(v)"
                        >
                          {{ validityChipLabel(v) }}
                        </button>
                      }
                    </div>
                  </div>
                  <ar-toggle label="Guardar como crédito (sempre ligado)" [checked]="true" [disabled]="true" />
                </div>

                <div class="opt-row last">
                  <div class="opt-icon"><ar-wx-icon name="refund" [size]="17" /></div>
                  <div class="opt-text">
                    <div class="opt-title off">Reembolso no Pix <ar-pill tone="dim">Em breve</ar-pill></div>
                    <div class="opt-sub">Devolve o dinheiro. Sai do seu caixa: ainda não está disponível.</div>
                  </div>
                  <ar-toggle label="Reembolso no Pix (em breve)" [checked]="false" [disabled]="true" />
                </div>
              </ar-panel-card>

              <ar-panel-card title="Quem aciona" kicker="Regra">
                <div class="radios" role="radiogroup" aria-label="Quem aciona o cancelamento por chuva">
                  @for (t of triggerOptions; track t.id) {
                    <button
                      type="button"
                      role="radio"
                      class="radio"
                      [class.on]="policy().trigger === t.id"
                      [attr.aria-checked]="policy().trigger === t.id"
                      [disabled]="readOnly()"
                      (click)="patch({ trigger: t.id })"
                    >
                      <span class="radio-dot"><span class="radio-dot-inner"></span></span>
                      <span class="radio-text">
                        <span class="radio-title">
                          {{ t.title }}
                          @if (t.badge) {
                            <ar-pill tone="dim">{{ t.badge }}</ar-pill>
                          }
                        </span>
                        <span class="radio-sub">{{ t.sub }}</span>
                      </span>
                    </button>
                  }
                </div>
              </ar-panel-card>

              <ar-panel-card title="Quando vale" kicker="Limites">
                <div class="limits">
                  <div>
                    <div class="wx-kicker">Prazo para pedir</div>
                    <div class="chip-row limit-chips">
                      @for (d of deadlines; track d) {
                        <button type="button" class="ar-chip" [class.active]="policy().requestDeadline === d" [disabled]="readOnly()" (click)="patch({ requestDeadline: d })">
                          {{ deadlineLabel[d] }}
                        </button>
                      }
                    </div>
                  </div>
                  <div>
                    <div class="wx-kicker">Chuva no meio do jogo</div>
                    <div class="chip-row limit-chips">
                      @for (m of midGameOptions; track m) {
                        <button type="button" class="ar-chip" [class.active]="policy().midGame === m" [disabled]="readOnly()" (click)="patch({ midGame: m })">
                          {{ midGameLabel[m] }}
                        </button>
                      }
                    </div>
                  </div>
                  <div class="full">
                    <div class="wx-kicker">Quadras</div>
                    @if (courtsLoading()) {
                      <p class="fine limit-chips">Carregando quadras…</p>
                    } @else if (courts().length === 0) {
                      <p class="fine limit-chips">Nenhuma quadra cadastrada: a política vale para todas as que forem criadas.</p>
                    } @else {
                      <div class="chip-row limit-chips">
                        @for (c of courts(); track c.id) {
                          <button
                            type="button"
                            class="ar-chip court-chip"
                            [class.active]="courtIncluded(c.id)"
                            [attr.aria-pressed]="courtIncluded(c.id)"
                            [disabled]="readOnly()"
                            (click)="toggleCourt(c.id)"
                          >
                            {{ c.name }}
                          </button>
                        }
                      </div>
                    }
                    @if (noCourtSelected()) {
                      <p class="fine field-error">Marque ao menos uma quadra.</p>
                    } @else {
                      <p class="fine court-hint">Desmarque as quadras cobertas: elas ficam fora do Modo chuva e dos pedidos.</p>
                    }
                  </div>
                </div>
              </ar-panel-card>
            </div>

            <div class="col">
              <ar-panel-card title="Como o atleta vê" kicker="Prévia no app">
                <div class="preview">
                  <ar-wx-icon class="wx-blue-text" name="rain" [size]="18" />
                  <div>
                    <div class="preview-title">{{ policy().enabled ? 'Choveu? Sem custo.' : 'Desligado' }}</div>
                    <div class="preview-text">
                      {{ policy().enabled ? athleteText() : 'Com a política desligada, o atleta não vê nenhuma opção de chuva.' }}
                    </div>
                  </div>
                </div>
                <p class="fine preview-note">Aparece nos detalhes da reserva e no aviso de chuva do app.</p>
              </ar-panel-card>

              <ar-panel-card title="Resumo">
                <div class="wx-lines">
                  @for (line of summary(); track line.label) {
                    <div class="wx-line">
                      <span>{{ line.label }}</span>
                      <span class="v" [class.strong]="line.strong">{{ line.value }}</span>
                    </div>
                  }
                </div>
              </ar-panel-card>
            </div>
          </div>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    @use 'breakpoints' as ar;

    .master {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .master-text {
      flex: 1;
      min-width: 0;
    }

    .master-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }

    .master-sub {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 3px;
      line-height: 1.45;
    }

    .opt-row {
      display: flex;
      gap: 14px;
      padding: 14px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .opt-row.last {
      border-bottom: none;
      padding-bottom: 0;
    }

    .opt-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      color: var(--nx-text-dim);
    }

    .opt-icon.on {
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }

    .opt-text {
      flex: 1;
      min-width: 0;
    }

    .opt-title {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .opt-title.off {
      color: var(--nx-text-mute);
    }

    .opt-sub {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 3px;
      line-height: 1.45;
    }

    .opt-chips,
    .limit-chips {
      margin-top: 10px;
    }

    .radios {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .radio {
      display: flex;
      gap: 12px;
      padding: 14px;
      border-radius: 12px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      text-align: left;
      cursor: pointer;
      font: inherit;
      color: inherit;
    }

    .radio:disabled {
      cursor: default;
    }

    .radio.on {
      background: rgba(255, 106, 26, 0.06);
      border-color: rgba(255, 106, 26, 0.35);
    }

    .radio-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      flex: none;
      margin-top: 1px;
      border: 1.5px solid var(--nx-line-strong);
      display: grid;
      place-items: center;
      box-sizing: border-box;
    }

    .radio.on .radio-dot {
      border-color: var(--nx-orange-500);
    }

    .radio-dot-inner {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .radio.on .radio-dot-inner {
      background: var(--nx-orange-500);
    }

    .radio-text {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .radio-title {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .radio-sub {
      font-size: 12px;
      color: var(--nx-text-dim);
      line-height: 1.45;
    }

    .limits {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }

    .limits .full {
      grid-column: 1 / -1;
    }

    .court-hint,
    .field-error {
      margin-top: 8px;
    }

    .field-error {
      color: var(--nx-live);
    }

    .preview {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 14px;
      border-radius: 14px;
      background: var(--nx-bg);
      border: 1px solid var(--nx-line);
    }

    .preview-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .preview-text {
      font-size: 12px;
      color: var(--nx-text-mute);
      margin-top: 4px;
      line-height: 1.5;
    }

    .preview-note {
      margin-top: 10px;
    }

    @include ar.below(sm) {
      .limits {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class PanelWeatherPolicyComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly rescheduleDays = WEATHER_RESCHEDULE_DAYS;
  protected readonly creditValidity = WEATHER_CREDIT_VALIDITY;
  protected readonly deadlines = WEATHER_REQUEST_DEADLINES;
  protected readonly deadlineLabel = WEATHER_DEADLINE_LABEL;
  protected readonly midGameOptions = WEATHER_MID_GAME;
  protected readonly midGameLabel = WEATHER_MID_GAME_LABEL;
  protected readonly triggerOptions = TRIGGER_OPTIONS;

  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? 'arena');

  protected readonly policy = signal<WeatherPolicy>({ ...DEFAULT_WEATHER_POLICY });
  private readonly saved = signal<WeatherPolicy>({ ...DEFAULT_WEATHER_POLICY });
  protected readonly courts = signal<ArenaCourt[]>([]);
  protected readonly courtsLoading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly dirty = computed(() => JSON.stringify(this.policy()) !== JSON.stringify(this.saved()));
  private readonly courtIds = computed(() => this.courts().map((c) => c.id));
  protected readonly noCourtSelected = computed(
    () => this.courts().length > 0 && policyCourtCount(this.policy().courtIds, this.courtIds()) === 0,
  );
  protected readonly valid = computed(() => !this.noCourtSelected());
  protected readonly summary = computed(() => weatherPolicySummary(this.policy(), this.courtIds()));
  protected readonly athleteText = computed(() => weatherPolicyAthleteText(this.policy(), this.arenaName()));

  constructor() {
    // Segue o doc vivo da arena enquanto não há edição em curso.
    effect(() => {
      const remote = weatherPolicyFromArenaDoc(this.arenaContext.arenaDocData());
      untracked(() => {
        if (this.dirty() || this.saving()) return;
        this.policy.set(remote);
        this.saved.set(remote);
      });
    });

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId) void this.loadCourts(arenaId);
    });
  }

  private async loadCourts(arenaId: string): Promise<void> {
    this.courtsLoading.set(true);
    try {
      this.courts.set(await fetchCourtsList(arenaFirestore(), arenaId));
    } catch {
      this.error.set('Não foi possível carregar as quadras.');
    } finally {
      this.courtsLoading.set(false);
    }
  }

  protected patch(change: Partial<WeatherPolicy>): void {
    this.policy.set({ ...this.policy(), ...change });
    this.notice.set(null);
  }

  protected setValidity(v: WeatherCreditValidity): void {
    this.patch({ creditValidityDays: v });
  }

  protected validityChipLabel(v: WeatherCreditValidity): string {
    if (v == null) return creditValidityLabel(v);
    return v === this.policy().creditValidityDays ? `Validade ${v} dias` : `${v} dias`;
  }

  protected courtIncluded(courtId: string): boolean {
    return policyCourtIncluded(this.policy().courtIds, courtId);
  }

  protected toggleCourt(courtId: string): void {
    this.patch({ courtIds: togglePolicyCourt(this.policy().courtIds, courtId, this.courtIds()) });
  }

  protected discard(): void {
    this.policy.set(this.saved());
    this.error.set(null);
    this.notice.set(null);
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.readOnly() || !this.valid() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const saved = await saveArenaWeatherPolicy(arenaFunctions(), arenaId, this.policy());
      this.policy.set(saved);
      this.saved.set(saved);
      this.notice.set(saved.enabled ? 'Política salva. O cancelamento por chuva está ligado.' : 'Política salva.');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar a política.');
    } finally {
      this.saving.set(false);
    }
  }
}
