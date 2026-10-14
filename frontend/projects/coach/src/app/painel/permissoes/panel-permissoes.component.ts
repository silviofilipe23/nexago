import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CoachContextService } from '../access/coach-context.service';
import { COACH_STAFF_ROLES, ROLE_LABELS, ROLE_SUMMARIES, isCoachStaffRole, type CoachRole, type CoachStaffRole } from '../access/coach-roles.model';
import { CoachStaffService, inviteLink, type StaffInvite, type StaffMember } from '../access/coach-staff.service';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { FormFieldComponent } from '../ui/form-field.component';
import { initialsOf } from '../ui/initials';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';

const ROLE_ORDER: CoachRole[] = ['principal', ...COACH_STAFF_ROLES];

/** Permissões: a comissão técnica do treinador (convidar, trocar cargo, remover). A rota é da área
 *  `equipe` (só do dono); a tela ainda assim não mostra nada destrutivo fora do contexto do dono. */
@Component({
  selector: 'co-panel-permissoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AthleteAvatarComponent,
    FormFieldComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    PillComponent,
    RowComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Permissões" subtitle="Comissão técnica" />

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        @if (isOwner()) {
          <co-panel-card title="Comissão técnica" [kicker]="members().length + ''">
            @for (m of members(); track m.uid; let last = $last) {
              <co-row [title]="m.displayName || m.email" [sub]="m.email" [last]="last">
                <co-athlete-avatar row-avatar [initials]="initialsOf(m.displayName || m.email)" [size]="36" />
                <div row-trailing class="actions">
                  @if (confirmingRemoveId() === m.uid) {
                    <span class="confirm">Remover da comissão?</span>
                    <button type="button" class="co-ghost-btn danger" [disabled]="busyId() === m.uid" (click)="remove(m)">Remover</button>
                    <button type="button" class="co-ghost-btn" (click)="confirmingRemoveId.set(null)">Voltar</button>
                  } @else {
                    <select
                      class="role-select"
                      [attr.aria-label]="'Cargo de ' + (m.displayName || m.email)"
                      [disabled]="busyId() === m.uid"
                      (change)="onRoleChange(m, $event)"
                    >
                      @for (r of staffRoles; track r) {
                        <option [value]="r" [selected]="r === m.role">{{ roleLabels[r] }}</option>
                      }
                    </select>
                    <button type="button" class="co-ghost-btn danger" (click)="confirmingRemoveId.set(m.uid)">Remover</button>
                  }
                </div>
              </co-row>
            } @empty {
              <p class="empty">Você ainda não convidou ninguém.</p>
            }
          </co-panel-card>

          <co-panel-card title="Convidar para a comissão">
            <form class="invite" [formGroup]="inviteForm" (ngSubmit)="sendInvite()">
              <co-form-field label="E-mail" formControlName="email" [wide]="true" placeholder="pessoa@email.com" />
              <label class="role-field">
                <span>Cargo</span>
                <select formControlName="role">
                  @for (r of staffRoles; track r) {
                    <option [value]="r">{{ roleLabels[r] }}</option>
                  }
                </select>
              </label>
              <button type="submit" class="co-btn-primary" [disabled]="inviteForm.invalid || inviting()">
                {{ inviting() ? 'Gerando convite…' : 'Gerar convite' }}
              </button>
            </form>
            @if (newLink(); as link) {
              <div class="link-box">
                <input class="link-input" type="text" readonly [value]="link" aria-label="Link do convite" />
                <button type="button" class="co-mini-btn co-mini-btn-primary" (click)="copy(link)">
                  {{ copiedLink() === link ? 'Link copiado' : 'Copiar link' }}
                </button>
              </div>
              <p class="note">O convite vale por 7 dias e só funciona para este e-mail.</p>
            }
          </co-panel-card>

          <co-panel-card title="Convites pendentes" [kicker]="invites().length + ''">
            @for (i of invites(); track i.id; let last = $last) {
              <co-row [title]="i.emailLower" [sub]="expiryLabel(i)" [last]="last">
                <div row-trailing class="actions">
                  <co-pill tone="dim">{{ roleLabels[i.role] }}</co-pill>
                  <button type="button" class="co-ghost-btn" (click)="copy(linkFor(i))">
                    {{ copiedLink() === linkFor(i) ? 'Link copiado' : 'Copiar link' }}
                  </button>
                  <button type="button" class="co-ghost-btn danger" [disabled]="busyId() === i.id" (click)="revoke(i)">Revogar</button>
                </div>
              </co-row>
            } @empty {
              <p class="empty">Nenhum convite pendente.</p>
            }
          </co-panel-card>
        } @else {
          <co-panel-card title="Comissão técnica">
            <p class="empty">Só o treinador principal gerencia a comissão.</p>
          </co-panel-card>
        }

        <co-panel-card title="O que cada papel enxerga" kicker="Referência rápida">
          <div class="grid">
            @for (r of referenceRoles; track r) {
              <div class="scope-card">
                <div class="scope-title">{{ roleLabels[r] }}</div>
                <div class="scope-desc">{{ roleSummaries[r] }}</div>
              </div>
            }
          </div>
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }
    .co-alert {
      margin-bottom: 0;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .confirm {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .danger {
      color: var(--nx-red-500, #ff5b5b);
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
      margin: 0;
    }
    .role-select,
    .role-field select,
    .link-input {
      height: 32px;
      padding: 0 10px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
    }
    .invite {
      display: grid;
      grid-template-columns: 1fr 220px auto;
      gap: 12px;
      align-items: end;
    }
    .role-field {
      display: block;
    }
    .role-field span {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 6px;
    }
    .role-field select {
      width: 100%;
      height: 38px;
    }
    .invite .co-btn-primary {
      margin-bottom: 14px;
    }
    .link-box {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }
    .link-input {
      flex: 1;
      min-width: 0;
    }
    .note {
      margin: 8px 0 0;
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
    .scope-card {
      padding: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
    }
    .scope-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
      margin-bottom: 5px;
    }
    .scope-desc {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      line-height: 1.4;
    }
  `,
})
export class PanelPermissoesComponent {
  private readonly ctx = inject(CoachContextService);
  private readonly staff = inject(CoachStaffService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly staffRoles = COACH_STAFF_ROLES;
  protected readonly referenceRoles = ROLE_ORDER;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly roleSummaries = ROLE_SUMMARIES;
  protected readonly initialsOf = initialsOf;

  protected readonly members = signal<StaffMember[]>([]);
  protected readonly invites = signal<StaffInvite[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);
  protected readonly confirmingRemoveId = signal<string | null>(null);
  protected readonly inviting = signal(false);
  protected readonly newLink = signal<string | null>(null);
  protected readonly copiedLink = signal<string | null>(null);

  /** Só no painel próprio o usuário gerencia a comissão (um membro nunca vê isto). */
  protected readonly isOwner = computed(() => this.ctx.activeContext()?.isOwn === true);

  protected readonly inviteForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    role: [COACH_STAFF_ROLES[0] as CoachStaffRole, Validators.required],
  });

  constructor() {
    effect((onCleanup) => {
      const coachUid = this.ctx.activeCoachUid();
      this.members.set([]);
      this.invites.set([]);
      this.newLink.set(null);
      this.confirmingRemoveId.set(null);
      if (!coachUid || !this.isOwner()) {
        return;
      }
      const stopMembers = this.staff.watchMembers(coachUid, (list) => this.members.set(list));
      const stopInvites = this.staff.watchInvites(coachUid, (list) => this.invites.set(list));
      onCleanup(() => {
        stopMembers();
        stopInvites();
      });
    });
  }

  protected linkFor(i: StaffInvite): string {
    return inviteLink(location.origin, i.id);
  }

  protected expiryLabel(i: StaffInvite): string {
    if (i.expiresAtMs === null) {
      return 'Aguardando aceite';
    }
    return `Vale até ${new Date(i.expiresAtMs).toLocaleDateString('pt-BR')}`;
  }

  protected async sendInvite(): Promise<void> {
    if (this.inviteForm.invalid || this.inviting() || !this.isOwner()) {
      return;
    }
    const { email, role } = this.inviteForm.getRawValue();
    this.error.set(null);
    this.newLink.set(null);
    this.inviting.set(true);
    try {
      const inviteId = await this.staff.invite(email.trim(), role);
      this.newLink.set(inviteLink(location.origin, inviteId));
      this.inviteForm.controls.email.reset('');
    } catch (err) {
      this.fail(err, 'Não foi possível gerar o convite.');
    } finally {
      this.inviting.set(false);
    }
  }

  protected async copy(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copiedLink.set(link);
    } catch {
      /* sem permissão de área de transferência: o link continua visível para copiar à mão */
    }
  }

  protected async onRoleChange(m: StaffMember, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const role: unknown = select.value;
    if (!isCoachStaffRole(role) || role === m.role) {
      return;
    }
    this.error.set(null);
    this.busyId.set(m.uid);
    try {
      await this.staff.changeRole(m.uid, role);
    } catch (err) {
      select.value = m.role;
      this.fail(err, 'Não foi possível trocar o cargo.');
    } finally {
      this.busyId.set(null);
    }
  }

  protected async remove(m: StaffMember): Promise<void> {
    this.error.set(null);
    this.busyId.set(m.uid);
    try {
      await this.staff.remove(m.uid);
      this.confirmingRemoveId.set(null);
    } catch (err) {
      this.fail(err, 'Não foi possível remover o membro.');
    } finally {
      this.busyId.set(null);
    }
  }

  protected async revoke(i: StaffInvite): Promise<void> {
    this.error.set(null);
    this.busyId.set(i.id);
    try {
      await this.staff.revokeInvite(i.id);
    } catch (err) {
      this.fail(err, 'Não foi possível revogar o convite.');
    } finally {
      this.busyId.set(null);
    }
  }

  private fail(err: unknown, fallback: string): void {
    this.error.set(err instanceof Error && err.message ? err.message : fallback);
  }
}
