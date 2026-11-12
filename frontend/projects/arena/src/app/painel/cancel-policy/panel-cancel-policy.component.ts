import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { httpsCallable } from 'firebase/functions';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { weatherErrorMessage, weatherPolicyFromArenaDoc, creditValidityLabel } from '../weather/weather.model';
import {
  ATHLETE_FREE_CANCEL_HOURS,
  DEFAULT_ATHLETE_CANCEL_POLICY,
  PARTIAL_REFUND_PERCENTS,
  athleteCancelChoice,
  athleteCancelPolicyAthleteText,
  athleteCancelPolicyFromArenaDoc,
  normalizeAthleteCancelPolicy,
  policyForChoice,
  type AthleteCancelChoice,
  type AthleteCancelPolicy,
} from './cancel-policy.model';

interface ChoiceOption {
  id: AthleteCancelChoice;
  title: string;
  sub: string;
}

const CHOICES: readonly ChoiceOption[] = [
  {
    id: 'full',
    title: 'Estorno integral',
    sub: 'O valor pago pelo app volta inteiro para o atleta, pelo mesmo meio (Pix ou cartão). Sai do seu saldo.',
  },
  {
    id: 'partial',
    title: 'Estorno parcial',
    sub: 'Volta só uma parte pelo mesmo meio; a arena fica com o resto, como taxa de cancelamento.',
  },
  {
    id: 'credit',
    title: 'Crédito na arena',
    sub: 'Nada volta em dinheiro: o valor pago vira saldo do atleta para a próxima reserva aqui. O dinheiro fica na arena.',
  },
];

/** Política de cancelamento pelo atleta (`/painel/agenda/cancelamento`): grava
 *  `arenas/{id}.athleteCancelPolicy` pela callable `saveArenaAthleteCancelPolicy`. Vale para
 *  reservas novas: cada reserva guarda a política do momento em que foi feita. */
@Component({
  selector: 'ar-panel-cancel-policy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent],
  styleUrl: '../weather/weather.scss',
  template: `
    <ar-panel-shell>
      <ar-page-header title="Política de cancelamento" subtitle="Agenda · Reservas · Cancelamento pelo atleta">
        <div class="header-actions">
          <a class="ar-ghost-btn" routerLink="/painel/reservas">Reservas</a>
          <button type="button" class="ar-ghost-btn" [disabled]="!dirty() || saving()" (click)="discard()">Descartar</button>
          <button
            type="button"
            class="ar-mini-btn ar-mini-btn-primary save-btn"
            [disabled]="readOnly() || saving() || !dirty()"
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
              <ar-panel-card title="Quando o atleta cancela no prazo" kicker="Até {{ freeHours }}h antes">
                <div class="radios" role="radiogroup" aria-label="O que o atleta recebe ao cancelar">
                  @for (c of choices; track c.id) {
                    <button
                      type="button"
                      role="radio"
                      class="radio"
                      [attr.data-choice]="c.id"
                      [class.on]="choice() === c.id"
                      [attr.aria-checked]="choice() === c.id"
                      [disabled]="readOnly()"
                      (click)="choose(c.id)"
                    >
                      <span class="radio-dot"><span class="radio-dot-inner"></span></span>
                      <span class="radio-text">
                        <span class="radio-title">{{ c.title }}</span>
                        <span class="radio-sub">{{ c.sub }}</span>
                      </span>
                    </button>
                    @if (c.id === 'partial' && choice() === 'partial') {
                      <div class="chip-row partial-chips">
                        @for (p of partialPercents; track p) {
                          <button
                            type="button"
                            class="ar-chip"
                            [attr.data-percent]="p"
                            [class.active]="policy().refundPercent === p"
                            [disabled]="readOnly()"
                            (click)="setPercent(p)"
                          >
                            Devolve {{ p }}%
                          </button>
                        }
                      </div>
                    }
                    @if (c.id === 'credit' && choice() === 'credit') {
                      <p class="fine partial-chips">
                        Validade do crédito: {{ creditValidity() }}, a mesma dos créditos de chuva
                        (<a routerLink="/painel/agenda/chuva/politica">Política de clima</a>).
                      </p>
                    }
                  }
                </div>
              </ar-panel-card>

              <ar-panel-card title="Como vale" kicker="Regras">
                <ul class="rules">
                  <li>Vale para as reservas feitas depois de salvar. Quem já reservou continua com a regra do dia da reserva.</li>
                  <li>Depois do prazo de {{ freeHours }}h, o app não cancela: o atleta combina com a arena.</li>
                  <li>Horário fixo, aulas e reservas pagas na arena não passam por aqui.</li>
                  <li>Na reserva dividida, cada parte paga volta (ou vira crédito) para quem pagou.</li>
                </ul>
              </ar-panel-card>
            </div>

            <div class="col">
              <ar-panel-card title="Como o atleta vê" kicker="Prévia no app">
                <div class="preview">
                  <div>
                    <div class="preview-title">Cancelar reserva?</div>
                    <div class="preview-text">{{ athleteText() }}</div>
                  </div>
                </div>
                <p class="fine preview-note">Aparece na confirmação do cancelamento, no app e no portal do atleta.</p>
              </ar-panel-card>
            </div>
          </div>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
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

    .partial-chips {
      margin: 2px 0 6px 28px;
    }

    .partial-chips a {
      color: var(--nx-orange-500);
    }

    .rules {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
      line-height: 1.45;
    }

    .preview {
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
  `,
})
export class PanelCancelPolicyComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly choices = CHOICES;
  protected readonly partialPercents = PARTIAL_REFUND_PERCENTS;
  protected readonly freeHours = ATHLETE_FREE_CANCEL_HOURS;

  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? 'arena');

  protected readonly policy = signal<AthleteCancelPolicy>({ ...DEFAULT_ATHLETE_CANCEL_POLICY });
  private readonly saved = signal<AthleteCancelPolicy>({ ...DEFAULT_ATHLETE_CANCEL_POLICY });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly dirty = computed(() => JSON.stringify(this.policy()) !== JSON.stringify(this.saved()));
  protected readonly choice = computed(() => athleteCancelChoice(this.policy()));
  protected readonly athleteText = computed(() => athleteCancelPolicyAthleteText(this.policy(), this.arenaName()));
  protected readonly creditValidity = computed(() =>
    creditValidityLabel(weatherPolicyFromArenaDoc(this.arenaContext.arenaDocData()).creditValidityDays).toLowerCase(),
  );

  constructor() {
    // Segue o doc vivo da arena enquanto não há edição em curso.
    effect(() => {
      const remote = athleteCancelPolicyFromArenaDoc(this.arenaContext.arenaDocData());
      untracked(() => {
        if (this.dirty() || this.saving()) return;
        this.policy.set(remote);
        this.saved.set(remote);
      });
    });
  }

  protected choose(choice: AthleteCancelChoice): void {
    this.policy.set(policyForChoice(choice, this.policy()));
    this.notice.set(null);
  }

  protected setPercent(refundPercent: number): void {
    this.policy.set({ mode: 'refund', refundPercent });
    this.notice.set(null);
  }

  protected discard(): void {
    this.policy.set(this.saved());
    this.error.set(null);
    this.notice.set(null);
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.readOnly() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const res = await httpsCallable<{ arenaId: string; policy: AthleteCancelPolicy }, { policy?: unknown }>(
        arenaFunctions(),
        'saveArenaAthleteCancelPolicy',
      )({ arenaId, policy: this.policy() });
      const saved = normalizeAthleteCancelPolicy(res.data?.policy ?? this.policy());
      this.policy.set(saved);
      this.saved.set(saved);
      this.notice.set('Política salva. Vale para as reservas feitas a partir de agora.');
    } catch (err) {
      this.error.set(weatherErrorMessage(err, 'Não foi possível salvar a política.'));
    } finally {
      this.saving.set(false);
    }
  }
}
