import { Injectable } from '@angular/core';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { backofficeDb } from '../../../data/firebase';
import {
  movementFromDoc,
  rowsFromProduct,
  type StockLocation,
  type StockMovement,
  type StockRow,
} from './stock';

type Raw = Record<string, any>;

export interface StockSnapshot {
  locations: StockLocation[];
  rows: StockRow[];
  movements: StockMovement[];
}

/** Rótulo de um local que tem saldo mas ainda não está em `storeLocations`. */
function fallbackName(id: string): string {
  return id === 'cd' ? 'CD' : id;
}

/**
 * Leitura do estoque direto do Firestore. Escrita é só por callable: saldo
 * nunca muda sem uma movimentação (rules negam escrita de cliente).
 */
@Injectable({ providedIn: 'root' })
export class StockRepository {
  async load(): Promise<StockSnapshot> {
    const db = backofficeDb();
    const [locSnap, productSnap, costSnap, moveSnap] = await Promise.all([
      getDocs(query(collection(db, 'storeLocations'), orderBy('order'))),
      getDocs(query(collection(db, 'storeProducts'), orderBy('name'))),
      getDocs(collection(db, 'storeProductCosts')),
      getDocs(query(collection(db, 'storeStockMovements'), orderBy('createdAt', 'desc'), limit(4))),
    ]);

    const costs = new Map(costSnap.docs.map((d) => [d.id, ((d.data() as Raw)['costCents'] ?? null) as number | null]));
    const products = productSnap.docs.filter((d) => (d.data() as Raw)['status'] !== 'arquivado');
    // Em paralelo: em série, cada produto somaria uma ida e volta ao Firestore.
    const skuSnaps = await Promise.all(products.map((p) => getDocs(collection(p.ref, 'skus'))));
    const rows = products.flatMap((p, i) =>
      rowsFromProduct(
        p.id,
        p.data() as Raw,
        skuSnaps[i]!.docs.map((s) => ({ id: s.id, data: s.data() as Raw })),
        costs.get(p.id) ?? null,
      ),
    );

    const locations: StockLocation[] = locSnap.docs
      .filter((d) => (d.data() as Raw)['active'] !== false)
      .map((d) => ({ id: d.id, name: (d.data() as Raw)['name'] ?? d.id, type: (d.data() as Raw)['type'] ?? 'arena' }));
    // Saldo num local que não está cadastrado não pode sumir da tabela: vira coluna mesmo assim.
    const known = new Set(locations.map((l) => l.id));
    for (const id of [...new Set(rows.flatMap((r) => Object.keys(r.byLocation)))].sort()) {
      if (!known.has(id)) {
        locations.push({ id, name: fallbackName(id), type: id === 'cd' ? 'cd' : 'arena' });
        known.add(id);
      }
    }
    const nameOf = (id: string) => locations.find((l) => l.id === id)?.name ?? fallbackName(id);

    return {
      locations,
      rows,
      movements: moveSnap.docs.map((d) => movementFromDoc(d.id, d.data() as Raw, nameOf)),
    };
  }
}
