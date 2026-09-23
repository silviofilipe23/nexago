import { Injectable } from '@angular/core';
import { ARENA_NAV_GROUPS, type ArenaNavGroup } from './panel-nav.model';

interface StoredNavState {
  openGroup: ArenaNavGroup | null;
  scrollTop: number;
}

const EMPTY: StoredNavState = { openGroup: null, scrollTop: 0 };

function isGroup(value: unknown): value is ArenaNavGroup {
  return typeof value === 'string' && (ARENA_NAV_GROUPS as readonly string[]).includes(value);
}

/** Grupo aberto e rolagem do menu, por arena.
 *
 *  Existe porque as 38 telas instanciam `<ar-panel-shell>` cada uma e
 *  `app.routes.ts` não tem rota de layout: o shell é destruído e recriado a cada
 *  navegação. Sem isto, o menu voltaria ao estado inicial a cada clique.
 *
 *  Todo acesso ao `localStorage` é protegido: em aba anônima ou com storage
 *  bloqueado ele lança, e uma preferência de menu não pode derrubar o painel. */
@Injectable({ providedIn: 'root' })
export class PanelNavStateService {
  private readonly cache = new Map<string, StoredNavState>();

  openGroup(arenaId: string | null): ArenaNavGroup | null {
    return this.read(arenaId).openGroup;
  }

  setOpenGroup(arenaId: string | null, group: ArenaNavGroup | null): void {
    this.write(arenaId, { ...this.read(arenaId), openGroup: group });
  }

  scrollTop(arenaId: string | null): number {
    return this.read(arenaId).scrollTop;
  }

  setScrollTop(arenaId: string | null, value: number): void {
    this.write(arenaId, { ...this.read(arenaId), scrollTop: value });
  }

  private key(arenaId: string): string {
    return `ar.nav.${arenaId}`;
  }

  private read(arenaId: string | null): StoredNavState {
    if (!arenaId) return EMPTY;
    const cached = this.cache.get(arenaId);
    if (cached) return cached;

    let parsed: StoredNavState = EMPTY;
    try {
      const raw = localStorage.getItem(this.key(arenaId));
      if (raw) {
        const value = JSON.parse(raw) as Partial<StoredNavState>;
        parsed = {
          openGroup: isGroup(value.openGroup) ? value.openGroup : null,
          scrollTop: typeof value.scrollTop === 'number' ? value.scrollTop : 0,
        };
      }
    } catch {
      parsed = EMPTY;
    }

    this.cache.set(arenaId, parsed);
    return parsed;
  }

  private write(arenaId: string | null, state: StoredNavState): void {
    if (!arenaId) return;
    this.cache.set(arenaId, state);
    try {
      localStorage.setItem(this.key(arenaId), JSON.stringify(state));
    } catch {
      // storage indisponível: o cache em memória segura a sessão atual
    }
  }
}
