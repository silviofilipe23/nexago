import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CenterContextService } from '../../core/center-context.service';
import { CatalogActions } from '../../data/actions/catalog.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, todayKey } from '../../domain/dates';
import { priceOn } from '../../domain/enrollment';
import { formatBRL } from '../../domain/money';
import type { Plan, PlanType } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/kit';
import { PlanFormComponent } from './plan-form.component';
import { PlanPriceComponent } from './plan-price.component';
import { contractsByPlan, planRule, priceSuffix } from './plan-view';

/** W19 — Planos mensais e pacotes. Preço tem fluxo próprio (W20) que preserva os contratos. */
@Component({
  selector: 'ct-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, PageHeaderComponent, IconComponent, PlanFormComponent, PlanPriceComponent],
  templateUrl: './plans.component.html',
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
    .plan { padding: 16px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); display: flex; flex-direction: column; }
    .plan.top { border-color: rgba(255,106,26,0.45); }
    .plan.arch { opacity: 0.55; }
    .name { margin-top: 10px; font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; color: var(--nx-text); }
    .price { display: flex; align-items: baseline; gap: 4px; margin-top: 8px; }
    .price b { font-family: var(--nx-font-display); font-weight: 800; font-size: 24px; color: var(--nx-text); }
    .sched { margin-top: 4px; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-orange-400); }
    .rule { margin-top: 8px; font-size: 12px; color: var(--nx-text-mute); }
    .acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto; padding-top: 12px; }
    .explain { padding: 16px; border-radius: var(--nx-r-4); border: 1px dashed var(--nx-line-strong); display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  `,
})
export class PlansComponent {
  readonly centerId = input('');

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly catalog = inject(CatalogActions);

  protected readonly formatBRL = formatBRL;
  protected readonly formatDayKey = formatDayKey;
  protected readonly planRule = planRule;
  protected readonly priceSuffix = priceSuffix;

  protected readonly today = computed(() => todayKey(this.ctx.center()?.timezone));
  protected readonly canEdit = computed(() => this.ctx.has('edit_plans') && this.ctx.canWrite());
  protected readonly contracts = computed(() => contractsByPlan(this.store.enrollments()));
  /** Sem o feed de matrículas (papel sem leitura), o número de contratos não é mostrado. */
  protected readonly seesContracts = computed(() => this.store.loaded.enrollments());

  private readonly sorted = computed(() =>
    [...this.store.plans()].sort(
      (a, b) => Number(a.status === 'archived') - Number(b.status === 'archived') || Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name, 'pt-BR'),
    ),
  );
  protected readonly monthly = computed(() => this.sorted().filter((p) => p.type === 'monthly'));
  protected readonly packs = computed(() => this.sorted().filter((p) => p.type === 'class_pack'));

  protected readonly subtitle = computed(() => {
    const all = this.store.plans();
    const active = all.filter((p) => p.status === 'active').length;
    const parts = [`${active} ativo${active === 1 ? '' : 's'}`, `${all.length - active} arquivado${all.length - active === 1 ? '' : 's'}`];
    if (this.seesContracts()) {
      let total = 0;
      this.contracts().forEach((c) => (total += c.count));
      parts.push(`${total} contratos`);
    }
    return parts.join(' · ');
  });

  /** Modal aberto: novo (com tipo), edição ou preço. */
  protected readonly creating = signal<PlanType | null>(null);
  protected readonly editing = signal<Plan | null>(null);
  protected readonly pricing = signal<Plan | null>(null);
  protected readonly busyId = signal<string | null>(null);
  protected readonly error = signal('');

  priceNow(p: Plan): number {
    return priceOn(p, this.today());
  }

  /** Preço agendado ainda no futuro (o de hoje já entra em `priceNow`). */
  scheduled(p: Plan): Plan['scheduledPrice'] {
    return p.scheduledPrice && p.scheduledPrice.effectiveFrom > this.today() ? p.scheduledPrice : null;
  }

  programNames(p: Plan): string {
    if (p.programIds.length === 0) {
      return 'Todas as modalidades';
    }
    return p.programIds.map((id) => this.store.programById(id)?.name ?? 'Modalidade removida').join(' · ');
  }

  contractCount(p: Plan): number {
    return this.contracts().get(p.id)?.count ?? 0;
  }

  async toggleArchived(p: Plan): Promise<void> {
    this.busyId.set(p.id);
    this.error.set('');
    try {
      await this.catalog.setPlanArchived(p, p.status !== 'archived');
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busyId.set(null);
    }
  }
}
