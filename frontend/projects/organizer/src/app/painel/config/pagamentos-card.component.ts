import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NxSkeletonComponent } from '../../shared/loading/nx-skeleton.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { OrganizerSettingsError, saveOrganizerPayments } from '../data/organizer-settings-repository';
import type { OrganizerPaymentSettings } from '../data/organizer-settings.model';
import {
  PIX_KEY_TYPES,
  PIX_KEY_TYPE_HINT,
  PIX_KEY_TYPE_LABEL,
  digitsOnly,
  resolveInitialPixKeyType,
  validatePixKeyForType,
  type PixKeyType,
} from '../data/pix-key';
import { OgCardComponent } from '../ui/card.component';
import { OgFormFieldComponent } from '../ui/form-field.component';
import { OgIconComponent } from '../ui/icon.component';

/** Card "Pagamentos" de `/painel/config`.
 *
 *  Existem DUAS chaves Pix no produto e elas não se misturam:
 *   - a de SAQUE (`organizerWallets/{uid}.payoutPixKey`) — pra onde a NexaGO deposita. Gravada por
 *     Cloud Function e gerenciada na tela Financeiro; aqui aparece só em leitura, com link.
 *   - a de RECEBIMENTO DIRETO (`organizerPayments`, este card) — usada quando o torneio cobra
 *     fora do app (`paymentMode: 'directWithOrganizer'`).
 *
 *  Cadastrar aqui também tapa um buraco real: o wizard só pergunta chave e nome do recebedor,
 *  mandando `keyType` e `city` VAZIOS pro BR Code do torneio. */
@Component({
  selector: 'og-config-pagamentos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OgCardComponent,
    OgIconComponent,
    OgFormFieldComponent,
    ReactiveFormsModule,
    RouterLink,
    NxSkeletonComponent,
    NxSpinnerComponent,
  ],
  template: `
    <og-card title="Pagamentos" kicker="NexaGO Pay">
      @if (!editing() && !loading()) {
        <button card-action type="button" class="og-ghost-btn" (click)="startEdit()">
          <og-icon name="edit" [size]="13" />{{ hasKey() ? 'Editar' : 'Cadastrar' }}
        </button>
      }

      @if (loading()) {
        @for (i of skeletonRows; track i) {
          <div class="og-config-row" [class.last]="i === 4"><app-nx-skeleton w="38%" [h]="13" /><app-nx-skeleton w="40%" [h]="13" /></div>
        }
      } @else if (!editing()) {
        <p class="og-cfg-hint">
          Recebimento direto: usado nos torneios em que você cobra por fora do app. O wizard já nasce
          preenchido com estes dados.
        </p>
        <div class="og-config-row">
          <span class="lbl">Chave Pix</span>
          <span class="val">{{ hasKey() ? payments().pixKey : 'Não cadastrada' }}</span>
        </div>
        <div class="og-config-row">
          <span class="lbl">Tipo de chave</span>
          <span class="val">{{ keyTypeLabel() }}</span>
        </div>
        <div class="og-config-row">
          <span class="lbl">Nome do recebedor</span>
          <span class="val">{{ payments().recipientName || '—' }}</span>
        </div>
        <div class="og-config-row last">
          <span class="lbl">Cidade do recebedor</span>
          <span class="val">{{ payments().city || '—' }}</span>
        </div>

        <div class="og-cfg-payout">
          <div>
            <div class="og-cfg-payout-title">Chave Pix de saque</div>
            <div class="og-cfg-payout-value">{{ payoutLabel() }}</div>
          </div>
          <a class="og-ghost-btn" routerLink="/painel/financeiro">Gerenciar no Financeiro</a>
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()">
          <div class="og-field-grid">
            <og-form-field label="Tipo de chave">
              <select class="og-select-el" formControlName="pixKeyType">
                @for (t of pixKeyTypes; track t) {
                  <option [value]="t">{{ pixKeyTypeLabel[t] }}</option>
                }
              </select>
            </og-form-field>
            <og-form-field label="Chave Pix">
              <input class="og-input-el" type="text" formControlName="pixKey" autocomplete="off" [placeholder]="keyHint()" />
            </og-form-field>
            <og-form-field label="Nome do recebedor">
              <input class="og-input-el" type="text" formControlName="recipientName" placeholder="Como aparece na conta" />
            </og-form-field>
            <og-form-field label="Cidade do recebedor">
              <input class="og-input-el" type="text" formControlName="city" placeholder="Goiânia" />
            </og-form-field>
          </div>
          <p class="og-cfg-hint" style="margin:14px 0 0">
            Deixe a chave em branco se você só cobra pelo app — o wizard volta a pedir os dados na hora.
          </p>

          @if (formError(); as err) {
            <p class="og-cfg-error">{{ err }}</p>
          }
          <div class="og-cfg-actions">
            <button type="button" class="og-ghost-btn" [disabled]="saving()" (click)="cancel()">Cancelar</button>
            <button type="submit" class="og-mini-btn og-mini-btn-primary" [disabled]="!canSave()">
              @if (saving()) {
                <app-nx-spinner [size]="12" tone="dark" />
              }
              {{ saving() ? 'Salvando…' : 'Salvar' }}
            </button>
          </div>
        </form>
      }

      @if (feedback(); as f) {
        <p class="og-cfg-feedback" [style.color]="f.ok ? 'var(--nx-win)' : 'var(--nx-live)'">{{ f.message }}</p>
      }
    </og-card>
  `,
  styles: `
    .og-cfg-payout {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-top: 16px;
      padding: 12px 14px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
    }
    .og-cfg-payout-title {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: var(--nx-text-mute);
    }
    .og-cfg-payout-value {
      margin-top: 4px;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
      overflow-wrap: anywhere;
    }
  `,
})
export class OgConfigPagamentosCardComponent {
  readonly uid = input.required<string>();
  readonly payments = input.required<OrganizerPaymentSettings>();
  /** Só leitura — a fonte é `organizerWallets/{uid}`, escrita por Cloud Function no Financeiro. */
  readonly payoutPixKey = input<string>('');
  readonly payoutPixKeyType = input<string>('');
  readonly loading = input(false);

  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly skeletonRows = [1, 2, 3, 4];
  protected readonly pixKeyTypes = PIX_KEY_TYPES;
  protected readonly pixKeyTypeLabel = PIX_KEY_TYPE_LABEL;

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);

  protected readonly form = this.fb.group({
    pixKeyType: 'CPF' as PixKeyType,
    pixKey: '',
    recipientName: '',
    city: '',
  });

  private readonly typeSignal = toSignal(this.form.controls.pixKeyType.valueChanges, { initialValue: 'CPF' as PixKeyType });
  private readonly keySignal = toSignal(this.form.controls.pixKey.valueChanges, { initialValue: '' });
  private readonly nameSignal = toSignal(this.form.controls.recipientName.valueChanges, { initialValue: '' });
  private readonly citySignal = toSignal(this.form.controls.city.valueChanges, { initialValue: '' });

  protected readonly hasKey = computed(() => this.payments().pixKey.trim().length > 0);
  protected readonly keyHint = computed(() => PIX_KEY_TYPE_HINT[this.typeSignal()]);

  protected readonly keyTypeLabel = computed(() => {
    const stored = this.payments().pixKeyType;
    return stored ? PIX_KEY_TYPE_LABEL[stored] : '—';
  });

  protected readonly payoutLabel = computed(() => {
    const key = this.payoutPixKey().trim();
    if (!key) return 'Nenhuma chave de saque cadastrada';
    return `${PIX_KEY_TYPE_LABEL[resolveInitialPixKeyType(this.payoutPixKeyType(), key)]} · ${key}`;
  });

  /** Nome e cidade só viram obrigatórios quando existe chave — o card inteiro pode ficar vazio. */
  protected readonly formError = computed(() => {
    const key = this.keySignal().trim();
    if (!key) return null;
    const keyError = validatePixKeyForType(this.typeSignal(), key);
    if (keyError) return keyError;
    if (!this.nameSignal().trim()) return 'Informe o nome do recebedor (vai no BR Code do Pix).';
    if (!this.citySignal().trim()) return 'Informe a cidade do recebedor (vai no BR Code do Pix).';
    return null;
  });

  protected readonly canSave = computed(() => !this.saving() && this.formError() == null);

  protected startEdit(): void {
    const p = this.payments();
    this.form.setValue({
      pixKeyType: p.pixKeyType || resolveInitialPixKeyType('', p.pixKey),
      pixKey: p.pixKey,
      recipientName: p.recipientName,
      city: p.city,
    });
    this.feedback.set(null);
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
  }

  protected async submit(): Promise<void> {
    if (!this.canSave()) return;
    const raw = this.form.getRawValue();
    const key = raw.pixKey.trim();
    // Chave numérica (CPF/CNPJ/celular) é gravada só com dígitos, como o Financeiro já faz.
    const normalizedKey =
      key && (raw.pixKeyType === 'CPF' || raw.pixKeyType === 'PHONE') ? digitsOnly(key) : key;

    this.saving.set(true);
    this.feedback.set(null);
    try {
      await saveOrganizerPayments(
        this.uid(),
        key
          ? {
              pixKey: normalizedKey,
              pixKeyType: raw.pixKeyType,
              recipientName: raw.recipientName.trim(),
              city: raw.city.trim(),
            }
          : { pixKey: '', pixKeyType: '', recipientName: '', city: '' },
      );
      this.editing.set(false);
      this.feedback.set({ ok: true, message: key ? 'Dados de recebimento salvos.' : 'Dados de recebimento removidos.' });
    } catch (err) {
      const message = err instanceof OrganizerSettingsError ? err.message : 'Não foi possível salvar os pagamentos.';
      this.feedback.set({ ok: false, message });
    } finally {
      this.saving.set(false);
    }
  }
}
