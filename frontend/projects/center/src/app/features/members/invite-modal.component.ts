import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CenterContextService } from '../../core/center-context.service';
import { TeamActions } from '../../data/actions/team.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import { CenterStore } from '../../data/center-store.service';
import { invitableRoles, ROLE_LABELS, type CenterRole } from '../../domain/roles';
import { ModalComponent } from '../../ui/kit';
import { inviteEmailError } from './members.utils';

const ROLE_HINT: Record<CenterRole, [string, string]> = {
  coach: ['Turmas atribuídas e chamada', 'Sem acesso a cobranças, planos ou configurações. Dá para liberar permissões extras depois que a pessoa aceitar.'],
  receptionist: ['Cadastros e matrículas', 'Cadastra alunos e matrículas. Sem acesso a cobranças nem configurações, salvo permissão extra.'],
  center_admin: ['Gestão operacional', 'Gere turmas, planos, equipe e cobranças. Não mexe no owner nem cria outro admin.'],
  center_owner: ['Dono do centro', ''],
};

/** Modal "Convidar pessoa" (W8). Convite é por e-mail; o vínculo nasce quando a pessoa aceita. */
@Component({
  selector: 'ct-invite-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent],
  template: `
    <ct-modal kicker="Equipe" [title]="'Convidar para ' + (ctx.center()?.name ?? 'o centro')" [width]="560" (closed)="close()">
      <form id="ct-invite-form" class="ct-col" style="gap: 14px" [formGroup]="form" (ngSubmit)="submit()">
        <div class="ct-form-grid">
          <div class="ct-field">
            <label for="inv-email">E-mail</label>
            <input id="inv-email" class="ct-input" type="email" formControlName="email" autocomplete="off" [class.invalid]="!!emailError()" />
            @if (emailError(); as e) {
              <span class="ct-field-error">{{ e }}</span>
            }
          </div>
          <div class="ct-field">
            <label for="inv-name">Nome</label>
            <input id="inv-name" class="ct-input" formControlName="displayName" autocomplete="off" [class.invalid]="nameInvalid()" />
            @if (nameInvalid()) {
              <span class="ct-field-error">Informe o nome.</span>
            }
          </div>
        </div>

        <div class="ct-field">
          <span class="ct-label">Papel neste centro</span>
          <div class="roles">
            @for (r of roles(); track r) {
              <button type="button" class="ct-option" [class.on]="role() === r" [attr.aria-pressed]="role() === r" (click)="form.controls.role.setValue(r)">
                <strong>{{ roleLabels[r] }}</strong>
                <span>{{ hints[r][0] }}</span>
              </button>
            }
          </div>
        </div>

        @if (store.programs().length) {
          <div class="ct-field">
            <span class="ct-label">Modalidades</span>
            <div class="ct-row ct-wrap" style="gap: 8px">
              @for (p of store.programs(); track p.id) {
                <button type="button" class="ct-chip" [class.active]="programIds().includes(p.id)" [attr.aria-pressed]="programIds().includes(p.id)" (click)="toggleProgram(p.id)">
                  <span class="dot" [style.background]="p.color"></span>{{ p.name }}
                </button>
              }
            </div>
          </div>
        }

        <p class="ct-dim" style="margin: 0">{{ hints[role()][1] }} O convite vale para o e-mail informado: a pessoa entra com a conta NexaGO desse e-mail (ou cria uma) e aceita.</p>
        @if (error()) {
          <p class="ct-error-text" role="alert" style="margin: 0">{{ error() }}</p>
        }
      </form>
      <div footer>
        <button type="button" class="ct-mini-btn" [disabled]="busy()" (click)="close()">Cancelar</button>
        <button type="submit" form="ct-invite-form" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || !ctx.canWrite()">
          {{ busy() ? 'Enviando…' : 'Enviar convite' }}
        </button>
      </div>
    </ct-modal>
  `,
  styles: `.roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }`,
})
export class InviteModalComponent {
  readonly closed = output<void>();
  readonly invited = output<string>();

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly team = inject(TeamActions);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly hints = ROLE_HINT;
  protected readonly roles = computed(() => invitableRoles(this.ctx.me()));

  protected readonly form = this.fb.group({
    email: ['', Validators.required],
    displayName: ['', [Validators.required, Validators.maxLength(80)]],
    role: [(invitableRoles(this.ctx.me())[0] ?? 'coach') as CenterRole],
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly role = computed(() => (this.value().role ?? 'coach') as CenterRole);

  protected readonly programIds = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly submitted = signal(false);

  protected readonly emailError = computed(() => {
    const email = this.value().email ?? '';
    if (!this.submitted() && !email) {
      return null;
    }
    return inviteEmailError(email, this.store.members(), this.store.invites());
  });
  protected readonly nameInvalid = computed(() => this.submitted() && !(this.value().displayName ?? '').trim());

  protected toggleProgram(id: string): void {
    this.programIds.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected close(): void {
    if (!this.busy()) {
      this.closed.emit();
    }
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    if (this.busy() || this.emailError() || this.nameInvalid() || !this.ctx.canWrite()) {
      return;
    }
    const v = this.form.getRawValue();
    if (!this.roles().includes(v.role)) {
      this.error.set('Você não pode conceder esse papel.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.team.invite({ email: v.email, displayName: v.displayName, role: v.role, programIds: this.programIds(), classIds: [] });
      this.invited.emit(v.email.trim().toLowerCase());
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
