import { computed, signal } from '@angular/core';
import type { AthleteProfileSummary } from '../bookings/bookings-repository';
import type { ArenaRecurringBooking } from './arena-recurring-booking.model';

export type AthleteProfileResolver = (athleteId: string) => Promise<AthleteProfileSummary>;

type ProfileEntry = readonly [string, AthleteProfileSummary];

/** Nome e foto dos atletas vinculados a horários fixos. A série grava só o `athleteId`; quem
 *  mostra a série resolve aqui, uma leitura por atleta (na tela, `resolveAthleteProfile` em
 *  `public_profiles`: cobre cliente da arena e atleta achado na busca em todo o nexaGO).
 *  Usado pela lista de Horários fixos e pela grade de Planos de horário. */
export class RecurringAthleteProfiles {
  private readonly profiles = signal<ReadonlyMap<string, AthleteProfileSummary>>(new Map());
  private readonly pending = new Set<string>();

  readonly names = computed<ReadonlyMap<string, string>>(
    () => new Map([...this.profiles()].map(([id, profile]) => [id, profile.name])),
  );

  constructor(private readonly resolve: AthleteProfileResolver) {}

  photoOf(athleteId: string | null): string | null {
    if (!athleteId) return null;
    return this.profiles().get(athleteId)?.photoUrl ?? null;
  }

  /** Resolve quem ainda não tem perfil. Leitura que falha fica de fora e volta no próximo snapshot. */
  async load(series: readonly Pick<ArenaRecurringBooking, 'athleteId' | 'customerName'>[]): Promise<void> {
    const known = this.profiles();
    const missing = [...new Set(series.map((s) => s.athleteId))].filter(
      (id): id is string => !!id && !known.has(id) && !this.pending.has(id),
    );
    if (missing.length === 0) return;

    missing.forEach((id) => this.pending.add(id));
    const entries = await Promise.all(missing.map((id) => this.resolveSafe(id)));
    missing.forEach((id) => this.pending.delete(id));

    const found = entries.filter((entry): entry is ProfileEntry => entry != null);
    if (found.length > 0) this.profiles.update((current) => new Map([...current, ...found]));
  }

  private async resolveSafe(athleteId: string): Promise<ProfileEntry | null> {
    try {
      return [athleteId, await this.resolve(athleteId)];
    } catch {
      return null;
    }
  }
}
