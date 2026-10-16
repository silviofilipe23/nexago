import { Injectable } from '@angular/core';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { backofficeDb, backofficeFunctions, backofficeStorage } from '../../../data/firebase';
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

export type TransferStatus = 'rascunho' | 'separacao' | 'em_transito' | 'recebido' | 'cancelada';

export interface TransferItemDoc {
  productId: string;
  skuId: string;
  qty: number;
  receivedQty?: number;
  skuCode: string;
  productName: string;
  variantLabel: string;
}

export interface TransferDoc {
  id: string;
  code: string;
  status: TransferStatus;
  version: number;
  fromLocationId: string;
  toLocationId: string;
  items: TransferItemDoc[];
  units: number;
  transport: string;
  departAt: string;
  arriveAt: string;
  receiver: string;
  note: string;
  history: { status: TransferStatus; actor: { name: string }; at: Date | null }[];
  /** Pedidos que a remessa leva (02 › "Criar remessa p/ arena"). */
  orderIds?: string[];
}

/** Rascunho de entrada como o servidor guarda (mesmo formato do payload). */
export type EntryDraftDoc = Raw & { entryId: string; updatedAt: Date | null };

/** Item da lista "Em andamento" do Estoque. */
export interface OpenWork {
  kind: 'entrada' | 'transferencia';
  id: string;
  title: string;
  subtitle: string;
  status: string;
  updatedAt: Date | null;
}

/** Valores já usados, para os campos livres sugerirem (fornecedor, transporte, recebedor). */
export interface FieldSuggestions {
  suppliers: string[];
  transports: string[];
  receivers: string[];
}

function fallbackName(id: string): string {
  return id === 'cd' ? 'CD' : id;
}

const dateOf = (v: any): Date | null => v?.toDate?.() ?? (v instanceof Date ? v : null);

function transferFromDoc(id: string, d: Raw): TransferDoc {
  return {
    id,
    code: d['code'] ?? '',
    status: d['status'] ?? 'rascunho',
    version: d['version'] ?? 0,
    fromLocationId: d['fromLocationId'] ?? '',
    toLocationId: d['toLocationId'] ?? '',
    items: d['items'] ?? [],
    units: d['units'] ?? 0,
    transport: d['transport'] ?? '',
    departAt: d['departAt'] ?? '',
    arriveAt: d['arriveAt'] ?? '',
    receiver: d['receiver'] ?? '',
    note: d['note'] ?? '',
    history: ((d['history'] ?? []) as Raw[]).map((h) => ({ status: h['status'], actor: h['actor'] ?? { name: '' }, at: dateOf(h['at']) })),
    orderIds: Array.isArray(d['orderIds']) ? d['orderIds'] : [],
  };
}

const uniq = (values: unknown[]): string[] =>
  [...new Set(values.filter((v): v is string => typeof v === 'string' && v.trim() !== ''))].slice(0, 20);

/**
 * Leitura do estoque direto do Firestore; escrita só por callable — saldo nunca
 * muda sem uma movimentação (as rules negam escrita de cliente).
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

    const costs = new Map(costSnap.docs.map((d) => [d.id, d.data() as Raw]));
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

  /** Transferências abertas (rascunho → em trânsito). Igualdade simples: dispensa índice composto. */
  async openTransfers(): Promise<TransferDoc[]> {
    const col = collection(backofficeDb(), 'storeTransfers');
    const snaps = await Promise.all(
      (['rascunho', 'separacao', 'em_transito'] as const).map((s) => getDocs(query(col, where('status', '==', s)))),
    );
    return snaps.flatMap((s) => s.docs.map((d) => transferFromDoc(d.id, d.data() as Raw)));
  }

  async entryDrafts(): Promise<EntryDraftDoc[]> {
    const snap = await getDocs(collection(backofficeDb(), 'storeStockDrafts'));
    return snap.docs.map((d) => ({ ...(d.data() as Raw), entryId: d.id, updatedAt: dateOf((d.data() as Raw)['updatedAt']) }));
  }

  async entryDraft(id: string): Promise<EntryDraftDoc | null> {
    const snap = await getDoc(doc(backofficeDb(), 'storeStockDrafts', id));
    return snap.exists() ? { ...(snap.data() as Raw), entryId: id, updatedAt: dateOf((snap.data() as Raw)['updatedAt']) } : null;
  }

  async transfer(id: string): Promise<TransferDoc | null> {
    const snap = await getDoc(doc(backofficeDb(), 'storeTransfers', id));
    return snap.exists() ? transferFromDoc(id, snap.data() as Raw) : null;
  }

  /** Sugestões dos campos livres a partir das últimas entradas e transferências. */
  async suggestions(): Promise<FieldSuggestions> {
    const db = backofficeDb();
    const [moves, transfers] = await Promise.all([
      getDocs(query(collection(db, 'storeStockMovements'), orderBy('createdAt', 'desc'), limit(80))),
      getDocs(query(collection(db, 'storeTransfers'), orderBy('createdAt', 'desc'), limit(40))),
    ]);
    const m = moves.docs.map((d) => d.data() as Raw);
    const t = transfers.docs.map((d) => d.data() as Raw);
    return {
      suppliers: uniq(m.map((x) => x['supplier'])),
      transports: uniq(t.map((x) => x['transport'])),
      receivers: uniq(t.map((x) => x['receiver'])),
    };
  }

  async saveEntryDraft(input: Raw): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'saveStockEntryDraft')(input);
  }

  async confirmEntry(input: Raw): Promise<{ movementId: string; units: number }> {
    const r = await httpsCallable<unknown, { movementId: string; units: number }>(backofficeFunctions(), 'confirmStockEntry')(input);
    return r.data;
  }

  async deleteEntryDraft(entryId: string): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'deleteStockDraft')({ entryId });
  }

  async saveTransfer(input: Raw): Promise<{ transferId: string; code: string; version: number; status: TransferStatus }> {
    const r = await httpsCallable<unknown, { transferId: string; code: string; version: number; status: TransferStatus }>(
      backofficeFunctions(),
      'saveStoreTransfer',
    )(input);
    return r.data;
  }

  async advanceTransfer(input: Raw): Promise<{ version: number; status: TransferStatus }> {
    const r = await httpsCallable<unknown, { version: number; status: TransferStatus }>(
      backofficeFunctions(),
      'advanceStoreTransfer',
    )(input);
    return r.data;
  }

  /** Anexo da entrada: vai para `store/stock/{entryId}/` (a callable confere o prefixo). */
  async uploadAttachment(entryId: string, file: File): Promise<{ name: string; path: string; url: string; contentType: string }> {
    const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
    const path = `store/stock/${entryId}/${Date.now()}-${safe}`;
    const r = storageRef(backofficeStorage(), path);
    await uploadBytes(r, file, { contentType: file.type });
    return { name: file.name, path, url: await getDownloadURL(r), contentType: file.type };
  }
}
