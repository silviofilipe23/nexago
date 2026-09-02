import { computed, effect, inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap } from '@angular/router';

import { registrationStepFromParam, type RegistrationStepRequest } from './registration-wizard-step';
import type { RegistrationWizardStore } from './registration-wizard.store';

/** Parâmetros que atravessam o wizard.
 *
 *  Duas grafias por campo, de propósito: o portal sempre usou `categoria`/`registro`, e os
 *  links do app usam `categoryId`/`registrationId`. Um atleta que recebe um push no celular e
 *  abre o link no navegador cai aqui — aceitar só uma das grafias transformaria esse link numa
 *  volta ao começo do fluxo. Ao ESCREVER, sempre a grafia do portal. */
export interface WizardParams {
  readonly tournamentId: string;
  readonly categoryId: string;
  readonly registrationId: string;
  readonly inviteId: string;
  /** O aceite do termo viaja na URL até a callable carimbá-lo: antes de a inscrição existir,
   *  ele só existe como parâmetro de rota. Perdê-lo faz a CF gravar a inscrição SEM o
   *  consentimento — em silêncio, sem erro e sem log. */
  readonly lgpdAccepted: boolean;
  readonly requestedStep: RegistrationStepRequest | null;
}

function firstOf(query: ParamMap, ...keys: string[]): string {
  for (const key of keys) {
    const value = query.get(key)?.trim();
    if (value) return value;
  }
  return '';
}

export function wizardParamsOf(tournamentId: string, query: ParamMap): WizardParams {
  const lgpd = firstOf(query, 'lgpd').toLowerCase();
  return {
    tournamentId,
    categoryId: firstOf(query, 'categoria', 'categoryId'),
    registrationId: firstOf(query, 'registro', 'registrationId'),
    inviteId: firstOf(query, 'convite', 'inviteId'),
    lgpdAccepted: lgpd === '1' || lgpd === 'true',
    requestedStep: registrationStepFromParam(firstOf(query, 'step')),
  };
}

/** Parâmetros REATIVOS — chamar em contexto de injeção.
 *
 *  Não é `route.snapshot`: o Angular REUSA a instância do componente quando só os query params
 *  mudam, e o wizard faz exatamente isso (a espera volta ao passo do parceiro com outros
 *  parâmetros, na mesma rota). Com o snapshot congelado no construtor, a tela reaberta pelo
 *  próprio fluxo continuaria mostrando o convite antigo. */
export function wizardParamsSignal(): Signal<WizardParams> {
  const route = inject(ActivatedRoute);
  const query = toSignal(route.queryParamMap, { initialValue: route.snapshot.queryParamMap });
  return computed(() => wizardParamsOf(route.snapshot.paramMap.get('id')?.trim() ?? '', query()));
}

/** Query params para navegar entre passos — sempre na grafia do portal, e sem chaves vazias
 *  (uma `registro=` vazia na URL vira um id afirmado inexistente no porteiro). */
export function wizardQueryParams(input: {
  categoryId: string | null;
  registrationId?: string | null;
  inviteId?: string | null;
  lgpdAccepted?: boolean;
}): Record<string, string> {
  const params: Record<string, string> = {};
  const categoryId = (input.categoryId ?? '').trim();
  const registrationId = (input.registrationId ?? '').trim();
  const inviteId = (input.inviteId ?? '').trim();
  if (categoryId) params['categoria'] = categoryId;
  if (registrationId) params['registro'] = registrationId;
  if (inviteId) params['convite'] = inviteId;
  if (input.lgpdAccepted) params['lgpd'] = '1';
  return params;
}

/** Parâmetros reativos + o id do torneio já entregue ao store. Chamar em contexto de injeção.
 *
 *  TODA tela do wizard usa esta, e não `wizardParamsSignal` sozinha: o store é provido na rota
 *  MÃE, que é componentless e portanto não roda código nenhum. Se só o porteiro alimentasse o
 *  `tournamentId`, qualquer entrada direta num passo — recarregar a página, um link colado, o
 *  botão voltar do navegador — encontraria o store com o id vazio e a tela diria "Torneio não
 *  encontrado" sobre um torneio que existe. */
export function bindWizardParams(store: RegistrationWizardStore): Signal<WizardParams> {
  const params = wizardParamsSignal();
  effect(() => {
    const id = params().tournamentId;
    if (id) store.tournamentId.set(id);
  });
  return params;
}
