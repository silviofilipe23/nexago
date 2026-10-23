import { Injectable } from '@angular/core';
import { arrayRemove, arrayUnion, Timestamp, writeBatch } from 'firebase/firestore';
import { formatDayKey } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import type { Court, Plan, Program } from '../../domain/models';
import { db } from '../firebase';
import { CenterActionsBase } from './actor';

export type ProgramInput = Pick<Program, 'name' | 'color' | 'levels' | 'order'>;
/** `locationId`: local próprio da quadra (quadras são sempre de local próprio). */
export type CourtInput = Pick<Court, 'name' | 'description' | 'status' | 'maintenanceUntil'> & { locationId?: string };
export type PlanInput = Pick<
  Plan,
  'name' | 'type' | 'priceCents' | 'classesPerWeek' | 'makeupsPerMonth' | 'credits' | 'validityDays' | 'programIds' | 'featured'
>;

/** Modalidades, níveis, quadras e planos. */
@Injectable({ providedIn: 'root' })
export class CatalogActions extends CenterActionsBase {
  async saveProgram(id: string | null, input: ProgramInput): Promise<void> {
    this.assertWritable();
    const ref = this.ref('programs', id ?? undefined);
    const b = writeBatch(db());
    b.set(ref, { ...input, name: input.name.trim(), levels: input.levels.map((l) => l.trim()).filter(Boolean) }, { merge: true });
    const audit = this.auditDoc({ action: id ? 'program.updated' : 'program.created', entity: 'program', entityId: ref.id, detail: `Modalidade ${input.name.trim()}` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /** Apaga a modalidade; `sharedPlanIds` (vazio sem `edit_plans`) perdem o id no mesmo batch. */
  async deleteProgram(program: Program, sharedPlanIds: string[]): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.delete(this.ref('programs', program.id));
    for (const id of sharedPlanIds) b.update(this.ref('plans', id), { programIds: arrayRemove(program.id) });
    const audit = this.auditDoc({ action: 'program.deleted', entity: 'program', entityId: program.id, detail: `Modalidade ${program.name}` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  async saveCourt(id: string | null, input: CourtInput): Promise<void> {
    this.assertWritable();
    const ref = this.ref('courts', id ?? undefined);
    const b = writeBatch(db());
    b.set(ref, { ...input, name: input.name.trim(), description: input.description.trim() }, { merge: true });
    const audit = this.auditDoc({ action: id ? 'court.updated' : 'court.created', entity: 'court', entityId: ref.id, detail: `Quadra ${input.name.trim()}` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  async createPlan(input: PlanInput): Promise<void> {
    this.assertWritable();
    const ref = this.ref('plans');
    const b = writeBatch(db());
    b.set(ref, {
      ...input,
      name: input.name.trim(),
      status: 'active',
      priceHistory: [{ priceCents: input.priceCents, effectiveFrom: '', byName: this.actor().name, at: Timestamp.now() }],
      scheduledPrice: null,
    });
    const audit = this.auditDoc({ action: 'plan.created', entity: 'plan', entityId: ref.id, detail: `${input.name.trim()} · ${formatBRL(input.priceCents)}` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /** Edita tudo menos o preço (preço tem fluxo próprio, que preserva contratos). */
  async updatePlan(plan: Plan, input: Omit<PlanInput, 'priceCents'>): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.ref('plans', plan.id), { ...input, name: input.name.trim() });
    const audit = this.auditDoc({ action: 'plan.updated', entity: 'plan', entityId: plan.id, detail: `Plano ${input.name.trim()} editado` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /**
   * Novo preço para contratações a partir de `effectiveFrom` (hoje = imediato). Contratos ativos
   * NÃO mudam: cada matrícula guarda o preço do dia da compra no snapshot do contrato.
   */
  async changePrice(plan: Plan, priceCents: number, effectiveFrom: string, today: string, reason: string): Promise<void> {
    this.assertWritable();
    const change = { priceCents, effectiveFrom, byName: this.actor().name, at: Timestamp.now() };
    const immediate = effectiveFrom <= today;
    const b = writeBatch(db());
    b.update(
      this.ref('plans', plan.id),
      immediate
        ? { priceCents, scheduledPrice: null, priceHistory: arrayUnion(change) }
        : { scheduledPrice: change, priceHistory: arrayUnion(change) },
    );
    const audit = this.auditDoc({
      action: 'plan.price',
      entity: 'plan',
      entityId: plan.id,
      detail: `${plan.name}: ${formatBRL(plan.priceCents)} → ${formatBRL(priceCents)} · vale a partir de ${formatDayKey(effectiveFrom, true)}`,
      reason,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  async setPlanArchived(plan: Plan, archived: boolean): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.ref('plans', plan.id), { status: archived ? 'archived' : 'active' });
    const audit = this.auditDoc({ action: archived ? 'plan.archived' : 'plan.restored', entity: 'plan', entityId: plan.id, detail: plan.name });
    b.set(audit.ref, audit.data);
    await b.commit();
  }
}
