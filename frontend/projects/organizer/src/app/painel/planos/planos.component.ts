import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import {
  CONTRACT_STATUS_VIEW,
  brl,
  contractNextStep,
  dayRangeLabel,
  hoursRangeLabel,
  isActiveContract,
  sortContracts,
  tierDeliveryLabel,
  type PlanCatalog,
  type PlanContract,
} from '../data/plan-contracts';
import { cancelPlanContract, loadPlanCatalog, watchMyPlanContracts } from '../data/plan-contracts-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { OgIconComponent, type OgIconName } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { OgContratarDialogComponent } from './contratar-dialog.component';
import { OgPlanCardComponent } from './plan-card.component';

interface RuleItem {
  icon: OgIconName;
  title: string;
  desc: string;
}

/** Planos NexaGO (protótipo 26a): a tabela vigente, os contratos do organizador e as cotas
 *  Sponsors. Catálogo por callable (sem custo/margem); contratos ao vivo do Firestore. */
@Component({
  selector: 'og-planos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NxPageLoadingComponent,
    OgCardComponent,
    OgConfirmDialogComponent,
    OgContratarDialogComponent,
    OgIconComponent,
    OgPageHeaderComponent,
    OgPillComponent,
    OgPlanCardComponent,
  ],
  template: `
    <og-page-header title="Planos NexaGO" subtitle="Organização completa do seu evento: quadras, arbitragem e transmissão">
      <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="!catalog()" (click)="dialogOpen.set(true)">
        <og-icon name="plus" [size]="14" />Contratar para um evento
      </button>
    </og-page-header>

    <div class="og-content og-planos">
      @if (notice(); as n) {
        <div class="notice" role="status">
          <og-icon name="check" [size]="16" [strokeWidth]="2.2" />
          <span>{{ n }}</span>
          <button type="button" class="og-ghost-btn" aria-label="Fechar aviso" (click)="notice.set(null)">
            <og-icon name="close" [size]="14" />
          </button>
        </div>
      }

      @if (catalogError(); as e) {
        <og-card>
          <p class="muted">Não foi possível carregar os planos. {{ e }}</p>
          <div><button type="button" class="og-mini-btn" (click)="reloadCatalog()">Tentar de novo</button></div>
        </og-card>
      } @else if (!catalog()) {
        <app-nx-page-loading title="Carregando planos…" />
      } @else {
        @if (plans().length === 0) {
          <og-card><p class="muted">Nenhum plano disponível no momento.</p></og-card>
        } @else {
          <div class="plans">
            @for (p of plans(); track p.id; let i = $index) {
              <og-plan-card [plan]="p" [prev]="i > 0 ? plans()[i - 1]! : null" />
            }
          </div>
        }

        <div class="rules">
          @for (r of rules(); track r.title) {
            <div class="rule">
              <og-icon [name]="r.icon" [size]="17" />
              <div>
                <div class="rule-title">{{ r.title }}</div>
                <div class="rule-desc">{{ r.desc }}</div>
              </div>
            </div>
          }
        </div>

        <div class="bottom">
          <og-card kicker="Seus contratos" title="Eventos com plano NexaGO">
            @if (contractsError()) {
              <p class="muted">Não foi possível carregar seus contratos. Recarregue a página.</p>
            } @else if (!contractsReady()) {
              <p class="muted">Carregando…</p>
            } @else {
              @for (c of contracts(); track c.tournamentId; let last = $last) {
                <div class="contract" [class.last]="last" [class.inactive]="!isActive(c)">
                  <div class="contract-main">
                    <a class="contract-name" [routerLink]="['/painel/eventos', c.tournamentId]">{{ c.tournamentName }}</a>
                    <div class="contract-meta">{{ range(c) }} · {{ c.plan.name }} · {{ nextStep(c) }}</div>
                  </div>
                  <span class="contract-value">{{ brl(c.priceCents) }}</span>
                  <og-pill [tone]="statusView(c).tone">{{ statusView(c).label }}</og-pill>
                  <div class="contract-actions">
                    @if (c.sponsors.enabled && c.status !== 'cancelled') {
                      <a class="og-ghost-btn" [routerLink]="['/painel/planos', c.tournamentId, 'sponsors']">Sponsors</a>
                    }
                    @if (c.status === 'requested') {
                      <button type="button" class="og-ghost-btn" (click)="askCancel(c)">Cancelar</button>
                    }
                  </div>
                </div>
              } @empty {
                <p class="muted">Nenhum evento com plano ainda. Contrate para um torneio seu e a NexaGO leva a equipe.</p>
              }
            }
          </og-card>

          <og-card kicker="NexaGO Sponsors" title="Venda cotas na sua transmissão">
            @if (sponsorsLink(); as link) {
              <a card-action class="og-ghost-btn" [routerLink]="link">Ver cotas</a>
            }
            <p class="sponsors-intro">{{ sponsorsIntro() }}</p>
            @for (t of tiers(); track t.id; let last = $last) {
              <div class="tier" [class.last]="last">
                <span class="tier-dot" [style.background]="t.color"></span>
                <span class="tier-name">{{ t.name }}</span>
                <span class="tier-desc">{{ delivery(t) }}</span>
                <span class="tier-price">{{ brl(t.priceCents) }}</span>
              </div>
            } @empty {
              <p class="muted">Nenhuma cota à venda no momento.</p>
            }
          </og-card>
        </div>
      }
    </div>

    @if (dialogOpen() && catalog(); as cat) {
      <og-contratar-dialog
        [catalog]="cat"
        [contracts]="contracts()"
        (closed)="dialogOpen.set(false)"
        (requested)="onRequested($event)"
      />
    }

    @if (cancelTarget(); as c) {
      <og-confirm-dialog
        title="Cancelar pedido?"
        [message]="'O pedido do ' + c.plan.name + ' para ' + c.tournamentName + ' sai da fila da NexaGO. Dá pra pedir de novo depois, pela tabela vigente.'"
        confirmLabel="Cancelar pedido"
        [destructive]="true"
        [busy]="cancelBusy()"
        [error]="cancelError()"
        (confirmed)="confirmCancel(c)"
        (cancelled)="cancelTarget.set(null)"
      />
    }
  `,
  styles: `
    .og-planos {
      container-type: inline-size;
    }
    .og-ghost-btn {
      white-space: nowrap;
    }
    .muted {
      margin: 0 0 12px;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
    .notice {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px 10px 14px;
      border-radius: var(--nx-r-3);
      border: 1px solid rgba(52, 199, 89, 0.35);
      background: rgba(52, 199, 89, 0.08);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
    }
    .notice og-icon {
      flex: none;
      display: inline-flex;
      color: var(--nx-win);
    }
    .notice span {
      flex: 1;
    }
    .plans {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      padding-top: 6px;
    }
    .rules {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1px;
      background: var(--nx-line);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      overflow: hidden;
    }
    .rule {
      display: flex;
      gap: 12px;
      padding: 14px 16px;
      background: var(--nx-surface-0);
    }
    .rule og-icon {
      flex: none;
      display: inline-flex;
      margin-top: 1px;
      color: var(--nx-orange-500);
    }
    .rule-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .rule-desc {
      margin-top: 3px;
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      line-height: 1.45;
      color: var(--nx-text-dim);
    }
    .bottom {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .contract {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .contract.last {
      border-bottom: none;
    }
    .contract.inactive .contract-name,
    .contract.inactive .contract-value {
      color: var(--nx-text-mute);
    }
    .contract-main {
      flex: 1;
      min-width: 0;
    }
    .contract-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
      text-decoration: none;
    }
    .contract-name:hover {
      text-decoration: underline;
    }
    .contract-meta {
      margin-top: 2px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }
    .contract-value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
    }
    .contract-actions {
      display: flex;
      gap: 2px;
    }
    .contract-actions .og-ghost-btn {
      padding: 0 8px;
    }
    .contract-actions:empty {
      display: none;
    }
    .sponsors-intro {
      margin: 0 0 12px;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
    .tier {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .tier.last {
      border-bottom: none;
    }
    .tier-dot {
      flex: none;
      width: 8px;
      height: 8px;
      border-radius: 2px;
    }
    .tier-name {
      flex: none;
      width: 56px;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .tier-desc {
      flex: 1;
      min-width: 0;
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .tier-price {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
    }
    @container (max-width: 1080px) {
      .plans {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        row-gap: 20px;
      }
      .bottom {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @container (max-width: 720px) {
      .rules {
        grid-template-columns: minmax(0, 1fr);
      }
      .contract {
        flex-wrap: wrap;
        row-gap: 6px;
      }
      .contract-main {
        flex-basis: 100%;
      }
    }
    @container (max-width: 480px) {
      .plans {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class PlanosComponent {
  private readonly auth = inject(AuthService);

  protected readonly brl = brl;

  protected readonly catalog = signal<PlanCatalog | null>(null);
  protected readonly catalogError = signal<string | null>(null);
  private readonly rawContracts = signal<PlanContract[]>([]);
  protected readonly contractsReady = signal(false);
  protected readonly contractsError = signal(false);

  protected readonly dialogOpen = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly cancelTarget = signal<PlanContract | null>(null);
  protected readonly cancelBusy = signal(false);
  protected readonly cancelError = signal<string | null>(null);

  protected readonly plans = computed(() => this.catalog()?.plans ?? []);
  protected readonly tiers = computed(() => this.catalog()?.sponsors.tiers ?? []);
  protected readonly contracts = computed(() => sortContracts(this.rawContracts()));

  /** A régua do protótipo, mas só com o que a tabela vigente de fato promete. */
  protected readonly rules = computed<RuleItem[]>(() => {
    const cat = this.catalog();
    if (!cat) return [];
    const out: RuleItem[] = [
      {
        icon: 'cash',
        title: `Inscrições pela NexaGO · ${cat.feePercent}%`,
        desc: 'A comissão sobre as inscrições pagas no app é cobrada à parte do valor do plano.',
      },
    ];
    const live = cat.plans.filter((p) => p.live);
    if (live.length > 0) {
      out.push({
        icon: 'video',
        title: 'Transmissão na quadra principal',
        desc: live.every((p) => p.narrator)
          ? 'Com narração, não importa quantas quadras o plano tenha.'
          : 'Narração conforme o plano escolhido.',
      });
    }
    const hours = hoursRangeLabel(cat.plans);
    if (hours) {
      out.push({
        icon: 'clock',
        title: `Até ${hours} horas de evento`,
        desc: 'Equipe, arbitragem e transmissão durante toda a cobertura.',
      });
    }
    return out;
  });

  protected readonly sponsorsIntro = computed(() => {
    const s = this.catalog()?.sponsors;
    if (!s) return '';
    if (!s.organizerCanSell) return 'A venda de cotas pelo organizador está pausada no momento.';
    return `Indique patrocinadores locais e fique com ${s.organizerSharePct}% de cada cota vendida.`;
  });

  /** "Ver cotas" leva ao próximo evento contratado que tem cotas. */
  protected readonly sponsorsLink = computed(() => {
    const c = this.contracts().find((x) => isActiveContract(x.status) && x.sponsors.enabled);
    return c ? ['/painel/planos', c.tournamentId, 'sponsors'] : null;
  });

  constructor() {
    void this.reloadCatalog();

    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? '';
      if (!uid) return;
      this.contractsReady.set(false);
      this.contractsError.set(false);
      const stop = watchMyPlanContracts(
        uid,
        (list) => {
          this.rawContracts.set(list);
          this.contractsReady.set(true);
        },
        (err) => {
          console.warn('Planos: falha ao ler os contratos', err);
          this.contractsError.set(true);
        },
      );
      onCleanup(stop);
    });
  }

  protected async reloadCatalog(): Promise<void> {
    this.catalogError.set(null);
    this.catalog.set(null);
    try {
      this.catalog.set(await loadPlanCatalog());
    } catch (err) {
      this.catalogError.set(err instanceof Error ? err.message : '');
    }
  }

  protected isActive(c: PlanContract): boolean {
    return isActiveContract(c.status);
  }

  protected range(c: PlanContract): string {
    return dayRangeLabel(c.startDate, c.endDate);
  }

  protected nextStep(c: PlanContract): string {
    return contractNextStep(c);
  }

  protected statusView(c: PlanContract) {
    return CONTRACT_STATUS_VIEW[c.status];
  }

  protected delivery(t: Parameters<typeof tierDeliveryLabel>[0]): string {
    return tierDeliveryLabel(t);
  }

  protected onRequested(tournamentName: string): void {
    this.dialogOpen.set(false);
    this.notice.set(`Pedido enviado para ${tournamentName}. A NexaGO confirma a data e envia a cobrança do sinal.`);
  }

  protected askCancel(c: PlanContract): void {
    this.cancelError.set(null);
    this.cancelTarget.set(c);
  }

  protected async confirmCancel(c: PlanContract): Promise<void> {
    this.cancelBusy.set(true);
    this.cancelError.set(null);
    try {
      await cancelPlanContract(c.tournamentId);
      this.cancelTarget.set(null);
    } catch (err) {
      this.cancelError.set(err instanceof Error ? err.message : 'Não foi possível cancelar.');
    } finally {
      this.cancelBusy.set(false);
    }
  }
}
