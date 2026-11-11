import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { parsePrice } from '../aulas/billing.model';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { ToggleComponent } from '../ui/toggle.component';
import { bookingAllocationFromArena } from '../courts/booking-allocation';
import { brl } from './ph-format';
import { PhIconBoxComponent, PhLineComponent, PhPageComponent } from './planos-horario-ui';
import {
  BANDS,
  ONLINE_BILLING_FEE_TEXT,
  cycleMonthlyPrice,
  gridFromWindows,
  holdsSlot,
  paymentFormBilling,
  planEconomy,
  windowCellKey,
  windowsFromGrid,
  type BandId,
} from './schedule-plan.logic';
import {
  DEFAULT_PLAN_BILLING,
  DEFAULT_PLAN_CYCLES,
  DEFAULT_PLAN_RULES,
  PAYMENT_FORMS,
  PAYMENT_FORM_LABEL,
  WEEKDAYS,
  WEEKDAY_SHORT,
  type PlanBilling,
  type PlanCycles,
  type PlanRules,
  type ScheduleBookingMode,
  type SchedulePaymentForm,
  type SchedulePlan,
  type SchedulePlanStatus,
} from './schedule-plan.model';
import { upsertSchedulePlan } from './schedule-plan-repository';
import { SchedulePlansStore } from './schedule-plans.store';

interface EditorDraft {
  name: string;
  description: string;
  status: SchedulePlanStatus;
  bookingMode: ScheduleBookingMode;
  timesPerWeek: number;
  durationMinutes: number;
  cells: Set<string>;
  courtIds: string[];
  capacity: string;
  price: string;
  reference: string;
  cycles: PlanCycles;
  billing: PlanBilling;
  rules: PlanRules;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function priceText(n: number | null): string {
  return n == null || n <= 0 ? '' : String(n).replace('.', ',');
}

const DUE_DAYS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Dia 1' }, { value: 5, label: 'Dia 5' }, { value: 10, label: 'Dia 10' },
  { value: 15, label: 'Dia 15' }, { value: 0, label: 'Data da assinatura' },
];

/** 02 · Editar plano — horário (janela dias × faixas e quadras), vagas, preço por ciclo, cobrança
 *  e regras. Salva como rascunho ou publica (`upsertArenaSchedulePlan`). */
@Component({
  selector: 'ar-panel-ph-plan-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhPageComponent, PhLineComponent, PhIconBoxComponent, PanelCardComponent, ToggleComponent, ModalComponent, IconComponent, RouterLink],
  styleUrl: './planos-horario.scss',
  template: `
    <ar-ph-page [title]="title()" subtitle="Planos de horário · {{ planId ? 'Editar plano' : 'Novo plano' }}" [empty]="!planId">
      <div page-actions class="actions">
        @if (planId) {
          <span class="head-hint">Mudanças de preço valem na próxima renovação</span>
        }
        <a class="ar-ghost-btn" routerLink="/painel/planos-horario">Descartar</a>
        @if (d().status !== 'active') {
          <button type="button" class="ar-mini-btn" [disabled]="saving() || readOnly() || !valid()" (click)="save('draft')">Salvar rascunho</button>
        }
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving() || readOnly() || !valid()" (click)="save('active')">
          <ar-icon name="check" [size]="14" /> {{ saving() ? 'Salvando…' : d().status === 'active' ? 'Salvar plano' : 'Publicar plano' }}
        </button>
      </div>

      @if (store.loading() && planId) {
        <p class="state-text">Carregando plano…</p>
      } @else if (planId && !original()) {
        <p class="state-text">Plano não encontrado. <a class="cta" routerLink="/painel/planos-horario">Voltar aos planos</a></p>
      } @else {
        @if (error(); as err) {
          <div class="error-banner">{{ err }}</div>
        }
        @if (problems().length > 0 && touched()) {
          <div class="error-banner">{{ problems().join(' · ') }}</div>
        }
        <div class="layout">
          <div class="col">
            <ar-panel-card title="Horário" kicker="O que o atleta garante">
              <div class="stack">
                <div>
                  <div class="field-label">Nome do plano</div>
                  <input class="input-box" type="text" maxlength="60" placeholder="Ex.: Fixo Noite" [value]="d().name" (input)="patch({ name: $any($event.target).value })" />
                </div>
                <div>
                  <div class="field-label">Como o assinante joga</div>
                  <div class="chip-row" data-testid="ph-plan-booking-mode">
                    <button type="button" class="sm-chip" [class.active]="d().bookingMode === 'flexible'" [disabled]="modeLocked()" (click)="setMode('flexible')">Horário livre</button>
                    <button type="button" class="sm-chip" [class.active]="d().bookingMode === 'fixed'" [disabled]="modeLocked()" (click)="setMode('fixed')">Horário fixo</button>
                  </div>
                  <p class="hint">
                    @if (d().bookingMode === 'flexible') {
                      Reserva quando quiser pelo app, dentro da janela, até {{ d().timesPerWeek }}x por semana. Cada reserva usa uma vez da semana e sai a R$ 0.
                    } @else {
                      Escolhe dias e horário ao assinar e fica com eles toda semana.
                    }
                    @if (modeLocked()) { O plano já tem assinantes: o modo não muda mais. }
                  </p>
                </div>
                <div class="row-2">
                  <div>
                    <div class="field-label">{{ d().bookingMode === 'flexible' ? 'Vezes por semana' : 'Frequência' }}</div>
                    <div class="chip-row">
                      @for (n of frequencyOptions(); track n) {
                        <button type="button" class="sm-chip" [class.active]="d().timesPerWeek === n" (click)="patch({ timesPerWeek: n })">{{ n }}x</button>
                      }
                    </div>
                  </div>
                  <div>
                    <div class="field-label">Duração</div>
                    <div class="chip-row">
                      @for (m of durations; track m.value) {
                        <button type="button" class="sm-chip" [class.active]="d().durationMinutes === m.value" (click)="patch({ durationMinutes: m.value })">{{ m.label }}</button>
                      }
                    </div>
                  </div>
                </div>
                <div>
                  <div class="field-label">Janela permitida</div>
                  <div class="wgrid">
                    <span></span>
                    @for (day of weekdays; track day) {
                      <span class="wday">{{ dayShort[day] }}</span>
                    }
                    @for (b of bands; track b.id) {
                      <div class="wband"><span>{{ b.label }}</span><small>{{ b.hours }}</small></div>
                      @for (day of weekdays; track day) {
                        <button type="button" class="wcell" [class.on]="d().cells.has(key(day, b.id))" [attr.aria-pressed]="d().cells.has(key(day, b.id))"
                          [attr.aria-label]="dayShort[day] + ' ' + b.label" (click)="toggleCell(day, b.id)">
                          @if (d().cells.has(key(day, b.id))) { <ar-icon name="check" [size]="12" [strokeWidth]="2.6" /> }
                        </button>
                      }
                    }
                  </div>
                  <p class="hint">
                    @if (d().bookingMode === 'flexible') {
                      O atleta reserva qualquer horário dentro da janela.
                      {{ capacityMode() ? 'A arena define a quadra a cada jogo.' : 'A reserva vale nas quadras do plano.' }}
                    } @else {
                      O atleta escolhe o dia e a hora dentro da janela.
                      {{ capacityMode() ? 'A arena define a quadra a cada jogo.' : 'A mesma quadra fica com ele toda semana.' }}
                    }
                  </p>
                  @if (customWindows()) {
                    <p class="hint">Este plano tem janelas com horário próprio; mexer na grade troca pelas faixas inteiras.</p>
                  }
                </div>
                <div>
                  <div class="field-label">Quadras</div>
                  @if (capacityMode()) {
                    <div class="arena-defines" data-testid="ph-plan-arena-defines-court">
                      <ar-icon name="courts" [size]="16" />
                      <div>
                        <b>A arena define a quadra</b>
                        <p>
                          O plano usa {{ distributionLabel() }}. O atleta assina o horário e a recepção indica a quadra a
                          cada jogo; o horário fixo desconta da capacidade.
                        </p>
                        <a routerLink="/painel/quadras">Quadras › Como o atleta reserva</a>
                      </div>
                    </div>
                  } @else {
                    <div class="chip-row">
                      @for (c of courtOptions(); track c.id) {
                        <button type="button" class="sm-chip" [class.active]="d().courtIds.includes(c.id)" (click)="toggleCourt(c.id)">{{ c.name }}</button>
                      } @empty {
                        <span class="hint flush">Cadastre quadras em Quadras para vender planos.</span>
                      }
                    </div>
                  }
                </div>
              </div>
            </ar-panel-card>
            <ar-panel-card title="Vagas" kicker="Proteção do avulso">
              <div class="inline">
                <input class="input-box num" type="number" min="1" max="500" [value]="d().capacity" (input)="patch({ capacity: $any($event.target).value })" />
                <span class="mute">horários fixos no máximo · {{ occupied() }} ocupado{{ occupied() === 1 ? '' : 's' }}</span>
              </div>
              <p class="hint">Somando todos os planos, no máximo <b>{{ store.settings().primeCapPercent }}% do horário nobre</b> vai para fixos. O resto fica para reserva avulsa.</p>
            </ar-panel-card>
          </div>

          <div class="col">
            <ar-panel-card title="Preço e ciclo" [kicker]="refValue() > 0 ? 'Avulso no período: ' + brl(refValue()) + '/h' : 'Mensalidade'">
              <div class="row-2">
                <div>
                  <div class="field-label">Mensal (R$)</div>
                  <input class="input-box" inputmode="decimal" placeholder="240" [value]="d().price" (input)="patch({ price: $any($event.target).value })" />
                </div>
                <div>
                  <div class="field-label">Avulso por hora (R$)</div>
                  <input class="input-box" inputmode="decimal" placeholder="70" [value]="d().reference" (input)="patch({ reference: $any($event.target).value })" />
                </div>
              </div>
              <div class="cycle">
                <div><div class="cycle-name" [class.off]="!d().cycles.monthly.enabled">Mensal</div><div class="cycle-sub">Sem fidelidade</div></div>
                <span class="cycle-val">{{ brl(priceValue()) }}<small>/mês</small></span>
                <ar-toggle [checked]="d().cycles.monthly.enabled" label="Mensal" (changed)="setCycle('monthly', $event)" />
              </div>
              @for (c of discountCycles; track c.id) {
                <div class="cycle">
                  <div>
                    <div class="cycle-name" [class.off]="!d().cycles[c.id].enabled">
                      {{ c.label }}
                      <span class="disc">−<input type="number" min="0" max="50" [attr.aria-label]="'Desconto ' + c.label" [value]="d().cycles[c.id].discountPercent" (input)="setDiscount(c.id, +$any($event.target).value)" />%</span>
                    </div>
                    <div class="cycle-sub">{{ c.sub }}</div>
                  </div>
                  @if (c.id === 'annual') {
                    <span class="cycle-val">{{ brl(cycleValue(d().cycles[c.id].discountPercent) * 12) }}<small>/ano</small></span>
                  } @else {
                    <span class="cycle-val">{{ brl(cycleValue(d().cycles[c.id].discountPercent)) }}<small>/mês</small></span>
                  }
                  <ar-toggle [checked]="d().cycles[c.id].enabled" [label]="c.label" (changed)="setCycle(c.id, $event)" />
                </div>
              }
              <div class="econ">
                @if (economy(); as e) {
                  <ar-ph-line [k]="e.bookingsPerMonth + ' reservas avulsas no mês'" [v]="brl(e.avulsoMonthlyReais)" />
                  <ar-ph-line k="Atleta economiza" [v]="brl(e.savingsReais) + '/mês'" [color]="e.savingsReais >= 0 ? 'var(--nx-win)' : 'var(--nx-live)'" [strong]="true" />
                } @else {
                  <ar-ph-line k="Informe o avulso por hora" v="para comparar" />
                }
                <ar-ph-line [k]="capacityValue() + ' vagas cheias'" [v]="brl(capacityValue() * priceValue()) + '/mês'" [strong]="true" />
              </div>
            </ar-panel-card>
            <ar-panel-card title="Cobrança" kicker="Recorrente">
              <div class="stack">
                <div>
                  <div class="field-label">Formas</div>
                  <div class="chip-row">
                    @for (f of forms; track f) {
                      <button type="button" class="sm-chip" [class.active]="d().billing.methods.includes(f)" (click)="toggleForm(f)">{{ formLabel[f] }}</button>
                    }
                  </div>
                  @if (billingNote(); as note) {
                    <p class="hint">{{ note }}</p>
                  }
                  @if (d().billing.methods.includes('pix_auto') || d().billing.methods.includes('card')) {
                    <p class="hint">{{ store.settings().onlineBillingEnabled ? feeText : 'Para cobrar por link, ligue a cobrança online nas Regras gerais.' }}</p>
                  }
                </div>
                <div>
                  <div class="field-label">Vencimento</div>
                  <div class="chip-row">
                    @for (o of dueDays; track o.value) {
                      <button type="button" class="sm-chip" [class.active]="d().billing.dueDay === o.value" (click)="patchBilling({ dueDay: o.value })">{{ o.label }}</button>
                    }
                  </div>
                </div>
                <div>
                  <div class="field-label">Se atrasar</div>
                  <div class="chip-row">
                    @for (n of releaseDays; track n) {
                      <button type="button" class="sm-chip" [class.active]="d().billing.overdueReleaseDays === n" (click)="patchBilling({ overdueReleaseDays: n })">
                        {{ n === 1 ? 'Libera em 1 dia' : n + ' dias' }}
                      </button>
                    }
                  </div>
                  <p class="hint">Lembrete por push no dia, em 1 e em 3 dias. Depois o horário volta para a agenda.</p>
                </div>
              </div>
            </ar-panel-card>
          </div>

          <ar-panel-card class="rules" title="Regras do plano" kicker="Faltas, feriados e grupo">
            <!-- Plano livre: não há horário marcado para faltar nem feriado para repor. -->
            @if (d().bookingMode === 'fixed') {
            <div class="rule">
              <ar-ph-icon-box icon="undo" [tone]="d().rules.makeup.enabled ? 'orange' : 'dim'" [size]="32" />
              <div class="rule-body">
                <div class="rule-title" [class.off]="!d().rules.makeup.enabled">Reposição de falta</div>
                <div class="rule-sub">Avisou até {{ d().rules.makeup.noticeHours }}h antes? Ganha uma reposição para usar em outro horário livre.</div>
                @if (d().rules.makeup.enabled) {
                  <div class="chip-row sp">
                    @for (n of [1, 2, 3, 4]; track n) {
                      <button type="button" class="sm-chip" [class.active]="d().rules.makeup.perMonth === n" (click)="patchMakeup({ perMonth: n })">Até {{ n }} por mês</button>
                    }
                  </div>
                  <div class="chip-row sp">
                    @for (n of [15, 30, 60]; track n) {
                      <button type="button" class="sm-chip" [class.active]="d().rules.makeup.validityDays === n" (click)="patchMakeup({ validityDays: n })">Vale {{ n }} dias</button>
                    }
                    @for (n of [12, 24, 48]; track n) {
                      <button type="button" class="sm-chip" [class.active]="d().rules.makeup.noticeHours === n" (click)="patchMakeup({ noticeHours: n })">Aviso {{ n }}h</button>
                    }
                  </div>
                }
              </div>
              <ar-toggle [checked]="d().rules.makeup.enabled" label="Reposição de falta" (changed)="patchMakeup({ enabled: $event })" />
            </div>
            <div class="rule">
              <ar-ph-icon-box icon="holiday" tone="orange" [size]="32" />
              <div class="rule-body">
                <div class="rule-title">Feriados</div>
                <div class="rule-sub">Quando a arena fecha ou o dia é feriado.</div>
                <div class="chip-row sp">
                  <button type="button" class="sm-chip" [class.active]="d().rules.holiday === 'makeup'" (click)="patchRules({ holiday: 'makeup' })">Vira reposição</button>
                  <button type="button" class="sm-chip" [class.active]="d().rules.holiday === 'play'" (click)="patchRules({ holiday: 'play' })">Joga normal</button>
                </div>
              </div>
            </div>
            }
            <div class="rule">
              <ar-ph-icon-box icon="pause" [tone]="d().rules.pause.enabled ? 'orange' : 'dim'" [size]="32" />
              <div class="rule-body">
                <div class="rule-title" [class.off]="!d().rules.pause.enabled">Pausa para férias</div>
                <div class="rule-sub">Congela a cobrança e libera o horário para avulso enquanto pausado.</div>
                @if (d().rules.pause.enabled) {
                  <div class="chip-row sp">
                    @for (n of [15, 30, 60, 90]; track n) {
                      <button type="button" class="sm-chip" [class.active]="d().rules.pause.maxDaysPerYear === n" (click)="patchPause({ maxDaysPerYear: n })">Até {{ n }} dias/ano</button>
                    }
                  </div>
                }
              </div>
              <ar-toggle [checked]="d().rules.pause.enabled" label="Pausa para férias" (changed)="patchPause({ enabled: $event })" />
            </div>
            <div class="rule">
              <ar-ph-icon-box icon="split" [tone]="d().rules.split.enabled ? 'orange' : 'dim'" [size]="32" />
              <div class="rule-body">
                <div class="rule-title" [class.off]="!d().rules.split.enabled">Dividir entre jogadores</div>
                <div class="rule-sub">O titular convida a galera e cada um paga a sua parte. Se alguém não pagar, o titular cobre.</div>
                @if (d().rules.split.enabled) {
                  <div class="chip-row sp">
                    @for (n of [2, 3, 4, 5, 6]; track n) {
                      <button type="button" class="sm-chip" [class.active]="d().rules.split.maxPlayers === n" (click)="patchSplit({ maxPlayers: n })">Até {{ n }} pessoas</button>
                    }
                  </div>
                }
              </div>
              <ar-toggle [checked]="d().rules.split.enabled" label="Dividir entre jogadores" (changed)="patchSplit({ enabled: $event })" />
            </div>
            <div class="rule last">
              <ar-ph-icon-box icon="rain" [tone]="d().rules.weather ? 'orange' : 'dim'" [size]="32" />
              <div class="rule-body">
                <div class="rule-title" [class.off]="!d().rules.weather">Chuva</div>
                <div class="rule-sub">Segue a Política de clima da arena: crédito ou remarcação.</div>
                <a class="cta sp-link" routerLink="/painel/agenda/chuva/politica">Ver Política de clima →</a>
              </div>
              <ar-toggle [checked]="d().rules.weather" label="Chuva" (changed)="patchRules({ weather: $event })" />
            </div>
            @if (planId && original()?.status !== 'archived') {
              <div class="archive">
                <button type="button" class="ar-ghost-btn danger" [disabled]="saving() || readOnly()" (click)="archiveOpen.set(true)">Arquivar plano</button>
              </div>
            }
          </ar-panel-card>
        </div>
      }
    </ar-ph-page>

    @if (archiveOpen()) {
      <ar-modal (close)="archiveOpen.set(false)">
        <p class="modal-title">Arquivar "{{ d().name }}"?</p>
        <p class="modal-sub">O plano sai da vitrine do app e ninguém novo assina. Os {{ occupied() }} assinantes atuais seguem com o horário e as mensalidades.</p>
        <div class="modal-actions">
          <button type="button" class="ar-mini-btn" [disabled]="saving()" (click)="archiveOpen.set(false)">Voltar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving()" (click)="save('archived')">{{ saving() ? 'Arquivando…' : 'Arquivar' }}</button>
        </div>
      </ar-modal>
    }
  `,
  styles: `
    @use 'breakpoints' as ar;
    .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .head-hint { font-size: 12px; color: var(--nx-text-dim); margin-right: 6px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .stack { display: flex; flex-direction: column; gap: 18px; }
    .wgrid { display: grid; grid-template-columns: 58px repeat(7, minmax(0, 1fr)); gap: 4px; }
    .wday { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 700; color: var(--nx-text-dim); text-align: center; }
    .wband { display: flex; flex-direction: column; justify-content: center; }
    .wband span { font-family: var(--nx-font-display); font-weight: 600; font-size: 11.5px; color: var(--nx-text-mute); }
    .wband small { font-family: var(--nx-font-mono); font-size: 9px; color: var(--nx-text-dim); }
    .wcell { height: 30px; border-radius: 7px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); display: grid; place-items: center; color: #0a0a0a; cursor: pointer; padding: 0; }
    .wcell.on { background: var(--nx-orange-500); border-color: var(--nx-orange-500); }
    .flush { margin: 0; }
    .inline { display: flex; align-items: center; gap: 12px; }
    .num { width: 80px; font-family: var(--nx-font-mono); }
    .mute { font-size: 12.5px; color: var(--nx-text-mute); line-height: 1.4; }
    .hint b { color: var(--nx-text); }
    .arena-defines { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--nx-win) 40%, transparent); background: color-mix(in srgb, var(--nx-win) 7%, transparent); }
    .arena-defines b { color: var(--nx-win); font-size: 14px; }
    .arena-defines p { margin: 3px 0 6px; font-size: 13px; line-height: 1.5; color: var(--nx-text-dim); }
    .arena-defines a { font-size: 12.5px; font-weight: 600; color: var(--nx-orange-500); text-decoration: none; }
    .cycle { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--nx-line); }
    .cycle-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; color: var(--nx-text); }
    .cycle-name.off, .rule-title.off { color: var(--nx-text-mute); }
    .cycle-sub { font-size: 11px; color: var(--nx-text-dim); margin-top: 2px; }
    .disc { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; color: var(--nx-win); margin-left: 8px; }
    .disc input { width: 34px; background: transparent; border: none; border-bottom: 1px dashed rgba(43, 209, 126, 0.5); color: inherit; font: inherit; text-align: right; padding: 0; }
    .cycle-val { font-family: var(--nx-font-mono); font-weight: 700; font-size: 13px; color: var(--nx-text); }
    .cycle-val small { font-weight: 500; font-size: 10.5px; color: var(--nx-text-dim); }
    .econ { margin-top: 12px; padding: 12px; border-radius: 10px; background: var(--nx-surface-1); display: flex; flex-direction: column; gap: 8px; }
    .rule { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--nx-line); }
    .rule.last { border-bottom: none; }
    .rule-body { flex: 1; min-width: 0; }
    .rule-title { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; color: var(--nx-text); }
    .rule-sub { font-size: 11.5px; color: var(--nx-text-dim); margin-top: 3px; line-height: 1.45; }
    .sp { margin-top: 9px; }
    .sp-link { display: inline-block; margin-top: 8px; }
    .archive { padding-top: 12px; border-top: 1px solid var(--nx-line); }
    .danger { color: var(--nx-live); padding: 0; }
    @include ar.below(lg) {
      .layout { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .rules { grid-column: 1 / -1; }
    }
    @include ar.below(md) {
      .layout { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class PanelPhPlanEditorComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  protected readonly store = inject(SchedulePlansStore);

  protected readonly planId: string | null = this.route.snapshot.paramMap.get('planId');
  protected readonly brl = brl;
  protected readonly weekdays = WEEKDAYS;
  protected readonly dayShort = WEEKDAY_SHORT;
  protected readonly bands = BANDS;
  protected readonly forms = PAYMENT_FORMS;
  protected readonly formLabel = PAYMENT_FORM_LABEL;
  protected readonly feeText = ONLINE_BILLING_FEE_TEXT;
  protected readonly dueDays = DUE_DAYS;
  protected readonly releaseDays = [1, 3, 7] as const;
  protected readonly durations = [{ value: 60, label: '1h' }, { value: 90, label: '1h30' }, { value: 120, label: '2h' }];
  protected readonly discountCycles = [
    { id: 'quarterly' as const, label: 'Trimestral', sub: '3 meses · paga mês a mês' },
    { id: 'annual' as const, label: 'Anual', sub: '12 meses · à vista (1ª proporcional)' },
  ];

  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('planosHorario'));
  protected readonly original = computed<SchedulePlan | null>(() => (this.planId ? this.store.planById().get(this.planId) ?? null : null));
  protected readonly d = signal<EditorDraft>(this.blankDraft());
  /** `Pix e Cartão: Pix ou cartão por link (online) · Na arena: baixa manual`. */
  protected readonly billingNote = computed(() => {
    const online = this.store.settings().onlineBillingEnabled;
    const groups = new Map<string, string[]>();
    for (const f of PAYMENT_FORMS.filter((x) => this.d().billing.methods.includes(x))) {
      const mode = paymentFormBilling(f, online);
      groups.set(mode, [...(groups.get(mode) ?? []), PAYMENT_FORM_LABEL[f]]);
    }
    return [...groups].map(([mode, labels]) => `${labels.join(' e ')}: ${mode}`).join(' · ');
  });
  /** O plano tinha janelas fora das faixas e a grade ainda não foi mexida — salva as originais. */
  protected readonly customWindows = signal(false);
  private windowsTouched = false;
  private initialized = false;
  private refTouched = false;

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly touched = signal(false);
  protected readonly archiveOpen = signal(false);

  protected readonly title = computed(() => this.d().name.trim() || (this.planId ? 'Plano' : 'Novo plano'));
  protected readonly priceValue = computed(() => {
    const p = parsePrice(this.d().price);
    return Number.isFinite(p) ? p : 0;
  });
  protected readonly refValue = computed(() => {
    const p = parsePrice(this.d().reference);
    return Number.isFinite(p) ? p : 0;
  });
  protected readonly capacityValue = computed(() => Math.max(0, Math.floor(Number(this.d().capacity) || 0)));
  protected readonly economy = computed(() =>
    planEconomy({
      monthlyPriceReais: this.priceValue(),
      referenceHourlyReais: this.refValue() || null,
      timesPerWeek: this.d().timesPerWeek,
      durationMinutes: this.d().durationMinutes,
    }),
  );
  protected readonly occupied = computed(() =>
    this.planId ? this.store.subscriptions().filter((s) => s.planId === this.planId && holdsSlot(s)).length : 0,
  );
  /** A arena define a quadra (Quadras › Como o atleta reserva): o plano não escolhe quadra. */
  protected readonly capacityMode = computed(() => bookingAllocationFromArena(this.arenaContext.arenaDocData()).mode === 'capacity');
  /** "as 8 quadras da distribuição" / "todas as quadras ativas". */
  protected readonly distributionLabel = computed(() => {
    const ids = bookingAllocationFromArena(this.arenaContext.arenaDocData()).courtIds;
    const n = ids.length > 0
      ? this.store.courts().filter((c) => ids.includes(c.id) && c.status === 'active').length
      : this.store.activeCourts().length;
    if (ids.length === 0) return 'todas as quadras ativas';
    return n === 1 ? 'a quadra da distribuição' : `as ${n} quadras da distribuição`;
  });
  protected readonly courtOptions = computed(() => {
    const ids = new Set(this.d().courtIds);
    return this.store.courts().filter((c) => c.status === 'active' || ids.has(c.id));
  });

  /** Assinaturas vivas foram feitas num modo: com assinantes, o modo não muda (o servidor também recusa). */
  protected readonly modeLocked = computed(() => !!this.planId && (this.store.plans().find((p) => p.id === this.planId)?.occupiedCount ?? 0) > 0);
  /** Fixo vira uma série por dia (até 3x); livre é uma cota da semana (até 7x). */
  protected readonly frequencyOptions = computed(() => (this.d().bookingMode === 'flexible' ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3]));

  protected setMode(bookingMode: ScheduleBookingMode): void {
    this.d.update((d) => ({ ...d, bookingMode, timesPerWeek: bookingMode === 'fixed' ? Math.min(d.timesPerWeek, 3) : d.timesPerWeek }));
  }

  protected readonly problems = computed(() => {
    const d = this.d();
    const out: string[] = [];
    if (d.name.trim().length < 2) out.push('Dê um nome ao plano');
    const windows = this.windows();
    if (windows.length === 0) out.push('Marque ao menos uma faixa na janela');
    else if (d.bookingMode === 'fixed' && new Set(windows.map((w) => w.weekday)).size < d.timesPerWeek) out.push(`A janela precisa de ${d.timesPerWeek} dias para um plano ${d.timesPerWeek}x`);
    if (d.courtIds.length === 0 && !this.capacityMode()) out.push('Escolha ao menos uma quadra');
    if (this.capacityValue() < 1 || this.capacityValue() > 500) out.push('Vagas entre 1 e 500');
    if (this.priceValue() <= 0) out.push('Informe o valor mensal');
    if (!d.cycles.monthly.enabled && !d.cycles.quarterly.enabled && !d.cycles.annual.enabled) out.push('Ligue ao menos um ciclo');
    if (d.billing.methods.length === 0) out.push('Escolha ao menos uma forma de cobrança');
    const discounts = [d.cycles.quarterly.discountPercent, d.cycles.annual.discountPercent];
    if (discounts.some((x) => !(x >= 0 && x <= 50))) out.push('Desconto entre 0% e 50%');
    return out;
  });
  protected readonly valid = computed(() => this.problems().length === 0);

  constructor() {
    effect(() => {
      if (this.initialized) return;
      if (this.planId) {
        const plan = this.original();
        if (!plan) return;
        this.initialized = true;
        this.d.set(this.fromPlan(plan));
        const grid = windowsFromGrid(gridFromWindows(plan.windows));
        this.customWindows.set(JSON.stringify(grid) !== JSON.stringify([...plan.windows].sort((a, b) => a.weekday - b.weekday)));
      } else {
        this.initialized = true;
        this.applySuggestion();
      }
    });
    // Novo plano: o avulso por hora começa na média do preço base das quadras escolhidas.
    effect(() => {
      if (this.planId || this.refTouched) return;
      const ids = this.d().courtIds;
      const prices = this.store.courts().filter((c) => ids.includes(c.id) && c.basePricePerHourReais).map((c) => c.basePricePerHourReais!);
      const avg = prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0;
      const text = priceText(avg);
      if (text !== this.d().reference) this.d.update((d) => ({ ...d, reference: text }));
    });
  }

  protected key(weekday: number, band: BandId): string {
    return windowCellKey(weekday, band);
  }

  private windows() {
    const plan = this.original();
    if (plan && !this.windowsTouched && this.customWindows()) return plan.windows;
    return windowsFromGrid(this.d().cells);
  }

  private blankDraft(): EditorDraft {
    return {
      name: '', description: '', status: 'draft', bookingMode: 'flexible', timesPerWeek: 1, durationMinutes: 60, cells: new Set(), courtIds: [],
      capacity: '20', price: '', reference: '', cycles: clone(DEFAULT_PLAN_CYCLES), billing: clone(DEFAULT_PLAN_BILLING),
      rules: clone(DEFAULT_PLAN_RULES),
    };
  }

  private fromPlan(p: SchedulePlan): EditorDraft {
    return {
      name: p.name, description: p.description ?? '', status: p.status, bookingMode: p.bookingMode, timesPerWeek: p.timesPerWeek,
      durationMinutes: p.durationMinutes,
      cells: gridFromWindows(p.windows), courtIds: [...p.courtIds], capacity: String(p.capacity), price: priceText(p.monthlyPriceReais),
      reference: priceText(p.referenceHourlyReais), cycles: clone(p.cycles), billing: clone(p.billing), rules: clone(p.rules),
    };
  }

  /** Vem do card "Criar plano sugerido" (`?dias=1,2,3,4,5&faixa=manha`). */
  private applySuggestion(): void {
    const q = this.route.snapshot.queryParamMap;
    const band = BANDS.find((b) => b.id === q.get('faixa'));
    const days = (q.get('dias') ?? '').split(',').map(Number).filter((n) => n >= 1 && n <= 7);
    if (!band || days.length === 0) return;
    this.d.update((d) => ({ ...d, name: `${d.bookingMode === 'flexible' ? 'Livre' : 'Fixo'} ${band.label}`, cells: new Set(days.map((day) => windowCellKey(day, band.id))) }));
  }

  protected patch(change: Partial<EditorDraft>): void {
    if ('reference' in change) this.refTouched = true;
    this.d.update((d) => ({ ...d, ...change }));
  }

  protected patchBilling(change: Partial<PlanBilling>): void {
    this.d.update((d) => ({ ...d, billing: { ...d.billing, ...change } }));
  }

  protected patchRules(change: Partial<PlanRules>): void {
    this.d.update((d) => ({ ...d, rules: { ...d.rules, ...change } }));
  }

  protected patchMakeup(change: Partial<PlanRules['makeup']>): void {
    this.d.update((d) => ({ ...d, rules: { ...d.rules, makeup: { ...d.rules.makeup, ...change } } }));
  }

  protected patchPause(change: Partial<PlanRules['pause']>): void {
    this.d.update((d) => ({ ...d, rules: { ...d.rules, pause: { ...d.rules.pause, ...change } } }));
  }

  protected patchSplit(change: Partial<PlanRules['split']>): void {
    this.d.update((d) => ({ ...d, rules: { ...d.rules, split: { ...d.rules.split, ...change } } }));
  }

  protected toggleCell(weekday: number, band: BandId): void {
    this.windowsTouched = true;
    this.customWindows.set(false);
    const k = windowCellKey(weekday, band);
    this.d.update((d) => {
      const cells = new Set(d.cells);
      if (cells.has(k)) cells.delete(k);
      else cells.add(k);
      return { ...d, cells };
    });
  }

  protected toggleCourt(id: string): void {
    this.d.update((d) => ({ ...d, courtIds: d.courtIds.includes(id) ? d.courtIds.filter((c) => c !== id) : [...d.courtIds, id] }));
  }

  protected toggleForm(f: SchedulePaymentForm): void {
    const methods = this.d().billing.methods;
    this.patchBilling({ methods: methods.includes(f) ? methods.filter((m) => m !== f) : PAYMENT_FORMS.filter((m) => m === f || methods.includes(m)) });
  }

  protected setCycle(id: keyof PlanCycles, enabled: boolean): void {
    this.d.update((d) => ({ ...d, cycles: { ...d.cycles, [id]: { ...d.cycles[id], enabled } } }));
  }

  protected setDiscount(id: 'quarterly' | 'annual', discountPercent: number): void {
    this.d.update((d) => ({ ...d, cycles: { ...d.cycles, [id]: { ...d.cycles[id], discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0 } } }));
  }

  protected cycleValue(discount: number): number {
    return cycleMonthlyPrice(this.priceValue(), discount);
  }

  protected async save(status: SchedulePlanStatus): Promise<void> {
    this.touched.set(true);
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.readOnly() || (status !== 'archived' && !this.valid())) return;
    const d = this.d();
    const courts = this.store.courts();
    this.saving.set(true);
    this.error.set(null);
    try {
      const res = await upsertSchedulePlan(arenaFunctions(), {
        arenaId,
        ...(this.planId ? { planId: this.planId } : {}),
        name: d.name.trim(),
        description: d.description.trim() || null,
        status,
        bookingMode: d.bookingMode,
        timesPerWeek: d.timesPerWeek,
        durationMinutes: d.durationMinutes,
        windows: this.windows(),
        // Arena que define a quadra: o plano não guarda quadra (o servidor usa a distribuição).
        courtIds: this.capacityMode() ? [] : d.courtIds,
        courtNames: this.capacityMode() ? [] : d.courtIds.map((id) => courts.find((c) => c.id === id)?.name ?? 'Quadra'),
        capacity: this.capacityValue(),
        monthlyPriceReais: this.priceValue(),
        referenceHourlyReais: this.refValue() > 0 ? this.refValue() : null,
        cycles: d.cycles,
        billing: d.billing,
        rules: d.rules,
      });
      this.archiveOpen.set(false);
      if (!this.planId && status === 'draft') {
        await this.router.navigate(['/painel/planos-horario', res.planId], { replaceUrl: true });
        return;
      }
      await this.router.navigateByUrl('/painel/planos-horario');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar o plano.');
    } finally {
      this.saving.set(false);
    }
  }
}

