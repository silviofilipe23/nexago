import { Injectable } from '@angular/core';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { searchAthletes, type AthleteSearchResult } from '../clubinho/clubs-repository';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { callableErrorMessage } from '../profissionais/arena-professor.model';
import {
  athletePricingMemberFromDoc,
  sortMembersByName,
  type AthletePricingMember,
  type AthletePricingTier,
} from './athlete-pricing.model';

const FALLBACK_ERROR = 'Não foi possível salvar. Tente novamente.';

async function call(name: string, input: Record<string, unknown>): Promise<void> {
  try {
    await httpsCallable(arenaFunctions(), name)(input);
  } catch (err) {
    throw new Error(callableErrorMessage(err, FALLBACK_ERROR));
  }
}

/** Dados e ações da tela Preço por perfil. Leitura direta (rule: área `promocoes`); escrita só
 *  pelas callables (`functions/src/arena-athlete-pricing.ts`). */
@Injectable({ providedIn: 'root' })
export class AthletePricingService {
  watchMembers(
    arenaId: string,
    onChange: (members: AthletePricingMember[]) => void,
    onError: (message: string) => void,
  ): () => void {
    return onSnapshot(
      query(collection(arenaFirestore(), 'arenaAthletePricingMembers'), where('arenaId', '==', arenaId)),
      (snap) =>
        onChange(
          sortMembersByName(snap.docs.map(athletePricingMemberFromDoc).filter((m): m is AthletePricingMember => m != null)),
        ),
      () => onError('Não foi possível carregar a lista de atletas. Recarregue a página.'),
    );
  }

  searchAccounts(term: string): Promise<AthleteSearchResult[]> {
    return searchAthletes(arenaFirestore(), term);
  }

  saveConfig(payload: Record<string, unknown>): Promise<void> {
    return call('setArenaAthletePricing', payload);
  }

  setMember(arenaId: string, athleteId: string, tier: AthletePricingTier | null, note: string | null = null): Promise<void> {
    return call('setArenaAthletePricingMember', { arenaId, athleteId, tier, note });
  }
}
