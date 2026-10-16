import { Injectable } from '@angular/core';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../data/firebase';
import { pontosFrom, remessasFrom, shippingFromDoc } from './retirada-docs';
import type { ConfigFrete, ModalidadeId, PontoInput, RetiradaData } from './retirada.model';

type Raw = Record<string, any>;

/**
 * Leitura direto do Firestore (arenas, pontos, config de frete e remessas); escrita só
 * pelas callables de `functions/src/store-pickup.ts` — as rules negam escrita de cliente.
 */
@Injectable({ providedIn: 'root' })
export class RetiradaRepository {
  async load(now = new Date()): Promise<RetiradaData> {
    const db = backofficeDb();
    const [arenaSnap, pointSnap, shippingSnap, locSnap, transferSnap] = await Promise.all([
      getDocs(query(collection(db, 'arenas'), orderBy('name'))),
      getDocs(collection(db, 'storePickupPoints')),
      getDoc(doc(db, 'storeConfig', 'shipping')),
      getDocs(collection(db, 'storeLocations')),
      // Sem `where('status')`: com o orderBy exigiria índice composto. Filtra na tela.
      getDocs(query(collection(db, 'storeTransfers'), orderBy('createdAt', 'desc'), limit(20))),
    ]);

    const locations = new Map(locSnap.docs.map((d) => [d.id, ((d.data() as Raw)['name'] as string) ?? d.id]));
    const toRows = (snap: typeof pointSnap) => snap.docs.map((d) => ({ id: d.id, data: d.data() as Raw }));
    return {
      pontos: pontosFrom(toRows(arenaSnap), toRows(pointSnap)),
      remessas: remessasFrom(toRows(transferSnap), (id) => locations.get(id) ?? id, now),
      ...shippingFromDoc(shippingSnap.exists() ? (shippingSnap.data() as Raw) : undefined),
    };
  }

  async savePoint(input: PontoInput): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'saveStorePickupPoint')({
      arenaId: input.arenaId,
      counter: input.balcao,
      hours: input.horario,
      managerName: input.responsavel,
      restockHours: input.prazoAbastecimentoH,
      commissionPct: input.comissaoPct,
      active: input.ativo,
    });
  }

  async setPointActive(arenaId: string, active: boolean): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'setStorePickupPointActive')({ arenaId, active });
  }

  async setModeActive(modeId: ModalidadeId, active: boolean): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'setStoreShippingModeActive')({ modeId, active });
  }

  async saveRules(config: Omit<ConfigFrete, 'comissaoPadraoPct'>): Promise<void> {
    await httpsCallable(backofficeFunctions(), 'saveStoreShippingRules')({
      freeShippingAboveCents: config.freteGratisAcimaCents,
      pickupDeadlineDays: config.prazoRetiradaDias,
      originZip: config.cepOrigem,
      handlingHours: config.prazoSeparacaoH,
      cancelExpiredPickup: config.cancelarRetiradaVencida,
      refundAsWalletCredit: config.reembolsoEmSaldo,
    });
  }
}
