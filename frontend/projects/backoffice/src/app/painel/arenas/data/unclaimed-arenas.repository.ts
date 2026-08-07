import { Injectable } from '@angular/core';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { backofficeDb } from '../../data/firebase';

export interface UnclaimedArenaRow {
  id: string;
  name: string;
  city: string | null;
  whatsapp: string | null;
  /** Cliques totais no botão "Entre em contato". */
  contactClicksTotal: number;
  /** Atletas distintos que clicaram — o número que vai para a reunião. */
  contactAthletesCount: number;
  lastClickAt: Date | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function date(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function toRow(snap: QueryDocumentSnapshot<DocumentData>): UnclaimedArenaRow {
  const data = snap.data();
  const city = str(data['city']);
  const state = str(data['state']);
  return {
    id: snap.id,
    name: str(data['name']) ?? `Arena ${snap.id}`,
    city: city && state ? `${city} · ${state}` : (city ?? state),
    whatsapp: str(data['whatsapp']),
    contactClicksTotal: num(data['contactClicksTotal']),
    contactAthletesCount: num(data['contactAthletesCount']),
    lastClickAt: date(data['contactLastClickAt']),
  };
}

/**
 * Arenas pré-cadastradas e o retorno que elas já tiveram na plataforma.
 *
 * Sem paginação nem `orderBy` no servidor de propósito: o pré-cadastro é uma
 * lista de prospecção de dezenas de arenas, e `where('unclaimed','==',true)`
 * sozinho não precisa de índice composto. Ordenar no cliente evita ter que
 * publicar índice para uma tela que o comercial abre algumas vezes por semana.
 */
@Injectable({ providedIn: 'root' })
export class UnclaimedArenasRepository {
  /** Ordenadas por atletas distintos (desc) — quem mais gerou contato primeiro. */
  async listUnclaimedArenas(): Promise<UnclaimedArenaRow[]> {
    const snap = await getDocs(
      query(collection(backofficeDb(), 'arenas'), where('unclaimed', '==', true)),
    );
    const rows = snap.docs.map(toRow);
    rows.sort((a, b) => {
      if (b.contactAthletesCount !== a.contactAthletesCount) {
        return b.contactAthletesCount - a.contactAthletesCount;
      }
      if (b.contactClicksTotal !== a.contactClicksTotal) {
        return b.contactClicksTotal - a.contactClicksTotal;
      }
      return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
    });
    return rows;
  }

  /**
   * Atletas distintos que procuraram a arena nos últimos `days` dias.
   *
   * Só é chamado quando o operador abre a linha: são poucos docs por arena, mas
   * carregar isso para a lista inteira multiplicaria a leitura por dezenas de
   * arenas só para exibir um número que quase sempre não é olhado.
   */
  async countRecentAthletes(arenaId: string, days = 30): Promise<number> {
    const snap = await getDocs(collection(backofficeDb(), 'arenas', arenaId, 'contactLeads'));
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let count = 0;
    for (const lead of snap.docs) {
      const last = date(lead.data()['lastClickAt']);
      if (last != null && last.getTime() >= cutoff) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Remove o pré-cadastro. Usado quando a arena pede para sair da busca — os
   * dados vieram de listagem pública, então a saída tem de ser de uma ação só.
   */
  async removeUnclaimedArena(arenaId: string): Promise<void> {
    await deleteDoc(doc(backofficeDb(), 'arenas', arenaId));
  }
}
