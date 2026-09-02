import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { NxPageLoadingComponent } from '../../../../shared/loading/nx-page-loading.component';
import { NxBlockingDialogComponent, NxToastService } from '../../../../shared/feedback';
import { categoryFormatLabel, categoryUnitSingular, registrationClosesLabel } from '../../../../data/tournaments-repository';
import { resolveLevelConfirmationPrompt, type LevelConfirmationPrompt } from '../../../tournament-eligibility';
import { categoryLevelRangeLabel, registrationCategoryStatus } from '../registration-category-status';
import { RegistrationWizardShellComponent } from '../registration-wizard-shell.component';
import { RegistrationWizardStore } from '../registration-wizard.store';
import { bindWizardParams, wizardQueryParams } from '../wizard-params';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Passo 1 do wizard: o detalhe da categoria.
 *
 *  A categoria vem da ROTA, não de um seletor: a escolha acontece na lista do torneio, antes de
 *  entrar no fluxo. "Ver outras categorias" volta para lá.
 *
 *  A confirmação de nível (anti-sandbagging) abre na SAÍDA desta tela: é uma pergunta sobre
 *  caber na categoria, então vem junto da categoria. */
@Component({
  selector: 'app-registration-category',
  imports: [RouterLink, RegistrationWizardShellComponent, NxPageLoadingComponent, NxBlockingDialogComponent],
  templateUrl: './registration-category.component.html',
  styleUrls: ['../wizard-step.scss', './registration-category.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationCategoryComponent {
  private readonly router = inject(Router);
  private readonly toasts = inject(NxToastService);
  protected readonly store = inject(RegistrationWizardStore);
  protected readonly params = bindWizardParams(this.store);

  protected readonly advancing = signal(false);
  protected readonly levelPrompt = signal<LevelConfirmationPrompt | null>(null);
  private levelResolve: ((confirmed: boolean) => void) | null = null;

  protected readonly loading = computed(() => !this.store.tournamentLoaded());
  protected readonly tournament = computed(() => this.store.tournament());
  protected readonly category = computed(() => this.store.categoryById(this.params().categoryId));
  protected readonly registration = computed(() => this.store.registrationFor(this.params().categoryId));

  protected readonly closesLabel = computed(() => {
    const at = this.tournament()?.registrationClosesAt ?? null;
    return at ? registrationClosesLabel(at) : null;
  });

  protected readonly spotsLeft = computed(() => {
    const category = this.category();
    return category ? this.store.spotsLeftFor(category) : null;
  });

  /** `null` de vagas = capacidade desconhecida (categoria sem teto ou contagem não resolvida):
   *  mostra travessão em vez de inventar um número. */
  protected readonly spotsLabel = computed(() => {
    const category = this.category();
    const left = this.spotsLeft();
    if (category == null || left == null || category.maxTeams <= 0) return '—';
    return `${left} de ${category.maxTeams}`;
  });

  protected readonly status = computed(() => {
    const category = this.category();
    const tournament = this.tournament();
    if (!category || !tournament) return null;
    return registrationCategoryStatus({
      category,
      alreadyRegistered: this.registration() != null,
      spotsLeft: this.spotsLeft(),
      profile: this.store.profile(),
      tournamentSport: tournament.sport,
      tournamentStart: tournament.startAt,
      registrationOpensAt: tournament.registrationOpensAt,
      // A linha "Inscrições até …" abaixo só INFORMA o prazo; quem o APLICA é o status — sem
      // ele o CTA seguia "Inscrever-se" depois do prazo e a recusa só vinha da callable, três
      // telas adiante.
      registrationClosesAt: tournament.registrationClosesAt,
    });
  });

  protected readonly levelLabel = computed(() => {
    const category = this.category();
    return category ? categoryLevelRangeLabel(category) : '—';
  });

  protected readonly priceLabel = computed(() => {
    const category = this.category();
    return category ? formatBRL(category.entryFee) : '—';
  });

  protected readonly unitSingular = computed(() => {
    const category = this.category();
    return category ? categoryUnitSingular(category) : 'dupla';
  });

  protected readonly formatLabel = computed(() => {
    const category = this.category();
    return category ? categoryFormatLabel(category) : '—';
  });

  /** Categoria de dupla num torneio que exige dupla já formada: não há reserva solo, e o
   *  atleta precisa saber disso ANTES de percorrer o fluxo. */
  protected readonly pairRequired = computed(() => {
    const category = this.category();
    return (this.tournament()?.requireFormedPair ?? false) && category != null && category.teamSize == null;
  });

  protected readonly canAdvance = computed(() => this.registration() != null || this.status()?.blocked === false);

  protected readonly ctaLabel = computed(() => (this.registration() != null ? 'Continuar inscrição' : 'Inscrever-se'));

  protected exit(): void {
    void this.router.navigate(['/torneios', this.params().tournamentId]);
  }

  /** Já inscrito: o CTA retoma pelo porteiro em vez de tentar inscrever de novo. */
  protected async confirm(): Promise<void> {
    if (this.advancing()) return;
    const p = this.params();
    const registration = this.registration();
    if (registration != null) {
      void this.router.navigate(['/torneios', p.tournamentId, 'inscricao'], {
        queryParams: wizardQueryParams({ categoryId: p.categoryId, registrationId: registration.id }),
      });
      return;
    }

    this.advancing.set(true);
    try {
      if (!(await this.ensureLevelConfirmed())) return;
      void this.router.navigate(['/torneios', p.tournamentId, 'inscricao', 'consentimento'], {
        queryParams: wizardQueryParams({ categoryId: p.categoryId }),
      });
    } finally {
      this.advancing.set(false);
    }
  }

  /** Último checkpoint antes de o fluxo criar qualquer inscrição.
   *
   *  `true` → segue. `false` → NÃO avança; ou a busca do perfil falhou (bloqueia, não decide no
   *  escuro) ou o atleta escolheu "Ajustar nível" (o dialog já disparou a navegação). */
  private async ensureLevelConfirmed(): Promise<boolean> {
    // Uma confirmação já pendente não pode ser sobrescrita — um segundo clique antes de o
    // dialog renderizar perderia o resolver da primeira chamada, que nunca mais resolveria.
    if (this.levelResolve) return false;
    let prompt: LevelConfirmationPrompt | null;
    try {
      prompt = await resolveLevelConfirmationPrompt(this.store.fetchLevelGateProfile(), this.tournament()?.sport ?? null);
    } catch {
      this.toasts.error(
        'Não foi possível confirmar seu nível',
        'Não conseguimos verificar seu nível agora. Tente novamente em instantes.',
      );
      return false;
    }
    if (!prompt) return true;
    this.levelPrompt.set(prompt);
    return new Promise<boolean>((resolve) => {
      this.levelResolve = resolve;
    });
  }

  protected confirmLevel(): void {
    this.levelPrompt.set(null);
    this.levelResolve?.(true);
    this.levelResolve = null;
  }

  /** "Ajustar nível": nada é submetido — o dialog fecha e leva pra tela onde o nível se edita. */
  protected adjustLevel(): void {
    this.levelPrompt.set(null);
    this.levelResolve?.(false);
    this.levelResolve = null;
    void this.router.navigate(['/perfil/esportes']);
  }
}
