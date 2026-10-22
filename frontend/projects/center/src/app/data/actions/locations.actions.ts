import { Injectable, inject } from '@angular/core';
import { collection, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { addDays, todayKey } from '../../domain/dates';
import type { CenterLocation, ClassSession, TrainingClass } from '../../domain/models';
import { readSession } from '../mappers';
import { CenterStore } from '../center-store.service';
import { CENTERS, db } from '../firebase';
import { CenterActionsBase } from './actor';
import { ClassesActions } from './classes.actions';

export type LocationInput = Pick<
  CenterLocation,
  'name' | 'type' | 'address' | 'notes' | 'isPrimary' | 'windows' | 'courtsLabel' | 'contactName' | 'contactPhone'
>;

export type ArchiveMode = 'move' | 'keep' | 'cancel';

export interface MoveTarget {
  location: CenterLocation;
  courtId: string;
  courtName: string;
}

/** Id fixo da sede criada na migração (idempotente: rodar de novo só reescreve o mesmo doc). */
export const LEGACY_LOCATION_ID = 'sede';

const CHUNK = 8;

/** Aulas a partir de hoje que acontecem no local, ainda não realizadas. */
export interface LocationImpact {
  classes: TrainingClass[];
  sessions: ClassSession[];
}

/**
 * Locais do centro (L1–L5). Turma guarda o local padrão; aula guarda o próprio (pode diferir só na
 * data). Local nunca é excluído: arquivado some das escolhas novas, aula passada continua
 * mostrando onde foi.
 */
@Injectable({ providedIn: 'root' })
export class LocationsActions extends CenterActionsBase {
  private readonly store = inject(CenterStore);
  private readonly classes = inject(ClassesActions);

  private today(): string {
    return todayKey(this.ctx.center()?.timezone);
  }

  async save(id: string | null, input: LocationInput): Promise<string> {
    this.assertWritable();
    const ref = this.ref('locations', id ?? undefined);
    const b = writeBatch(db());
    b.set(
      ref,
      {
        ...input,
        name: input.name.trim(),
        address: input.address.trim(),
        notes: input.notes.trim(),
        // Janela e quadras de parceiro só fazem sentido para parceiro.
        windows: input.type === 'partner' ? input.windows : [],
        courtsLabel: input.type === 'partner' ? input.courtsLabel.trim() : '',
        ...(id ? {} : { status: 'active', archivedAt: null }),
      },
      { merge: true },
    );
    // Um só principal.
    if (input.isPrimary) {
      for (const other of this.store.locations()) {
        if (other.id !== ref.id && other.isPrimary) b.update(this.ref('locations', other.id), { isPrimary: false });
      }
    }
    // Nome novo vale também para a denominação guardada nas turmas.
    if (id) {
      const prev = this.store.locationById(id);
      if (prev && prev.name !== input.name.trim()) {
        for (const c of this.store.classes().filter((x) => x.locationId === id)) {
          b.update(this.ref('classes', c.id), { locationName: input.name.trim() });
        }
      }
    }
    const audit = this.auditDoc({
      action: id ? 'location.updated' : 'location.created',
      entity: 'location',
      entityId: ref.id,
      detail: `${input.name.trim()} (${input.type === 'own' ? 'próprio' : input.type === 'partner' ? 'parceiro' : 'avulso'})`,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
    return ref.id;
  }

  /** Turmas com o local como padrão + aulas futuras (não realizadas) no local. */
  async impact(location: CenterLocation): Promise<LocationImpact> {
    const today = this.today();
    const snap = await getDocs(
      query(collection(db(), CENTERS, this.centerId(), 'sessions'), where('locationId', '==', location.id), where('date', '>=', today)),
    );
    return {
      classes: this.store.classes().filter((c) => c.locationId === location.id && (c.status === 'active' || c.status === 'draft')),
      sessions: snap.docs.map((d) => readSession(d.id, d.data())).filter((s) => s.status === 'scheduled'),
    };
  }

  /**
   * L4 — arquivar. `move`: turmas e aulas futuras vão para o outro local (aulas da próxima semana
   * ficam marcadas como alteradas, o que avisa os alunos); `keep`: aulas já marcadas continuam;
   * `cancel`: cancela as aulas futuras (com reposição) — só quando nenhuma turma usa o local como
   * padrão, senão a turma geraria aulas novas num local arquivado.
   */
  async archive(location: CenterLocation, mode: ArchiveMode, reason: string, target?: MoveTarget): Promise<void> {
    this.assertWritable();
    const { classes, sessions } = await this.impact(location);
    if (mode === 'cancel' && classes.length > 0) {
      throw new Error('Mova as turmas que usam este local como padrão antes de cancelar as aulas.');
    }
    if (mode === 'move' && (!target || target.location.id === location.id)) {
      throw new Error('Escolha o local de destino.');
    }
    if (mode === 'cancel') {
      for (const s of sessions) {
        await this.classes.cancelSession(s, reason || `Local ${location.name} desativado`);
      }
    }
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    if (mode === 'move' && target) {
      const soon = addDays(this.today(), 7);
      const place = {
        locationId: target.location.id,
        locationName: target.location.name,
        courtId: target.courtId,
        courtName: target.courtName,
      };
      for (const c of classes) ops.push((b) => b.update(this.ref('classes', c.id), place));
      for (const s of sessions) {
        ops.push((b) =>
          b.update(this.ref('sessions', s.id), {
            ...place,
            locationAddress: target.location.address,
            ...(s.date <= soon ? { changed: true, changeReason: reason.trim() || `Local ${location.name} desativado` } : {}),
          }),
        );
      }
    }
    const audit = this.auditDoc({
      action: 'location.archived',
      entity: 'location',
      entityId: location.id,
      detail: `${location.name} arquivado · ${
        mode === 'move' ? `${classes.length} turma(s) e ${sessions.length} aula(s) movidas para ${target!.location.name}` : mode === 'keep' ? `${sessions.length} aula(s) já marcadas mantidas` : `${sessions.length} aula(s) canceladas`
      }`,
      reason,
    });
    ops.push((b) => {
      b.update(this.ref('locations', location.id), { status: 'archived', archivedAt: serverTimestamp(), isPrimary: false });
      b.set(audit.ref, audit.data);
    });
    for (let i = 0; i < ops.length; i += CHUNK) {
      const b = writeBatch(db());
      ops.slice(i, i + CHUNK).forEach((op) => op(b));
      await b.commit();
    }
  }

  async restore(location: CenterLocation): Promise<void> {
    this.assertWritable();
    const b = writeBatch(db());
    b.update(this.ref('locations', location.id), { status: 'active', archivedAt: null });
    const audit = this.auditDoc({ action: 'location.restored', entity: 'location', entityId: location.id, detail: `${location.name} reativado` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /**
   * Centro de antes dos locais: quadras, turmas e aulas sem `locationId`. Cria a "Sede" (própria e
   * principal, com o endereço do centro) e pendura tudo nela. Idempotente pelo id fixo.
   */
  async migrateLegacy(): Promise<boolean> {
    const center = this.ctx.center();
    const courts = this.store.courts().filter((c) => !c.locationId);
    const classes = this.store.classes().filter((c) => !c.locationId);
    const today = this.today();
    const sessions = this.store.sessions().filter((s) => !s.locationId && s.date >= today && s.status === 'scheduled');
    // Só quem tinha quadra antiga (centro com sede). Itinerante sem local não ganha "Sede" à toa.
    if (!center || this.store.locations().length > 0 || courts.length === 0) return false;
    const name = 'Sede';
    const address = [center.address, center.city, center.state].filter(Boolean).join(' · ');
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [
      (b) => {
        b.set(this.ref('locations', LEGACY_LOCATION_ID), {
          name, type: 'own', address, notes: '', isPrimary: true, status: 'active', windows: [], courtsLabel: '',
          contactName: '', contactPhone: '', archivedAt: null,
        }, { merge: true });
        const audit = this.auditDoc({ action: 'location.created', entity: 'location', entityId: LEGACY_LOCATION_ID, detail: 'Sede criada com as quadras existentes' });
        b.set(audit.ref, audit.data);
      },
    ];
    for (const c of courts) ops.push((b) => b.update(this.ref('courts', c.id), { locationId: LEGACY_LOCATION_ID }));
    for (const c of classes) ops.push((b) => b.update(this.ref('classes', c.id), { locationId: LEGACY_LOCATION_ID, locationName: name }));
    for (const s of sessions) {
      ops.push((b) => b.update(this.ref('sessions', s.id), { locationId: LEGACY_LOCATION_ID, locationName: name, locationAddress: address }));
    }
    for (let i = 0; i < ops.length; i += CHUNK) {
      const b = writeBatch(db());
      ops.slice(i, i + CHUNK).forEach((op) => op(b));
      await b.commit();
    }
    return true;
  }
}
