import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { athleteFunctions } from '../../../../data/functions';
import {
  setRegistrationUniform,
  TournamentRegistrationError,
  type AthleteTournamentRegistration,
} from '../../../../data/tournament-registrations-repository';
import { registrationClosesLabel, type TournamentCategoryOffer } from '../../../../data/tournaments-repository';
import { uniformSlotForUid } from '../../../../painel/registration-progress';
import { NxPageLoadingComponent } from '../../../../shared/loading/nx-page-loading.component';
import { NxInlineMessageComponent, NxToastService } from '../../../../shared/feedback';
import {
  categoryRequiresUniform,
  defaultJerseyNameForAthlete,
  defaultUniformSelectionForCategory,
  isUniformSelectionComplete,
  toUniformInput,
  validateUniformSelection,
  type UniformSelection,
} from '../../../tournament-uniform';
import { UniformAutoSaver, type UniformAutoSaveState } from '../../uniform-autosave';
import { UniformFormComponent } from '../../uniform-form.component';
import { RegistrationWizardShellComponent } from '../registration-wizard-shell.component';
import { RegistrationWizardStore } from '../registration-wizard.store';
import { bindWizardParams, wizardQueryParams } from '../wizard-params';

function firstNameOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Parceiro';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Passo 6 do wizard: uniforme.
 *
 *  Casca em volta do `UniformFormComponent` e do `UniformAutoSaver`, que JÁ existem — não
 *  reescritos aqui. O bloco de estado resolve dois problemas que não são óbvios lendo o código
 *  isolado:
 *
 *  - **Hidratar uma vez por inscrição.** Depois da primeira hidratação, a tela manda o que o
 *    atleta está editando — senão cada snapshot novo do Firestore desfaria a escolha em
 *    andamento no meio da digitação. Foi assim que o portal já abriu em M/10 para quem escolheu
 *    GG, apagando a escolha real na primeira mexida.
 *  - **Meia escolha não vira gravação.** Enquanto a seleção está incompleta o autosave é
 *    cancelado e o selo volta para "Pendente" em vez de virar erro.
 *
 *  Diferença para a tela única aposentada: aqui a inscrição é sempre conhecida — o wizard só
 *  chega neste passo depois de ela existir. */
@Component({
  selector: 'app-registration-uniform',
  imports: [
    RouterLink,
    RegistrationWizardShellComponent,
    NxPageLoadingComponent,
    NxInlineMessageComponent,
    UniformFormComponent,
  ],
  templateUrl: './registration-uniform.component.html',
  styleUrls: ['../wizard-step.scss', './registration-uniform.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationUniformComponent {
  private readonly router = inject(Router);
  private readonly toasts = inject(NxToastService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(RegistrationWizardStore);
  protected readonly params = bindWizardParams(this.store);

  protected readonly uniform = signal<UniformSelection | null>(null);
  protected readonly saveState = signal<UniformAutoSaveState>('idle');
  protected readonly confirming = signal(false);

  /** Categoria cujos padrões já foram aplicados, e inscrição cujo uniforme gravado já veio para
   *  a tela. Uma vez cada — ver a doc da classe. */
  private defaultsCategoryId: string | null = null;
  private hydratedRegistrationId: string | null = null;

  private readonly saver = new UniformAutoSaver({
    save: (value) => this.writeUniform(value),
    onStateChange: (state) => this.saveState.set(state),
  });

  protected readonly loading = computed(() => !this.store.tournamentLoaded());
  protected readonly tournament = computed(() => this.store.tournament());
  protected readonly category = computed(() => this.store.categoryById(this.params().categoryId));
  protected readonly registration = computed(
    () =>
      this.store.registrationById(this.params().registrationId) ??
      this.store.registrationFor(this.params().categoryId),
  );

  protected readonly saving = computed(() => this.saveState() === 'saving');
  protected readonly saved = computed(() => this.saveState() === 'saved');
  protected readonly saveFailed = computed(() => this.saveState() === 'failed');

  protected readonly closesLabel = computed(() => {
    const at = this.tournament()?.registrationClosesAt ?? null;
    return at ? registrationClosesLabel(at) : null;
  });

  protected readonly canContinue = computed(() => {
    const category = this.category();
    const selection = this.uniform();
    if (!category || !selection) return false;
    return validateUniformSelection(category, selection) == null;
  });

  /** Status do uniforme dos DEMAIS participantes — não há edição aqui, só o que falta para os
   *  outros fecharem a escolha deles. `null` quando ainda não há mais ninguém na inscrição. */
  protected readonly partnerRow = computed(() => {
    const reg = this.registration();
    const category = this.category();
    const myUid = this.store.myUid();
    if (!reg || !category) return null;
    const others = reg.participantUids.filter((uid) => uid !== myUid);
    if (others.length === 0) return null;
    const complete = others.every((uid) => isUniformSelectionComplete(category, uniformSlotForUid(reg, uid)));
    if (category.teamSize != null && category.teamSize > 2) {
      return {
        title: 'Uniforme do restante do elenco',
        subtitle: complete ? 'Todo o elenco já escolheu' : 'Falta alguém do elenco completar',
        complete,
      };
    }
    return {
      title: 'Uniforme do parceiro',
      subtitle: complete ? 'Tamanho e número já definidos' : 'Ele preenche os dados dele ao aceitar o convite',
      complete,
    };
  });

  protected readonly firstNameOf = firstNameOf;

  /** Uma saída só — cada snapshot repetiria o `navigate` por cima da rota aberta. */
  private leaving = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.saver.dispose());

    // Sem inscrição não há onde gravar o uniforme, e o autosave só entregaria "Sua inscrição
    // ainda não foi criada" a cada mexida. Acontece com link velho, botão voltar depois de um
    // cancelamento, ou `?registro=` de uma inscrição que sumiu — o porteiro sabe para onde ir,
    // esta tela não. Mesma guarda que a rota do app faz no builder.
    effect(() => {
      if (this.leaving) return;
      const category = this.category();
      const ready = this.store.tournamentLoaded() && this.store.registrationsLoaded();
      if (!ready || !category) return;
      if (this.registration() != null && categoryRequiresUniform(category)) return;
      this.leaving = true;
      const p = this.params();
      void this.router.navigate(['/torneios', p.tournamentId, 'inscricao'], {
        queryParams: wizardQueryParams({
          categoryId: p.categoryId,
          registrationId: p.registrationId,
          lgpdAccepted: p.lgpdAccepted,
        }),
        replaceUrl: true,
      });
    });

    // Padrões da categoria; quando o perfil chega depois, só preenche o nome na camisa se o
    // campo continua vazio.
    effect(() => {
      const category = this.category();
      const profile = this.store.profile();
      if (!category || !categoryRequiresUniform(category)) {
        this.defaultsCategoryId = null;
        this.uniform.set(null);
        this.saver.reset();
        return;
      }
      const fullName = profile?.fullName ?? this.store.accountLabel();
      const nickname = profile?.nickname ?? null;
      if (this.defaultsCategoryId !== category.id) {
        this.defaultsCategoryId = category.id;
        this.hydratedRegistrationId = null;
        this.saver.reset();
        this.uniform.set(defaultUniformSelectionForCategory(category, fullName, nickname));
        return;
      }
      const current = untracked(this.uniform);
      if (current && category.uniformNameOnShirt && !current.jerseyName?.trim()) {
        const name = defaultJerseyNameForAthlete(fullName, nickname);
        if (name) this.uniform.set({ ...current, jerseyName: name });
      }
    });

    // O que JÁ está gravado na inscrição manda na tela.
    effect(() => {
      const category = this.category();
      const reg = this.registration();
      const uid = this.store.myUid();
      if (!category || !categoryRequiresUniform(category) || !reg || !uid) return;
      if (this.hydratedRegistrationId === reg.id) return;
      this.hydratedRegistrationId = reg.id;
      const stored: UniformSelection = { ...uniformSlotForUid(reg, uid) };
      untracked(() => {
        if (isUniformSelectionComplete(category, stored)) {
          this.uniform.set(stored);
          this.saver.markSaved(stored);
          return;
        }
        // Inscrição sem uniforme nenhum (a vaga nasce sem): os padrões da tela viram a escolha
        // assim que o atleta abre — melhor um tamanho editável no pedido do organizador do que
        // uma linha em branco.
        const current = this.uniform();
        if (current && isUniformSelectionComplete(category, current)) this.saver.saveNow(current);
      });
    });
  }

  private async writeUniform(selection: UniformSelection): Promise<void> {
    const reg = this.registration();
    if (!reg) throw new TournamentRegistrationError('Sua inscrição ainda não foi criada.');
    await setRegistrationUniform(athleteFunctions(), reg.id, toUniformInput(selection));
  }

  /** Escolheu → grava sozinho. */
  protected onUniformChange(next: UniformSelection): void {
    this.uniform.set(next);
    const category = this.category();
    if (!category) return;
    if (!isUniformSelectionComplete(category, next)) {
      // Meia escolha não vira gravação — e nem vira erro enquanto o atleta ainda está
      // decidindo; o selo só volta para "Pendente".
      this.saver.cancelPending();
      return;
    }
    this.saver.schedule(next);
  }

  protected retrySave(): void {
    this.saver.retry();
  }

  protected exit(): void {
    void this.router.navigate(['/torneios', this.params().tournamentId]);
  }

  /** "Salvar e continuar": grava explicitamente (não espera o debounce) e só então segue —
   *  evita perder a última mexida se o atleta confirmar antes do autosave disparar. */
  protected async confirm(): Promise<void> {
    const category = this.category();
    const selection = this.uniform();
    const reg: AthleteTournamentRegistration | null = this.registration();
    const p = this.params();
    if (!category || !selection || !reg || this.confirming()) return;
    if (validateUniformSelection(category, selection) != null) return;
    this.confirming.set(true);
    try {
      await this.writeUniform(selection);
      this.saver.markSaved(selection);
      void this.router.navigate(['/torneios', p.tournamentId, 'inscricao', 'pagamento'], {
        queryParams: wizardQueryParams({ categoryId: p.categoryId, registrationId: reg.id }),
      });
    } catch (err) {
      this.toasts.error(
        'Não foi possível salvar o uniforme',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
      );
    } finally {
      this.confirming.set(false);
    }
  }

  protected categoryOf(): TournamentCategoryOffer | null {
    return this.category();
  }
}
