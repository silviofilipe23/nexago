import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AtPanelShellComponent } from '../../../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../../../shared/loading/nx-page-loading.component';
import type { TournamentCategoryOffer } from '../../../data/tournaments-repository';
import { needsLevelConfirmation } from '../../tournament-eligibility';
import { categoryRequiresUniform } from '../../tournament-uniform';
import {
  REGISTRATION_STEP_PATHS,
  registrationStepFromParam,
  resolveRegistrationStep,
  type RegistrationWizardStep,
} from './registration-wizard-step';
import { RegistrationWizardStore } from './registration-wizard.store';
import { bindWizardParams, wizardQueryParams } from './wizard-params';

/** Carência antes de declarar morto o `registro` que a rota afirma.
 *
 *  `watchMyRegistrations` entrega o CACHE antes da resposta do servidor: uma inscrição criada
 *  no instante anterior (aceite de convite) ainda não está nele. Sem a carência, o caminho mais
 *  comum piscaria "Inscrição não encontrada" antes de seguir. */
const DEAD_REGISTRATION_GRACE_MS = 3000;

/** Redirecionador de `/torneios/:id/inscricao`.
 *
 *  Não tem UI própria além do loader: lê torneio, inscrições e convites, chama
 *  `resolveRegistrationStep` e substitui a si mesmo pela rota da etapa.
 *
 *  Espera as leituras RESOLVEREM antes de decidir. Decidir no primeiro build, com as inscrições
 *  ainda vazias, fazia "retomar o que já começou" perder para "primeira categoria livre" — o
 *  beco sem saída da vaga solo pendente.
 *
 *  Os query params de hoje (`categoria`, `registro`, `convite`, `step`) continuam valendo, e as
 *  grafias do app (`categoryId`, `registrationId`, `inviteId`) também: por isso nenhum dos ~8
 *  pontos de entrada do portal precisou ser tocado. */
@Component({
  selector: 'app-registration-gate',
  imports: [AtPanelShellComponent, NxPageLoadingComponent],
  template: `
    <app-at-panel-shell [userName]="store.accountLabel()">
      <div class="gate">
        @if (failure()) {
          <div class="gate-msg">
            <h1>{{ failure()!.title }}</h1>
            <p>{{ failure()!.body }}</p>
            <button type="button" class="gate-btn" (click)="failure()!.action()">{{ failure()!.actionLabel }}</button>
          </div>
        } @else {
          <app-nx-page-loading title="Abrindo sua inscrição…" subtitle="Buscando categorias, convites e vagas" />
        }
      </div>
    </app-at-panel-shell>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .gate {
        flex: 1;
        padding: 22px 24px 40px;
        overflow: auto;
      }
      .gate-msg {
        width: min(520px, 100%);
        margin: 40px auto 0;
        text-align: center;
      }
      .gate-msg h1 {
        font-family: var(--nx-font-display);
        font-weight: 800;
        font-size: 20px;
        color: var(--nx-text);
        margin: 0 0 10px;
      }
      .gate-msg p {
        font-family: var(--nx-font-ui);
        font-size: 14px;
        line-height: 1.5;
        color: var(--nx-text-mute);
        margin: 0 0 18px;
      }
      .gate-btn {
        min-height: 44px;
        padding: 0 20px;
        border: 0;
        border-radius: var(--nx-r-3);
        background: var(--nx-orange-500);
        color: var(--nx-text-on-orange);
        font-family: var(--nx-font-display);
        font-weight: 800;
        font-size: 14px;
        cursor: pointer;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationGateComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(RegistrationWizardStore);

  private readonly params = bindWizardParams(this.store);

  /** Uma decisão só por entrada. Sem esta guarda, cada snapshot novo do Firestore reempurraria
   *  a rota por cima da tela que o atleta está usando. */
  private navigated = false;

  /** Ligado quando a carência do id afirmado pela rota vence sem o doc aparecer. */
  private readonly registrationLooksDead = signal(false);
  private deadTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly failure = computed<{ title: string; body: string; actionLabel: string; action: () => void } | null>(
    () => {
      if (this.store.loadFailed()) {
        return {
          title: 'Não foi possível abrir a inscrição',
          body: 'Verifique sua conexão e tente de novo. Se continuar, volte e entre pelo torneio.',
          actionLabel: 'Tentar novamente',
          action: () => this.store.retry(),
        };
      }
      if (this.store.ready() && this.store.tournament() == null) {
        return {
          title: 'Torneio não encontrado',
          body: 'Ele pode ter sido removido ou o link está desatualizado.',
          actionLabel: 'Voltar',
          action: () => this.leave(),
        };
      }
      if (this.registrationLooksDead()) {
        return {
          title: 'Inscrição não encontrada',
          body: 'Ela pode ter sido cancelada, ou o link está desatualizado. Volte e entre pelo torneio para recomeçar.',
          actionLabel: 'Voltar',
          action: () => this.leave(),
        };
      }
      return null;
    },
  );

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.deadTimer));
    effect(() => this.decide());
  }

  private leave(): void {
    void this.router.navigate(['/torneios', this.params().tournamentId]);
  }

  private decide(): void {
    if (this.navigated) return;
    // Enquanto QUALQUER leitura não resolveu, o porteiro espera. Chutar aqui é o bug antigo:
    // sem as inscrições, "retomar" perde para "começar"; sem os convites enviados, quem já
    // convidou refaz o consentimento.
    if (!this.store.ready()) return;
    const tournament = this.store.tournament();
    if (tournament == null) return;

    const p = this.params();
    const categoryId = this.resolveCategoryId();
    if (categoryId == null) {
      // A tela 1 mostra UMA categoria vinda da rota — ela não é um seletor. Sem categoria
      // resolvida, o lugar de escolher é a lista do torneio.
      this.navigated = true;
      void this.router.navigate(['/torneios', p.tournamentId, 'categorias'], { replaceUrl: true });
      return;
    }

    const category = this.store.categoryById(categoryId)!;
    const mapped = this.store.registrationFor(categoryId);

    // A ROTA é autoridade sobre "existe inscrição": o listener entrega o cache primeiro e a
    // inscrição recém-criada pode não estar nele, com o atleta caindo no consentimento.
    const routeRegId = p.registrationId;
    const routeRegIsFromAnotherCategory =
      routeRegId.length > 0 &&
      this.store.myRegistrations().some((r) => r.categoryId !== categoryId && r.id === routeRegId);
    const assertedByRoute = routeRegId.length > 0 && mapped == null && !routeRegIsFromAnotherCategory;

    if (assertedByRoute) {
      // A rota AFIRMOU uma inscrição que o listener não conhece: link antigo, push de uma
      // inscrição cancelada, id de outra conta — ou, o caso comum, um doc que ainda não chegou
      // do servidor. A carência separa os dois; sem ela o aceite de convite piscaria o erro.
      if (!this.registrationLooksDead()) {
        this.armDeadTimer();
        return;
      }
      return; // `failure()` já mostra a saída.
    }
    clearTimeout(this.deadTimer);

    const registration = mapped;
    const step = resolveRegistrationStep({
      categoryResolved: true,
      hasReceivedInvite: this.store.receivedInviteFor(categoryId) != null,
      hasSentInvitePending: this.store.pendingSentInvitesFor(categoryId).length > 0,
      hasRegistration: registration != null,
      // Inscrição existente já teve o aceite carimbado pela callable.
      lgpdAccepted: p.lgpdAccepted || registration != null,
      partnerPending: registration?.partnerPending ?? false,
      uniformRequired: categoryRequiresUniform(category),
      uniformComplete: this.store.uniformCompleteFor(category, registration),
      isPaid: registration?.isPaid ?? false,
      // A folha de nível abre na saída da TELA 1, e as entradas que já trazem `categoria`
      // nunca passam por lá.
      levelConfirmationPending: needsLevelConfirmation(this.store.profile(), tournament.sport),
      requestedStep: p.requestedStep?.step ?? null,
      requestedStepWaitingOnly: p.requestedStep?.waitingOnly ?? false,
    });

    this.navigated = true;
    void this.router.navigate(this.commandsFor(step), {
      queryParams: wizardQueryParams({
        categoryId,
        registrationId: registration?.id ?? null,
        inviteId: p.inviteId || null,
        lgpdAccepted: p.lgpdAccepted,
      }),
      replaceUrl: true,
    });
  }

  private commandsFor(step: RegistrationWizardStep): unknown[] {
    const tournamentId = this.params().tournamentId;
    // Inscrição pronta não tem tela própria no portal: a aba "minha inscrição" do torneio já
    // mostra elenco, pagamento e compartilhamento. Ela é o `sucesso` do app aqui.
    if (step === 'sucesso') return ['/torneios', tournamentId, 'minha-inscricao'];
    return ['/torneios', tournamentId, 'inscricao', REGISTRATION_STEP_PATHS[step]];
  }

  private armDeadTimer(): void {
    if (this.deadTimer != null) return;
    this.deadTimer = setTimeout(() => this.registrationLooksDead.set(true), DEAD_REGISTRATION_GRACE_MS);
  }

  /** Categoria a considerar, em ordem de prioridade: a da rota; a da inscrição indicada; a de
   *  um convite recebido; a de um convite que EU enviei; a única categoria do torneio.
   *  `null` = não dá para resolver, e o destino é a LISTA de categorias. */
  private resolveCategoryId(): string | null {
    const p = this.params();
    const offers: TournamentCategoryOffer[] = this.store.categories();

    if (p.categoryId.length > 0 && offers.some((c) => c.id === p.categoryId)) return p.categoryId;

    if (p.registrationId.length > 0) {
      const byId = this.store.registrationById(p.registrationId);
      if (byId != null && offers.some((c) => c.id === byId.categoryId)) return byId.categoryId;
    }

    const tournamentId = p.tournamentId;
    for (const invite of this.store.receivedInvites()) {
      if (invite.tournamentId !== tournamentId) continue;
      if (p.inviteId.length > 0 && invite.id !== p.inviteId) continue;
      if (!offers.some((c) => c.id === invite.categoryId)) continue;
      return invite.categoryId;
    }
    for (const invite of this.store.sentInvites()) {
      if (invite.status !== 'pending') continue;
      if (invite.tournamentId !== tournamentId) continue;
      if (p.inviteId.length > 0 && invite.id !== p.inviteId) continue;
      if (!offers.some((c) => c.id === invite.categoryId)) continue;
      return invite.categoryId;
    }

    return offers.length === 1 ? (offers[0]?.id ?? null) : null;
  }
}

export { registrationStepFromParam };
