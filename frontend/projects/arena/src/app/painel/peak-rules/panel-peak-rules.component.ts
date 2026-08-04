import type { ArenaPeakRule } from '@nexago/arena-discovery';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { formatWeekdays } from '../promotions/promotion.model';
import { formatMinDuration, formatRelease, peakRuleScopeLabel } from './peak-rule.model';
import { fetchAllPeakRules, setPeakRuleActive } from './peak-rules-repository';

/** Tela Horários de pico: CRUD de `arenas/{arenaId}/peakRules` (Pro/Elite pra
 *  criar/editar via capability `horariosPico`; excluir é livre). A regra impõe
 *  reserva mínima na faixa, com liberação automática — enforcement fica no
 *  servidor (`ensurePeakRuleSatisfied`), aqui é só configuração. */
@Component({
  selector: 'ar-panel-peak-rules',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Horários de pico" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="createRule()">
          <ar-icon name="plus" [size]="14" />
          Nova regra
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando regras…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else if (showPaywall()) {
          <ar-panel-card pad="lg">
            <p class="paywall-title">Horários de pico são um recurso dos planos Pro e Elite</p>
            <p class="state-text">Fale com o suporte para fazer upgrade e liberar reserva mínima nos horários mais concorridos.</p>
          </ar-panel-card>
        } @else {
          @if (readOnly()) {
            <div class="readonly-banner">Seu plano atual não inclui criar/editar horários de pico — fale com o suporte para fazer upgrade.</div>
          }

          @if (actionError(); as aerr) {
            <div class="action-error">{{ aerr }}</div>
          }

          <div class="summary-row">
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-orange">Regras ativas</div>
              <div class="summary-value">{{ activeCount() }}</div>
            </ar-panel-card>
          </div>

          <ar-panel-card title="Regras" class="table-card">
            <div class="table-head">
              <span>Regra</span>
              <span>Faixa</span>
              <span>Dias</span>
              <span>Mínimo</span>
              <span>Liberação</span>
              <span>Status</span>
              <span></span>
            </div>
            <div class="table-list">
              @for (rule of rules(); track rule.id) {
                <div class="table-row">
                  <div>
                    <div class="rule-name">{{ rule.label }}</div>
                    <div class="rule-scope">{{ peakRuleScopeLabel(rule) }}</div>
                  </div>
                  <div class="rule-range">{{ rule.startTime }}-{{ rule.endTime }}</div>
                  <div class="rule-days">{{ formatWeekdays(rule.weekdays) }}</div>
                  <div class="rule-min">{{ formatMinDuration(rule.minDurationMinutes) }}</div>
                  <div class="rule-release">{{ formatRelease(rule.releaseHoursBefore) }}</div>
                  <div><ar-pill [tone]="rule.active ? 'green' : 'dim'">{{ rule.active ? 'Ativa' : 'Pausada' }}</ar-pill></div>
                  <div class="rule-actions">
                    <button type="button" class="ar-mini-btn" (click)="editRule(rule.id)">
                      <ar-icon name="edit" [size]="13" />
                      Editar
                    </button>
                    <button type="button" class="ar-mini-btn" [disabled]="readOnly()" (click)="toggleActive(rule)">
                      {{ rule.active ? 'Pausar' : 'Ativar' }}
                    </button>
                  </div>
                </div>
              } @empty {
                <p class="state-text empty-text">Nenhuma regra por aqui.</p>
              }
            </div>
          </ar-panel-card>
        }
      </div>
    </ar-panel-shell>
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

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .empty-text {
      margin: 12px 0;
    }

    .paywall-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0 0 8px;
    }

    .readonly-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .action-error {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .summary-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .summary-card {
      flex: 1;
      max-width: 240px;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.6fr 100px 150px 90px 110px 100px 170px;
      gap: 12px;
      align-items: center;
    }

    .table-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-list {
      display: flex;
      flex-direction: column;
    }

    .table-row {
      padding: 14px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .rule-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }

    .rule-scope {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .rule-min {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-orange-500);
    }

    .rule-range,
    .rule-days,
    .rule-release {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }

    .rule-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    @media (max-width: 1180px) {
      .summary-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelPeakRulesComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly router = inject(Router);

  protected readonly formatWeekdays = formatWeekdays;
  protected readonly formatMinDuration = formatMinDuration;
  protected readonly formatRelease = formatRelease;
  protected readonly peakRuleScopeLabel = peakRuleScopeLabel;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly readOnly = computed(() => !this.arenaContext.hasCapability('horariosPico'));

  protected readonly rules = signal<ArenaPeakRule[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly activeCount = computed(() => this.rules().filter((r) => r.active).length);
  protected readonly showPaywall = computed(() => this.readOnly() && this.rules().length === 0);
  protected readonly headerSubtitle = computed(
    () => `${this.arenaContext.arenaName() ?? 'Arena'} · reserva mínima nos horários concorridos`,
  );

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.rules.set(await fetchAllPeakRules(arenaFirestore(), arenaId));
    } catch {
      this.loadError.set('Não foi possível carregar as regras.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async toggleActive(rule: ArenaPeakRule): Promise<void> {
    if (this.readOnly()) return; // qualquer alteração (pausar ou reativar) exige plano — mesma regra que o servidor
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;
    this.actionError.set(null);
    try {
      await setPeakRuleActive(arenaFirestore(), arenaId, rule.id, !rule.active);
      await this.load(arenaId);
    } catch {
      this.actionError.set('Não foi possível atualizar a regra. Verifique seu plano e tente novamente.');
    }
  }

  protected createRule(): void {
    if (this.readOnly()) return;
    this.router.navigate(['/painel/horarios-pico/nova']);
  }

  protected editRule(id: string): void {
    this.router.navigate(['/painel/horarios-pico', id, 'editar']);
  }
}
