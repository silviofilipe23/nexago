import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CityStateFieldComponent } from '../../ui/city-state-field.component';
import { FieldComponent } from '../../ui/field.component';
import { IconComponent, type PanelIconName } from '../../ui/icon.component';
import type { PillTone } from '../../ui/pill.component';
import { StepCardComponent } from '../../ui/step-card.component';
import { ToggleComponent } from '../../ui/toggle.component';
import {
  ACCOUNT_TYPE_OPTIONS,
  COMMISSION_OPTIONS,
  LIMIT_OPTIONS,
  PAYOUT_OPTIONS,
  ROLE_PERMISSIONS,
  type AccountType,
  type VerificationState,
} from '../organizadores.data';
import { PersonRowComponent } from './person-row.component';
import type { OrganizerRoleForm, RoleFormSubject } from '../role-form.state';

const VERIFICATION_ICON: Record<VerificationState, PanelIconName> = {
  done: 'check',
  pending: 'clock',
  todo: 'alert',
};

/**
 * Etapas 1–5 da atribuição da role, compartilhadas por "Promover atleta" e
 * "Analisar solicitação". Sem atleta selecionado as etapas 2–5 ficam esmaecidas.
 */
@Component({
  selector: 'bo-role-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    StepCardComponent,
    FieldComponent,
    CityStateFieldComponent,
    IconComponent,
    ToggleComponent,
    PersonRowComponent,
  ],
  template: `
    @let account = subject();
    @let locked = !account;

    @if (account) {
      <bo-step-card
        [step]="1"
        title="Conta"
        subtitle="A role será atribuída a esta conta"
        badge="Selecionada"
        badgeTone="green"
      >
        <bo-person-row
          [name]="account.name"
          [badge]="account.badge"
          [meta]="accountMeta()"
          size="lg"
          [highlight]="true"
        >
          @if (swappable()) {
            <button type="button" class="bo-ghost-btn" (click)="swap.emit()">
              <bo-icon name="swap" [size]="14" />
              Trocar
            </button>
          }
        </bo-person-row>
      </bo-step-card>
    }

    <bo-step-card
      [step]="2"
      title="Perfil do organizador"
      subtitle="Como ele aparece para os atletas nas páginas de torneio"
      [muted]="locked"
      [badge]="draftBadge()"
      badgeTone="dim"
    >
      <div class="grid">
        <bo-field
          class="span-2"
          label="Nome da marca / organização"
          hint="Opcional — sem marca, usamos o nome da conta"
        >
          <input
            type="text"
            class="bo-input"
            autocomplete="organization"
            [value]="form().brand()"
            (input)="form().brand.set(value($event))"
          />
        </bo-field>

        <bo-city-state-field
          stateLabel="Estado base"
          cityLabel="Cidade base"
          [state]="form().state()"
          [city]="form().city()"
          (stateChange)="form().state.set($event)"
          (cityChange)="form().city.set($event)"
        />

        <bo-field label="Tipo de conta">
          <select class="bo-select" (change)="form().accountType.set(accountType($event))">
            @for (type of accountTypeOptions; track type) {
              <option [value]="type" [selected]="type === form().accountType()">{{ type }}</option>
            }
          </select>
        </bo-field>

        <bo-field label="CPF / CNPJ">
          <input
            type="text"
            class="bo-input"
            inputmode="numeric"
            [value]="form().document()"
            (input)="form().document.set(value($event))"
          />
        </bo-field>

        <bo-field label="E-mail de contato" hint="Herdado da conta do usuário">
          <input
            type="email"
            class="bo-input"
            autocomplete="email"
            [value]="form().email()"
            (input)="form().email.set(value($event))"
          />
        </bo-field>

        <bo-field label="WhatsApp">
          <input
            type="tel"
            class="bo-input"
            autocomplete="tel"
            [value]="form().whatsapp()"
            (input)="form().whatsapp.set(value($event))"
          />
        </bo-field>
      </div>
    </bo-step-card>

    <bo-step-card
      [step]="3"
      title="Verificação"
      subtitle="Checagens antes de liberar torneios com inscrição paga"
      [muted]="locked"
      [badge]="verificationBadge()"
      [badgeTone]="verificationTone()"
    >
      <div>
        @if (!form().hasVerification()) {
          <p class="step-empty">
            Esta conta não tem checagens registradas — o fluxo de verificação do organizador ainda
            não existe no backend.
          </p>
        }
        @for (item of form().verification(); track item.label) {
          <div class="check-row">
            <div class="check-icon" [class]="'state-' + item.state">
              <bo-icon [name]="icon[item.state]" [size]="14" />
            </div>
            <div class="check-body">
              <div class="check-label">{{ item.label }}</div>
              <div class="check-meta">{{ item.meta }}</div>
            </div>
            @if (item.action) {
              <button
                type="button"
                [class]="item.state === 'pending' ? 'bo-ghost-btn' : 'bo-mini-btn'"
              >
                {{ item.action }}
              </button>
            }
          </div>
        }
      </div>
    </bo-step-card>

    <bo-step-card
      [step]="4"
      title="Financeiro"
      subtitle="Recebimento das inscrições e comissão da plataforma"
      [muted]="locked"
      [badge]="draftBadge()"
      badgeTone="dim"
    >
      <div class="grid">
        <bo-field
          label="Chave PIX para repasses"
          hint="Definida pelo organizador no painel dele — o backoffice não altera o destino do dinheiro"
        >
          <output class="bo-readonly">{{ form().payoutPixKey() || 'Não configurada' }}</output>
        </bo-field>

        <bo-field label="Comissão NexaGO" hint="Negociações especiais exigem aprovação do financeiro">
          <select class="bo-select" (change)="setCommission($event)">
            @for (option of commissionOptions; track option.percent) {
              <option [value]="option.percent" [selected]="option.percent === form().commission().percent">
                {{ option.label }}
              </option>
            }
          </select>
        </bo-field>

        <bo-field label="Repasse">
          <select class="bo-select" (change)="form().payout.set(value($event))">
            @for (option of payoutOptions; track option) {
              <option [value]="option" [selected]="option === form().payout()">{{ option }}</option>
            }
          </select>
        </bo-field>

        <bo-field label="Limite por torneio" hint="Sobe automaticamente após 5 torneios sem disputas">
          <select class="bo-select" (change)="form().limit.set(value($event))">
            @for (option of limitOptions; track option) {
              <option [value]="option" [selected]="option === form().limit()">{{ option }}</option>
            }
          </select>
        </bo-field>
      </div>
    </bo-step-card>

    <bo-step-card
      [step]="5"
      title="Permissões da role"
      subtitle="O que este organizador pode fazer no modo organizador"
      [muted]="locked"
      [badge]="draftBadge() || 'Perfil: Novato'"
      badgeTone="dim"
    >
      <div>
        <p class="step-empty perm-note">
          Registro administrativo: as permissões ficam gravadas no cadastro, mas ainda não são
          verificadas pelo app — quem tem a role de organizador acessa todos os fluxos.
        </p>
        @for (permission of permissions; track permission.id) {
          <div class="perm-row" [class.locked]="permission.locked">
            <div class="perm-body">
              <div class="perm-label">{{ permission.label }}</div>
              <div class="perm-desc">{{ permission.desc }}</div>
            </div>
            @if (permission.locked) {
              <bo-icon name="lock" [size]="14" style="color: var(--nx-text-dim); flex: none" />
            } @else {
              <bo-toggle
                [checked]="form().isEnabled(permission.id)"
                [ariaLabel]="permission.label"
                (checkedChange)="form().setPermission(permission.id, $event)"
              />
            }
          </div>
        }
      </div>
    </bo-step-card>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px 16px;
      align-items: start;
    }

    /* Sem isto a marca ocuparia meia linha e empurraria o par UF/Cidade para
       fora do alinhamento. */
    .grid .span-2 {
      grid-column: 1 / -1;
    }

    .step-empty {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text-dim);
    }

    .perm-note {
      padding-bottom: 13px;
      border-bottom: 1px solid var(--nx-line);
    }

    .check-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .check-row:first-child {
      padding-top: 0;
    }

    .check-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .check-icon {
      width: 28px;
      height: 28px;
      flex: none;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text-dim);
    }

    .check-icon.state-done {
      background: rgba(43, 209, 126, 0.1);
      border-color: rgba(43, 209, 126, 0.28);
      color: var(--nx-win);
    }

    .check-icon.state-pending {
      background: rgba(244, 197, 67, 0.1);
      border-color: rgba(244, 197, 67, 0.28);
      color: var(--nx-pending);
    }

    .check-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .check-label {
      font-size: 12.5px;
      font-weight: 500;
      color: var(--nx-text);
    }

    .check-meta {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .perm-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 13px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .perm-row:first-child {
      padding-top: 0;
    }

    .perm-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .perm-row.locked {
      opacity: 0.45;
    }

    .perm-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .perm-label {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }

    .perm-desc {
      font-size: 11.5px;
      line-height: 1.45;
      color: var(--nx-text-dim);
    }

    @media (max-width: 860px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class RoleStepsComponent {
  readonly form = input.required<OrganizerRoleForm>();
  readonly subject = input.required<RoleFormSubject | null>();
  /** Linha extra sob o nome na etapa 1 (e-mail/UID no fluxo real). */
  readonly accountMeta = input('');
  /** Mostra o botão "Trocar" na etapa 1. */
  readonly swappable = input(true);
  /**
   * Etapas 2–5 ainda não têm persistência (não existe `organizers/{uid}`):
   * quando true, cada uma é marcada com o selo de rascunho.
   */
  readonly draft = input(false);

  /** "Trocar" conta na etapa 1. */
  readonly swap = output<void>();

  protected readonly permissions = ROLE_PERMISSIONS;
  protected readonly accountTypeOptions = ACCOUNT_TYPE_OPTIONS;
  protected readonly commissionOptions = COMMISSION_OPTIONS;
  protected readonly payoutOptions = PAYOUT_OPTIONS;
  protected readonly limitOptions = LIMIT_OPTIONS;
  protected readonly icon = VERIFICATION_ICON;

  protected readonly draftBadge = computed(() => (this.draft() ? 'Não salvo' : ''));

  protected verificationBadge(): string {
    return this.form().hasVerification() ? this.form().verificationLabel() : '';
  }

  protected verificationTone(): PillTone {
    return this.form().verificationComplete() ? 'green' : 'yellow';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected accountType(event: Event): AccountType {
    return this.value(event) as AccountType;
  }

  /** O `<option>` carrega o percentual; o formulário guarda a opção inteira. */
  protected setCommission(event: Event): void {
    const percent = Number(this.value(event));
    const option = COMMISSION_OPTIONS.find((o) => o.percent === percent);
    if (option) {
      this.form().commission.set(option);
    }
  }
}
