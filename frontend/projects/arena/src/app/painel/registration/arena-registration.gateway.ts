import { Injectable } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import type { ArenaAddressParts, ArenaCompanyRegistration } from './arena-registration.model';
import {
  fetchArenaCompany,
  saveArenaAddress,
  saveArenaCompany,
  type ArenaCoords,
} from './arena-registration-repository';
import { fetchAddressByCep, type ViaCepAddress } from './via-cep';

/** Porta única de rede da tela de dados cadastrais — Firestore, ViaCEP e a callable de
 *  geocoding atrás de um só serviço, para a tela ser testável sem tocar em nenhum deles.
 *  Mantenha fino: o que houver aqui não é coberto pela spec da tela. */
@Injectable({ providedIn: 'root' })
export class ArenaRegistrationGateway {
  loadCompany(arenaId: string): Promise<ArenaCompanyRegistration> {
    return fetchArenaCompany(arenaFirestore(), arenaId);
  }

  saveCompany(arenaId: string, company: ArenaCompanyRegistration): Promise<void> {
    return saveArenaCompany(arenaFirestore(), arenaId, company);
  }

  saveAddress(
    arenaId: string,
    parts: ArenaAddressParts,
    city: string,
    state: string,
    coords: ArenaCoords | null,
  ): Promise<void> {
    return saveArenaAddress(arenaFirestore(), arenaId, parts, city, state, coords);
  }

  lookupCep(cep: string): Promise<ViaCepAddress | null> {
    return fetchAddressByCep(cep);
  }

  async geocode(input: ArenaAddressParts & { city: string; state: string }): Promise<ArenaCoords | null> {
    const call = httpsCallable<Record<string, unknown>, { coords: ArenaCoords | null }>(
      arenaFunctions(),
      'geocodeAddress',
    );
    const result = await call({
      cep: input.cep,
      logradouro: input.logradouro,
      numero: input.numero,
      bairro: input.bairro,
      city: input.city,
      state: input.state,
    });
    return result.data.coords ?? null;
  }
}
