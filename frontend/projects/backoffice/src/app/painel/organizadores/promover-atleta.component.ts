import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  catchError,
  concat,
  debounceTime,
  distinctUntilChanged,
  from,
  map,
  of,
  switchMap,
  type Observable,
} from 'rxjs';
import { callableErrorMessage } from '../data/callable-error';
import { IconComponent } from '../ui/icon.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { StepCardComponent } from '../ui/step-card.component';
import { COMMISSION_OPTIONS } from './organizadores.data';
import {
  ORGANIZER_ROLE,
  OrganizersRepository,
  type BackofficeUser,
  type OrganizerRegistration,
} from './data/organizers.repository';
import { OrganizerRoleForm } from './role-form.state';
import { roleLabels, subjectFromUser, userDisplayName } from './role-subject';
import { PersonRowComponent } from './ui/person-row.component';
import { RoleRailComponent } from './ui/role-rail.component';
import { RoleStepsComponent } from './ui/role-steps.component';

const MIN_TERM = 2;

const SELECT_NOTE = 'Selecione uma conta para continuar.';
const ASSIGN_NOTE =
  'Grava a role (claims + users/{uid}.roles, igual ao script grant-user-role) e o cadastro do passo 2. ' +
  'Verificação e permissões seguem sem backend próprio.';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; rows: readonly BackofficeUser[] }
  | { kind: 'error'; message: string };

const IDLE: SearchState = { kind: 'idle' };

interface AssignResult {
  name: string;
  roles: readonly string[];
  alreadyHad: boolean;
  /** Mensagem quando a role foi atribuída mas o cadastro não gravou. */
  registrationError: string | null;
}

/** Tela "Promover atleta a organizador": busca a conta real e atribui a role de organizador. */
@Component({
  selector: 'bo-promover-atleta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    StepCardComponent,
    PillComponent,
    IconComponent,
    PersonRowComponent,
    RoleStepsComponent,
    RoleRailComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="bo-detail-header">
        <a class="bo-back-btn" routerLink="/painel/organizadores" aria-label="Voltar para Organizadores">
          <bo-icon name="chevron-left" [size]="18" />
        </a>
        <div class="titles">
          <h1>Promover atleta a organizador</h1>
          <p>Organizadores · Nova role</p>
        </div>
        <bo-pill [tone]="done() ? 'green' : 'dim'">{{ done() ? 'Concluído' : 'Rascunho' }}</bo-pill>
      </header>

      <div class="bo-detail-body">
        @let result = assigned();

        @if (result) {
          <div class="done-card">
            <div class="done-icon" aria-hidden="true">
              <bo-icon name="check" [size]="22" />
            </div>
            <h2>
              {{ result.alreadyHad ? 'Esta conta já era organizadora' : 'Role de organizador atribuída' }}
            </h2>
            <p>
              <strong>{{ result.name }}</strong> agora tem os papéis
              <strong>{{ rolesText(result.roles) }}</strong
              >.
            </p>
            <p class="done-hint">
              A mudança vale a partir de um token novo: o usuário precisa sair e entrar de novo no app
              (o token em cache dura até ~1 h).
            </p>

            @if (result.registrationError) {
              <div class="bo-alert done-alert">
                <bo-icon name="alert" [size]="16" />
                <span>
                  A role foi atribuída, mas o cadastro do passo 2 não foi salvo:
                  {{ result.registrationError }}
                </span>
              </div>
              <button
                type="button"
                class="bo-mini-btn bo-mini-btn-primary"
                [disabled]="assigning()"
                (click)="retryRegistration()"
              >
                {{ assigning() ? 'Salvando…' : 'Tentar salvar o cadastro de novo' }}
              </button>
            }

            <div class="done-actions">
              <button type="button" class="bo-mini-btn bo-mini-btn-primary" (click)="reset()">
                <bo-icon name="plus" [size]="14" />
                Promover outra conta
              </button>
              <a class="bo-mini-btn" routerLink="/painel/organizadores">Voltar para Organizadores</a>
            </div>
          </div>
        } @else {
          <div class="bo-detail-grid">
            <div class="bo-detail-main">
              @if (!selected()) {
                <bo-step-card
                  [step]="1"
                  title="Conta"
                  subtitle="Busque a conta que vai receber a role de organizador"
                >
                  <div class="search">
                    <bo-icon name="search" [size]="16" />
                    <input
                      type="search"
                      class="search-input"
                      placeholder="Nome, e-mail ou UID"
                      aria-label="Buscar conta"
                      [value]="query()"
                      (input)="query.set(value($event))"
                    />
                    @if (search().kind === 'loading') {
                      <span class="search-count">buscando…</span>
                    } @else if (search().kind === 'ok') {
                      <span class="search-count">{{ resultsLabel() }}</span>
                    }
                  </div>

                  @switch (search().kind) {
                    @case ('error') {
                      <div class="bo-alert search-alert">
                        <bo-icon name="alert" [size]="16" />
                        <span>{{ errorMessage() }}</span>
                      </div>
                    }
                    @case ('ok') {
                      <div class="results">
                        @for (user of rows(); track user.uid) {
                          <div class="result">
                            <bo-person-row
                              [name]="displayName(user)"
                              [badge]="roles(user)"
                              [meta]="metaOf(user)"
                            >
                              <button
                                type="button"
                                class="bo-mini-btn bo-mini-btn-primary"
                                [disabled]="loadingAccount() !== null"
                                (click)="select(user)"
                              >
                                {{ loadingAccount() === user.uid ? 'Carregando…' : 'Selecionar' }}
                              </button>
                            </bo-person-row>
                          </div>
                        } @empty {
                          <p class="empty">Nenhuma conta encontrada para “{{ query() }}”.</p>
                        }
                      </div>
                    }
                  }

                  <p class="search-hint">
                    Busque por nome, e-mail ou UID. A busca percorre as contas do Firebase Auth deste
                    projeto — a role é atribuída à conta existente, o backoffice não cria usuário.
                  </p>
                </bo-step-card>
              }

              <bo-role-steps
                [form]="form"
                [subject]="subject()"
                [accountMeta]="selectedMeta()"
                (swap)="reset()"
              />
            </div>

            <aside class="bo-detail-rail">
              <bo-role-rail [rows]="form.summaryRows()" [note]="note()">
                @if (assignError()) {
                  <div class="bo-alert">
                    <bo-icon name="alert" [size]="16" />
                    <span>{{ assignError() }}</span>
                  </div>
                }
                <button type="button" class="bo-cta" [disabled]="!selected() || assigning()" (click)="assign()">
                  @if (assigning()) {
                    <span class="bo-spinner light" aria-hidden="true"></span>
                    Atribuindo…
                  } @else {
                    <bo-icon name="id-badge" [size]="17" />
                    Atribuir role e salvar cadastro
                  }
                </button>
                <a class="bo-cta-ghost link" routerLink="/painel/organizadores">Cancelar</a>
              </bo-role-rail>
            </aside>
          </div>
        }
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .search {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 44px;
      padding: 0 14px;
      background: var(--nx-surface-1);
      border: 1px solid rgba(255, 106, 26, 0.35);
      border-radius: var(--nx-r-3);
      color: var(--nx-text-dim);
    }

    .search:focus-within {
      border-color: var(--nx-orange-500);
    }

    .search-input {
      flex: 1;
      min-width: 0;
      height: 100%;
      background: transparent;
      border: none;
      outline: none;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
    }

    .search-count {
      flex: none;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }

    .search-alert {
      margin: 14px 0 0;
    }

    .results {
      margin-top: 6px;
    }

    .result {
      padding: 0 14px;
      margin: 0 -14px;
      border-radius: var(--nx-r-3);
      border-bottom: 1px solid var(--nx-line);
      transition: background 140ms var(--nx-ease-out);
    }

    .result:last-child {
      border-bottom: none;
    }

    .result:hover,
    .result:focus-within {
      background: var(--nx-orange-tint);
      border-bottom-color: transparent;
    }

    .empty {
      margin: 16px 0;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .search-hint {
      margin: 12px 0 0;
      font-size: 11.5px;
      line-height: 1.45;
      color: var(--nx-text-dim);
    }

    .done-card {
      max-width: 560px;
      margin: 40px auto;
      padding: 32px;
      text-align: center;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
    }

    .done-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 20px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: rgba(43, 209, 126, 0.12);
      border: 1px solid rgba(43, 209, 126, 0.3);
      color: var(--nx-win);
    }

    .done-card h2 {
      margin: 0 0 10px;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 19px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .done-card p {
      margin: 0 0 8px;
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
    }

    .done-hint {
      font-size: 12px !important;
      color: var(--nx-text-dim) !important;
    }

    .done-alert {
      margin: 20px 0 12px;
      text-align: left;
    }

    .done-actions {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin-top: 22px;
    }

    .done-actions a.bo-mini-btn {
      text-decoration: none;
    }

    .bo-cta .bo-spinner.light {
      border-color: rgba(255, 255, 255, 0.35);
      border-top-color: #fff;
    }

    a.bo-cta-ghost.link {
      display: grid;
      place-items: center;
      text-decoration: none;
    }
  `,
})
export class PromoverAtletaComponent {
  private readonly repository = inject(OrganizersRepository);

  protected readonly query = signal('');
  protected readonly selected = signal<BackofficeUser | null>(null);
  protected readonly registration = signal<OrganizerRegistration | null>(null);
  protected readonly loadingAccount = signal<string | null>(null);
  protected readonly assigning = signal(false);
  protected readonly assignError = signal<string | null>(null);
  protected readonly assigned = signal<AssignResult | null>(null);

  protected readonly subject = computed(() => {
    const user = this.selected();
    return user ? subjectFromUser(user, this.registration()) : null;
  });

  protected readonly form = new OrganizerRoleForm(this.subject);

  private readonly search$: Observable<SearchState> = toObservable(this.query).pipe(
    map((term) => term.trim()),
    debounceTime(320),
    distinctUntilChanged(),
    switchMap((term) => {
      if (term.length < MIN_TERM) {
        return of(IDLE);
      }
      return concat(
        of<SearchState>({ kind: 'loading' }),
        from(this.repository.searchUsers(term)).pipe(
          map((rows): SearchState => ({ kind: 'ok', rows })),
          catchError((err) => of<SearchState>({ kind: 'error', message: callableErrorMessage(err) })),
        ),
      );
    }),
  );

  protected readonly search = toSignal(this.search$, { initialValue: IDLE });

  protected readonly rows = computed<readonly BackofficeUser[]>(() => {
    const state = this.search();
    return state.kind === 'ok' ? state.rows : [];
  });

  protected readonly errorMessage = computed(() => {
    const state = this.search();
    return state.kind === 'error' ? state.message : '';
  });

  protected readonly resultsLabel = computed(() => {
    const total = this.rows().length;
    return total === 1 ? '1 conta' : `${total} contas`;
  });

  protected readonly done = computed(() => this.assigned() != null);
  protected readonly note = computed(() => (this.selected() ? ASSIGN_NOTE : SELECT_NOTE));

  protected readonly selectedMeta = computed(() => {
    const user = this.selected();
    return user ? this.metaOf(user) : '';
  });

  protected readonly displayName = userDisplayName;

  protected roles(user: BackofficeUser): string {
    return roleLabels(user.roles);
  }

  protected metaOf(user: BackofficeUser): string {
    const parts = [user.email ?? 'sem e-mail', user.uid];
    if (user.disabled) {
      parts.push('conta desativada');
    }
    if (user.roles.includes(ORGANIZER_ROLE)) {
      parts.push('já é organizador');
    }
    return parts.join(' · ');
  }

  protected rolesText(roles: readonly string[]): string {
    return roleLabels(roles) || '—';
  }

  /**
   * Carrega o cadastro ANTES de selecionar: os campos do passo 2 são
   * `linkedSignal` do subject, então selecionar primeiro e preencher depois
   * faria o formulário aparecer vazio e saltar — e apagaria o que o admin
   * tivesse digitado nesse intervalo.
   */
  protected async select(user: BackofficeUser): Promise<void> {
    this.assignError.set(null);
    this.loadingAccount.set(user.uid);
    const registration = await this.repository.loadRegistration(user.uid);
    if (this.loadingAccount() !== user.uid) {
      return; // outra conta foi escolhida no meio do caminho
    }
    this.loadingAccount.set(null);
    this.registration.set(registration);
    this.selected.set(user);
    this.applyTerms(registration);
  }

  protected reset(): void {
    this.selected.set(null);
    this.registration.set(null);
    this.loadingAccount.set(null);
    this.assigned.set(null);
    this.assignError.set(null);
    this.query.set('');
  }

  protected async assign(): Promise<void> {
    const user = this.selected();
    if (!user || this.assigning()) {
      return;
    }
    this.assigning.set(true);
    this.assignError.set(null);
    try {
      const result = await this.repository.grantOrganizerRole(user.uid);
      // A role já valeu daqui pra frente. Se o cadastro falhar, a tela diz
      // exatamente isso e oferece repetir só a parte que faltou — refazer a
      // promoção inteira não desfaria nada.
      const registrationError = await this.persistRegistration(user.uid);
      this.assigned.set({
        name: userDisplayName(user),
        roles: result.roles,
        alreadyHad: result.alreadyHad,
        registrationError,
      });
    } catch (err) {
      this.assignError.set(callableErrorMessage(err));
    } finally {
      this.assigning.set(false);
    }
  }

  /** Repete só a gravação do cadastro, depois de a role já ter sido atribuída. */
  protected async retryRegistration(): Promise<void> {
    const user = this.selected();
    const result = this.assigned();
    if (!user || !result || this.assigning()) {
      return;
    }
    this.assigning.set(true);
    const registrationError = await this.persistRegistration(user.uid);
    this.assigned.set({ ...result, registrationError });
    this.assigning.set(false);
  }

  /** `null` = gravou; string = mensagem do erro. */
  private async persistRegistration(uid: string): Promise<string | null> {
    const { profile, terms } = this.form.registration();
    try {
      await this.repository.saveRegistration(uid, profile, terms);
      return null;
    } catch (err) {
      return callableErrorMessage(err);
    }
  }

  /** Condições comerciais já gravadas voltam para os selects do passo 4. */
  private applyTerms(registration: OrganizerRegistration): void {
    this.form.payoutPixKey.set(registration.payoutPixKey);
    const terms = registration.terms;
    if (!terms) {
      return;
    }
    const commission = COMMISSION_OPTIONS.find((o) => o.percent === terms.commissionPercent);
    if (commission) {
      this.form.commission.set(commission);
    }
    if (terms.payoutSchedule) {
      this.form.payout.set(terms.payoutSchedule);
    }
    if (terms.tournamentLimit) {
      this.form.limit.set(terms.tournamentLimit);
    }
    if (terms.permissions.length > 0) {
      this.form.permissions.set(terms.permissions);
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
