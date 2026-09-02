import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { athleteFunctions } from '../../../../data/functions';
import {
  acceptPartnerInvite,
  declinePartnerInvite,
  registerSolo,
  TournamentRegistrationError,
} from '../../../../data/tournament-registrations-repository';
import { registrationClosesLabel } from '../../../../data/tournaments-repository';
import { NxPageLoadingComponent } from '../../../../shared/loading/nx-page-loading.component';
import { NxToastService } from '../../../../shared/feedback';
import { registrationTermsCopy } from '../registration-terms-copy';
import { RegistrationWizardShellComponent } from '../registration-wizard-shell.component';
import { RegistrationWizardStore } from '../registration-wizard.store';
import { bindWizardParams, wizardQueryParams } from '../wizard-params';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Passo 3 do wizard: condições da inscrição.
 *
 *  Quatro variantes, todas na MESMA tela — só muda a cópia (`registrationTermsCopy`) e o que a
 *  barra de ações oferece: dupla obrigatória, dupla com reserva solo permitida, equipe trio+, e
 *  o caso de quem RECEBEU um convite para esta categoria.
 *
 *  **Divergência deliberada em relação ao app:** lá o CTA da variante de convite abre a rota
 *  dedicada do convite, onde `acceptInvite`/`declineInvite` moram. O portal não tem essa rota —
 *  o aceite sempre viveu dentro da própria tela de inscrição — então aqui o CTA aceita de
 *  verdade e a recusa fica ao lado. O uniforme do convidado NÃO viaja no aceite: o porteiro
 *  manda para o passo do uniforme logo em seguida, que é onde ele é escolhido.
 *
 *  O aceite LGPD chegou pela URL (`?lgpd=1`) na tela anterior e SEGUE adiante daqui: viaja de
 *  novo na URL do próximo passo e é carimbado quando esta tela dispara a reserva solo ou o
 *  aceite do convite. */
@Component({
  selector: 'app-registration-terms',
  imports: [RouterLink, RegistrationWizardShellComponent, NxPageLoadingComponent],
  templateUrl: './registration-terms.component.html',
  styleUrls: ['../wizard-step.scss', './registration-terms.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationTermsComponent {
  private readonly router = inject(Router);
  private readonly toasts = inject(NxToastService);
  protected readonly store = inject(RegistrationWizardStore);
  protected readonly params = bindWizardParams(this.store);

  protected readonly processing = signal(false);

  protected readonly loading = computed(() => !this.store.tournamentLoaded());
  protected readonly tournament = computed(() => this.store.tournament());
  protected readonly category = computed(() => this.store.categoryById(this.params().categoryId));
  protected readonly receivedInvite = computed(() => this.store.receivedInviteFor(this.params().categoryId));

  protected readonly copy = computed(() => {
    const category = this.category();
    const tournament = this.tournament();
    if (!category || !tournament) return null;
    const invite = this.receivedInvite();
    return registrationTermsCopy({
      category,
      requireFormedPair: tournament.requireFormedPair,
      hasReceivedInvite: invite != null,
      inviterName: invite?.inviterName ?? null,
      isTeamInvite: invite?.isTeamInvite ?? false,
    });
  });

  protected readonly closesLabel = computed(() => {
    const at = this.tournament()?.registrationClosesAt ?? null;
    return at ? registrationClosesLabel(at) : null;
  });

  /** "Ver outras categorias" faz sentido em toda variante em que o atleta ainda não se
   *  comprometeu com uma ação específica. Só fica de fora em "convite recebido": ali a decisão
   *  é aceitar ou recusar, não trocar de categoria.
   *
   *  NÃO depende de `copy.secondaryLabel` (não-nulo só na variante de reserva solo) — prender o
   *  botão a esse gate deixava quem está em "dupla obrigatória" sem saída de um clique,
   *  justamente quem mais precisa dela por não poder reservar sozinho. */
  protected readonly showOtherCategories = computed(() => this.receivedInvite() == null);

  protected readonly isTeam = computed(() => {
    const teamSize = this.category()?.teamSize ?? null;
    return teamSize != null && teamSize > 2;
  });

  protected readonly totalLabel = computed(() => {
    const category = this.category();
    return category ? formatBRL(category.entryFee) : '—';
  });

  /** Em categoria de EQUIPE (trio+) o valor "por atleta" divide pelo elenco inteiro, não por 2
   *  — mesma regra de negócio, denominador diferente. */
  protected readonly perAthleteLabel = computed(() => {
    const category = this.category();
    if (!category) return '—';
    const splitBy = this.isTeam() ? (category.teamSize ?? 2) : 2;
    return formatBRL(category.entryFee / splitBy);
  });

  protected exit(): void {
    void this.router.navigate(['/torneios', this.params().tournamentId]);
  }

  // ── ações ────────────────────────────────────────────────────────────────

  protected primary(): void {
    if (this.processing()) return;
    const invite = this.receivedInvite();
    if (invite != null) {
      void this.acceptInvite();
      return;
    }
    const p = this.params();
    void this.router.navigate(['/torneios', p.tournamentId, 'inscricao', 'parceiro'], {
      queryParams: wizardQueryParams({ categoryId: p.categoryId, lgpdAccepted: p.lgpdAccepted }),
    });
  }

  /** Guarda a vaga sem parceiro definido — mesma callable da tela única aposentada. */
  protected async reserveSolo(): Promise<void> {
    if (this.processing()) return;
    const p = this.params();
    const category = this.category();
    if (!category) return;
    this.processing.set(true);
    try {
      const result = await registerSolo(athleteFunctions(), p.tournamentId, category.id, undefined, {
        lgpdAccepted: p.lgpdAccepted,
      });
      this.toasts.success('Vaga reservada', 'Falta formar a dupla — convide seu parceiro.');
      void this.router.navigate(['/torneios', p.tournamentId, 'inscricao'], {
        queryParams: wizardQueryParams({ categoryId: category.id, registrationId: result.registrationId }),
      });
    } catch (err) {
      this.toasts.error(
        'Não foi possível reservar a vaga',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu e nenhuma vaga foi criada.',
      );
    } finally {
      this.processing.set(false);
    }
  }

  private async acceptInvite(): Promise<void> {
    const invite = this.receivedInvite();
    const p = this.params();
    if (!invite) return;
    this.processing.set(true);
    try {
      // O uniforme do convidado não viaja aqui: o porteiro manda para o passo do uniforme logo
      // em seguida, e `setRegistrationUniform` grava lá. O aceite LGPD vai sempre `true` — esta
      // tela só é alcançável depois do passo de consentimento, ou com uma inscrição que já o
      // carimbou.
      await acceptPartnerInvite(athleteFunctions(), invite.id, undefined, { lgpdAccepted: true });
      this.store.markInviteAnswered(invite.id);
      this.toasts.success(
        invite.isTeamInvite ? 'Você entrou na equipe' : 'Dupla formada',
        invite.isTeamInvite
          ? `Bem-vindo à equipe ${invite.teamName ?? invite.inviterName}. Falta completar a inscrição.`
          : `Você e ${invite.inviterName} estão inscritos. Falta completar a inscrição.`,
      );
      // A inscrição criada pelo aceite chega pelo listener; o porteiro decide o passo dela.
      void this.router.navigate(['/torneios', p.tournamentId, 'inscricao'], {
        queryParams: wizardQueryParams({ categoryId: p.categoryId, lgpdAccepted: true }),
      });
    } catch (err) {
      this.toasts.error(
        'Não foi possível aceitar o convite',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
        { label: 'Tentar novamente', run: () => void this.acceptInvite() },
      );
    } finally {
      this.processing.set(false);
    }
  }

  protected async declineInvite(): Promise<void> {
    const invite = this.receivedInvite();
    if (!invite || this.processing()) return;
    this.processing.set(true);
    try {
      await declinePartnerInvite(athleteFunctions(), invite.id);
      this.store.markInviteAnswered(invite.id);
      this.toasts.success('Convite recusado', `${invite.inviterName} foi avisado e pode convidar outra pessoa.`);
      this.exit();
    } catch (err) {
      this.toasts.error(
        'Não foi possível recusar o convite',
        err instanceof TournamentRegistrationError ? err.message : 'O convite continua na sua lista — tente de novo.',
      );
    } finally {
      this.processing.set(false);
    }
  }
}
