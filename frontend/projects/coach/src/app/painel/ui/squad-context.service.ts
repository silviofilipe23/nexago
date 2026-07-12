import { Injectable, computed, signal } from '@angular/core';

export interface SquadSummary {
  id: string;
  name: string;
  initials: string;
}

/**
 * Estado compartilhado de "equipe ativa". Treinos, presença, avaliações e
 * convocações são sempre filtrados pela equipe selecionada aqui. Populado
 * pelo SquadsService (Task 7) assim que as equipes reais são carregadas —
 * até lá fica vazio, e o seletor da sidebar mostra "Nenhuma equipe".
 */
@Injectable({ providedIn: 'root' })
export class SquadContextService {
  readonly squads = signal<SquadSummary[]>([]);
  readonly activeSquadId = signal<string | null>(null);

  readonly activeSquad = computed(
    () => this.squads().find((s) => s.id === this.activeSquadId()) ?? null,
  );

  /** Substitui a lista de equipes; se a equipe ativa não existir mais na lista nova, cai pra primeira (ou null). */
  setSquads(list: SquadSummary[]): void {
    this.squads.set(list);
    const current = this.activeSquadId();
    if (!current || !list.some((s) => s.id === current)) {
      this.activeSquadId.set(list[0]?.id ?? null);
    }
  }

  setActiveSquad(id: string): void {
    this.activeSquadId.set(id);
  }
}
