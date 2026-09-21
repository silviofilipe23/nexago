import { Injectable, signal } from '@angular/core';
import type { ArenaSportChip } from '@nexago/arena-discovery';
import type { FilterLevel } from '../ranking/athlete-ranking.models';
import type { AthleteDirectoryEntry } from './athlete-directory.models';

export type SortBy = 'ranking' | 'name' | 'level';

export const CITY_ALL = 'all';

/**
 * Memória da listagem de atletas — vive na raiz, não no componente.
 *
 * `/atletas` e `/atletas/:handle` são rotas IRMÃS: abrir um perfil destrói o
 * `AthleteDirectoryComponent` inteiro (com as páginas já roladas, o cursor e a
 * posição do scroll). Guardando o estado aqui, voltar do perfil reexibe a mesma
 * lista, no mesmo ponto, sem uma leitura nova no Firestore.
 *
 * O cache é da SESSÃO (some no reload da página) e vale para uma combinação de
 * filtros só: trocar busca/nível/cidade invalida e recarrega do servidor.
 */
@Injectable({ providedIn: 'root' })
export class AthleteDirectoryStore {
  readonly queryInput = signal('');
  readonly filterQuery = signal('');
  readonly sportFilter = signal<ArenaSportChip>('all');
  readonly levelFilter = signal<FilterLevel>('all');
  readonly cityFilter = signal<string>(CITY_ALL);
  readonly sortBy = signal<SortBy>('ranking');

  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly allAthletes = signal<readonly AthleteDirectoryEntry[]>([]);
  readonly hasMore = signal(false);

  nextCursor: string | null = null;
  /** Ranking geral já resolvido (posição por uid) — evita refazer a leitura inteira. */
  rankPositionById = new Map<string, number>();
  /** Ponto do scroll de `.at-main` quando a listagem saiu de tela. */
  scrollTop = 0;

  /** Filtros que produziram o cache; `null` = nada carregado ainda. */
  private cachedSignature: string | null = null;

  /** Chave do cache. Esporte fica de fora: é refino local, não muda a query. */
  static signatureOf(term: string, level: string, city: string): string {
    return `${term.trim()}|${level}|${city}`;
  }

  isWarmFor(signature: string): boolean {
    return this.cachedSignature === signature;
  }

  markLoaded(signature: string): void {
    this.cachedSignature = signature;
  }

  /** Filtro novo: o cache antigo não serve e a lista recomeça do topo. */
  invalidate(): void {
    this.cachedSignature = null;
    this.scrollTop = 0;
  }
}
