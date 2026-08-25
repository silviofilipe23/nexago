import { Injectable, inject } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { athleteFunctions } from '../../data/functions';
import { fetchMyAthleteProfile } from '../../data/my-athlete-profile-repository';
import { acceptPartnerInvite, declinePartnerInvite } from '../../data/tournament-registrations-repository';
import { fetchTournament } from '../../data/tournaments-repository';
import {
  resolveLevelConfirmationPromptForTournament,
  type LevelConfirmationPrompt,
} from '../../tournaments/tournament-eligibility';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** Aceitar/recusar convite pelo anúncio automático, e a confirmação de nível antes do
 *  aceite (Task 7) — TUDO que o anunciador faz que tocaria rede de verdade.
 *
 *  Existe pra dar uma costura injetável em cima das callables/Firestore — o anunciador abre
 *  sozinho ao entrar no portal, e o que ele faz depois de "Aceitar"/"Recusar" (marcar
 *  respondido, lembrar da sessão, navegar) é justamente o que precisa de teste sem rede.
 *
 *  Aceite aqui é sempre sem uniforme: o backend permite e coleta depois, na tela de
 *  inscrição — mesmo comportamento do aceite rápido do painel. */
@Injectable({ providedIn: 'root' })
export class PartnerInviteResponder {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  accept(inviteId: string): Promise<void> {
    return acceptPartnerInvite(athleteFunctions(), inviteId, undefined, { lgpdAccepted: true });
  }

  decline(inviteId: string): Promise<void> {
    return declinePartnerInvite(athleteFunctions(), inviteId);
  }

  /** Mesmo gate/copy da tela de inscrição (`tournament-registration-shell.component.ts`) —
   *  aceitar um convite pelo anúncio automático também é um caminho pra 1ª inscrição ativa
   *  do atleta no esporte (trigger de backend, `tournament-level-lock.ts`). Recebe o
   *  `tournamentId` (não um `sport` já resolvido) e busca o torneio FRESCO — nunca o cache de
   *  `PartnerInvitesService.pending()`, que documentadamente pode trazer `tournament: null`
   *  enquanto o fetch paralelo do torneio ainda não voltou (fix pós-review I1: ler esse cache
   *  tratava "ainda não sei o esporte" como "sem esporte mapeado" e pulava a confirmação em
   *  silêncio). Sem sessão, sem Firestore, ou falha em QUALQUER um dos dois fetches é falha de
   *  resolução: rejeita, quem chama bloqueia. */
  resolveLevelPrompt(tournamentId: string): Promise<LevelConfirmationPrompt | null> {
    const db = this.firestore;
    const uid = this.auth.user()?.uid;
    if (!db || !uid) return Promise.reject(new Error('Sem sessão ou conexão com o Firestore.'));
    return resolveLevelConfirmationPromptForTournament(fetchMyAthleteProfile(db, uid), fetchTournament(db, tournamentId));
  }
}
