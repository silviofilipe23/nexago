import { Injectable, inject } from '@angular/core';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../../data/firebase';
import { StockRepository } from '../../../loja/estoque/data/stock.repository';
import { rulesFromDoc, type SquadRules } from './squad-rules';

export interface RulesState {
  rules: SquadRules;
  /** Doc ausente = 1: o padrão do piloto. */
  version: number;
}

export interface RulesVersion {
  version: number;
  rules: SquadRules;
  createdAt: Date | null;
  /** `null` = o padrão do piloto, que ninguém salvou. */
  createdBy: string | null;
  note: string | null;
  changes: string[];
  affectsContracts: boolean;
  restoredFrom: number | null;
}

/** SKU da Loja que pode virar o kit de um nível; o custo preenche o "Custo kit". */
export interface KitSkuOption {
  key: string;
  productId: string;
  skuId: string;
  label: string;
  costCents: number | null;
}

type Raw = Record<string, unknown>;

function dateOf(v: unknown): Date | null {
  return v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate(): Date }).toDate() : null;
}

/**
 * Leitura direto do Firestore; escrita só pela callable `saveSquadRules`
 * (`functions/src/squad-rules.ts`), que grava a vigente e o retrato da versão.
 */
@Injectable({ providedIn: 'root' })
export class SquadRulesRepository {
  private readonly stock = inject(StockRepository);

  async load(): Promise<RulesState> {
    const snap = await getDoc(doc(backofficeDb(), 'squadConfig', 'rules'));
    const data = snap.exists() ? (snap.data() as Raw) : undefined;
    const version = typeof data?.['version'] === 'number' ? (data['version'] as number) : 1;
    return { rules: rulesFromDoc(data), version };
  }

  /** As 30 versões mais recentes, da atual para trás. */
  async versions(): Promise<RulesVersion[]> {
    const col = collection(backofficeDb(), 'squadConfig', 'rules', 'versions');
    const snap = await getDocs(query(col, orderBy('version', 'desc'), limit(30)));
    return snap.docs.map((d) => {
      const data = d.data() as Raw;
      const by = data['createdBy'] as { name?: string } | null;
      return {
        version: Number(data['version']),
        rules: rulesFromDoc(data),
        createdAt: dateOf(data['createdAt']),
        createdBy: by?.name ?? null,
        note: (data['note'] as string | null) ?? null,
        changes: Array.isArray(data['changes']) ? (data['changes'] as string[]) : [],
        affectsContracts: data['affectsContracts'] === true,
        restoredFrom: typeof data['restoredFrom'] === 'number' ? (data['restoredFrom'] as number) : null,
      };
    });
  }

  /** SKUs ativos do catálogo da Loja, com o custo médio (o mesmo da tela de Estoque). */
  async kitSkus(): Promise<KitSkuOption[]> {
    const { rows } = await this.stock.load();
    return rows.map((r) => ({
      key: `${r.productId}/${r.skuId}`,
      productId: r.productId,
      skuId: r.skuId,
      label: r.variantLabel === 'único' ? r.productName : `${r.productName} · ${r.variantLabel}`,
      costCents: r.costCents,
    }));
  }

  /** Grava a próxima versão. `version` é a lida; devolve a nova e as regras como ficaram. */
  async save(
    rules: SquadRules,
    version: number,
    restoredFrom: number | null,
  ): Promise<RulesState & { changes: string[] }> {
    const r = await httpsCallable<
      { rules: SquadRules; version: number; restoredFrom: number | null },
      { rules: SquadRules; version: number; changes: string[] }
    >(backofficeFunctions(), 'saveSquadRules')({ rules, version, restoredFrom });
    return { rules: rulesFromDoc({ rules: r.data.rules }), version: r.data.version, changes: r.data.changes };
  }
}
