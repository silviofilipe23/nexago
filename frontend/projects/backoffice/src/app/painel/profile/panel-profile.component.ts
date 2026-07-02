import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { multiFactor } from 'firebase/auth';
import { AuthService } from '../../auth/auth.service';
import { mapFirebaseAuthError } from '../../auth/firebase-auth-errors';
import { FieldComponent } from '../../auth/ui/field.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';

interface PermissionRow {
  icon: 'arena' | 'trophy' | 'users' | 'cash' | 'team';
  module: string;
}

interface LogRow {
  text: string;
  when: string;
}

const PERMISSIONS: PermissionRow[] = [
  { icon: 'arena', module: 'Arenas' },
  { icon: 'trophy', module: 'Torneios' },
  { icon: 'users', module: 'Atletas' },
  { icon: 'cash', module: 'Financeiro' },
  { icon: 'team', module: 'Equipe' },
];

const ACTIVITY_LOG: LogRow[] = [
  { text: 'Aprovou a arena <strong>Beach House Recife</strong>', when: 'Qui 02 Jul · 09:41' },
  { text: 'Exportou o financeiro de junho <strong>(CSV)</strong>', when: 'Qua 01 Jul · 16:20' },
  { text: 'Convidou <strong>carla&#64;nexago.com</strong> · papel Operações', when: 'Ter 30 Jun · 11:05' },
  { text: 'Alterou a senha', when: 'Seg 29 Jun · 18:47' },
  { text: 'Entrou de um novo dispositivo · <strong>MacBook · Recife</strong>', when: 'Seg 29 Jun · 18:45' },
];

const PHONE_STORAGE_PREFIX = 'nexago-backoffice-phone:';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '·';
  }
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Perfil do admin (protótipo BoPerfilScreen/BoPerfilEditScreen): visualização + edição inline. */
@Component({
  selector: 'bo-panel-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PillComponent,
    IconComponent,
    FieldComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header [title]="isEditing() ? 'Editando perfil' : 'Meu perfil'" [subtitle]="isEditing() ? 'As mudanças valem só depois de salvar' : 'Tua conta no backoffice'">
        <div class="header-actions">
          @if (isEditing()) {
            <button type="button" class="bo-ghost-btn" (click)="cancelEdit()">Cancelar</button>
            <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="saving()" (click)="save()">
              @if (saving()) {
                <span class="bo-spinner" aria-hidden="true"></span>
              } @else {
                <bo-icon name="check" [size]="14" [strokeWidth]="2.4" />
              }
              Salvar alterações
            </button>
          } @else {
            <button type="button" class="bo-ghost-btn danger" (click)="signOut()">
              <bo-icon name="logout" [size]="15" />
              Sair
            </button>
            <button type="button" class="bo-mini-btn bo-mini-btn-primary" (click)="startEdit()">
              <bo-icon name="edit" [size]="14" />
              Editar perfil
            </button>
          }
        </div>
      </bo-page-header>

      <div class="body">
        <div class="col-left">
          @if (isEditing()) {
            <bo-panel-card pad="lg" [accent]="true">
              <div class="avatar-row">
                <div class="bo-avatar ring" style="width: 72px; height: 72px; font-size: 24px;" aria-hidden="true">
                  {{ initials() }}
                </div>
                <div class="avatar-actions">
                  <button type="button" class="bo-mini-btn" disabled title="Em breve">Trocar foto</button>
                  <span class="hint">PNG ou JPG · até 2 MB</span>
                </div>
              </div>

              <form [formGroup]="form" class="fields">
                <bo-field label="Nome completo" autocomplete="name" formControlName="name" [error]="nameError()" />
                <bo-field label="Telefone" type="text" autocomplete="tel" formControlName="phone" hint="Usado só pra contato interno da equipe." />
                <bo-field label="E-mail" [locked]="true" formControlName="email" hint="O e-mail vem do convite e não pode ser trocado aqui." />
              </form>
            </bo-panel-card>
          } @else {
            <bo-panel-card pad="lg">
              <div class="identity">
                <div class="bo-avatar ring" style="width: 84px; height: 84px; font-size: 28px;" aria-hidden="true">
                  {{ initials() }}
                </div>
                <div class="name">{{ displayName() }}</div>
                <div class="email">{{ email() }}</div>
                <bo-pill tone="orange">Admin</bo-pill>
              </div>
              <div class="meta">
                <div class="bo-meta-row"><span class="k">No time desde</span><span class="v">{{ memberSince() }}</span></div>
                <div class="bo-meta-row"><span class="k">Último acesso</span><span class="v">{{ lastAccess() }}</span></div>
                <div class="bo-meta-row"><span class="k">Fuso horário</span><span class="v">{{ timeZone() }}</span></div>
              </div>
            </bo-panel-card>
          }

          <bo-panel-card title="Papel e permissões">
            <span class="perm-tag" card-actions>
              <bo-icon name="lock" [size]="13" />
              Leitura
            </span>
            <div class="list">
              @for (perm of permissions; track perm.module) {
                <div class="bo-perm-row">
                  <bo-icon [name]="perm.icon" [size]="15" />
                  <span class="module">{{ perm.module }}</span>
                  <span class="level"><bo-icon name="check" [size]="12" [strokeWidth]="2.6" />Total</span>
                </div>
              }
            </div>
            <p class="perm-note">Papel definido por outro admin. Pra mudar, fala com o time.</p>
          </bo-panel-card>
        </div>

        <div class="col-right">
          <bo-panel-card title="Segurança">
            <div class="list">
              <div class="bo-row sec-row">
                <div class="bo-row-icon lg"><bo-icon name="key" [size]="17" /></div>
                <div class="bo-row-body">
                  <div class="bo-row-title strong">Senha</div>
                  <div class="bo-row-desc">{{ passwordResetSent() ? 'Link de redefinição enviado — confere teu e-mail.' : 'Envie um link de redefinição para o seu e-mail.' }}</div>
                </div>
                <button type="button" class="bo-mini-btn" [disabled]="sendingReset()" (click)="sendPasswordReset()">
                  {{ sendingReset() ? 'Enviando…' : 'Alterar' }}
                </button>
              </div>
              <div class="bo-row sec-row">
                <div class="bo-row-icon lg"><bo-icon name="shield" [size]="17" /></div>
                <div class="bo-row-body">
                  <div class="bo-row-title strong">Verificação em 2 etapas</div>
                  <div class="bo-row-desc">Código do app autenticador em novos dispositivos.</div>
                </div>
                <bo-pill [tone]="mfaEnabled() ? 'green' : 'dim'">{{ mfaEnabled() ? 'Ativada' : 'Não ativada' }}</bo-pill>
              </div>
            </div>
            @if (resetError(); as err) {
              <div class="bo-alert" role="alert" style="margin-top: 14px;">
                <bo-icon name="alert" [size]="14" />
                {{ err }}
              </div>
            }
          </bo-panel-card>

          <bo-panel-card title="Log de atividade" kicker="Só tu vês isso" class="log-card">
            <span class="log-window" card-actions>Últimos 7 dias</span>
            <div class="list">
              @for (row of activityLog; track row.when) {
                <div class="bo-log-row">
                  <span class="bo-log-dot" aria-hidden="true"></span>
                  <div class="bo-log-text" [innerHTML]="row.text"></div>
                  <span class="bo-log-time">{{ row.when }}</span>
                </div>
              }
            </div>
          </bo-panel-card>
        </div>
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 380px 1fr;
      gap: 16px;
      overflow: auto;
      align-items: start;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .identity {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0;
    }

    .identity .name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 22px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 16px;
    }

    .identity .email {
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 4px 0 12px;
    }

    .meta {
      margin-top: 20px;
      padding-top: 8px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
    }

    .avatar-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }

    .avatar-actions {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .avatar-actions .hint {
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    .fields {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .perm-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--nx-text-dim);
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .perm-note {
      font-size: 11.5px;
      line-height: 1.5;
      color: var(--nx-text-dim);
      margin: 10px 0 0;
    }

    .list {
      display: flex;
      flex-direction: column;
      margin-top: -6px;
    }

    .sec-row {
      align-items: center;
    }

    .log-window {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    @media (max-width: 980px) {
      .body {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelProfileComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly permissions = PERMISSIONS;
  protected readonly activityLog = ACTIVITY_LOG;

  protected readonly isEditing = signal(false);
  protected readonly saving = signal(false);
  protected readonly sendingReset = signal(false);
  protected readonly passwordResetSent = signal(false);
  protected readonly resetError = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly displayName = computed(
    () => this.auth.displayName() || this.auth.user()?.email || 'Conta',
  );
  protected readonly email = computed(() => this.auth.user()?.email ?? '');
  protected readonly initials = computed(() => initialsOf(this.displayName()));

  protected readonly mfaEnabled = computed(() => {
    const user = this.auth.user();
    return user != null && multiFactor(user).enrolledFactors.length > 0;
  });

  protected readonly memberSince = computed(() => this.formatMonthYear(this.auth.user()?.metadata.creationTime));
  protected readonly lastAccess = computed(() => this.formatDateTime(this.auth.user()?.metadata.lastSignInTime));
  protected readonly timeZone = computed(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  protected readonly form = this.fb.group({
    name: ['', Validators.required],
    phone: [''],
    email: [{ value: '', disabled: true }],
  });

  protected nameError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    return this.form.controls.name.hasError('required') ? 'Informe teu nome.' : null;
  }

  protected startEdit(): void {
    const uid = this.auth.user()?.uid ?? '';
    this.form.reset({
      name: this.displayName(),
      phone: uid ? (localStorage.getItem(PHONE_STORAGE_PREFIX + uid) ?? '') : '',
      email: this.email(),
    });
    this.submitted.set(false);
    this.isEditing.set(true);
  }

  protected cancelEdit(): void {
    this.isEditing.set(false);
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    try {
      const { name, phone } = this.form.getRawValue();
      await this.auth.updateDisplayName(name);
      const uid = this.auth.user()?.uid;
      if (uid) {
        localStorage.setItem(PHONE_STORAGE_PREFIX + uid, phone.trim());
      }
      this.isEditing.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  protected async sendPasswordReset(): Promise<void> {
    const email = this.email();
    if (!email) {
      return;
    }
    this.resetError.set(null);
    this.sendingReset.set(true);
    try {
      await this.auth.sendPasswordReset(email);
      this.passwordResetSent.set(true);
    } catch (err) {
      this.resetError.set(mapFirebaseAuthError(err));
    } finally {
      this.sendingReset.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }

  private formatMonthYear(iso: string | undefined): string {
    if (!iso) {
      return '—';
    }
    return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(new Date(iso));
  }

  private formatDateTime(iso: string | undefined): string {
    if (!iso) {
      return '—';
    }
    const date = new Date(iso);
    const day = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
    const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
    return `${day} · ${time}`;
  }
}
