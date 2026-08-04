import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../auth/auth.service';
import { BrLocationsService } from '../../shared/br-locations/br-locations.service';
import { NxSkeletonComponent } from '../../shared/loading/nx-skeleton.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import {
  OrganizerSettingsError,
  saveOrganizerProfile,
  uploadOrganizerLogo,
  validateLogoFile,
} from '../data/organizer-settings-repository';
import type { OrganizerProfile } from '../data/organizer-settings.model';
import { OgCardComponent } from '../ui/card.component';
import { OgFormFieldComponent } from '../ui/form-field.component';
import { OgIconComponent } from '../ui/icon.component';

function digitsOnly(v: string): string {
  return v.replace(/\D/g, '');
}

/** `(62) 99985-3983` / `(62) 3251-4477` — só para exibir; o que é gravado são os dígitos. */
export function formatPhoneDisplay(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Card "Organização" de `/painel/config`: dados da organização (mapa `organizerProfile`) mais o
 *  responsável, que é o `displayName` de topo do doc — o mesmo do Firebase Auth, por isso salvar
 *  atualiza os dois lados. */
@Component({
  selector: 'og-config-perfil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OgCardComponent,
    OgIconComponent,
    OgFormFieldComponent,
    ReactiveFormsModule,
    NxSkeletonComponent,
    NxSpinnerComponent,
  ],
  template: `
    <og-card title="Organização" kicker="Perfil">
      @if (!editing() && !loading()) {
        <button card-action type="button" class="og-ghost-btn" (click)="startEdit()">
          <og-icon name="edit" [size]="13" />Editar
        </button>
      }

      @if (loading()) {
        @for (i of skeletonRows; track i) {
          <div class="og-config-row" [class.last]="i === 5"><app-nx-skeleton w="34%" [h]="13" /><app-nx-skeleton w="42%" [h]="13" /></div>
        }
      } @else if (!editing()) {
        <div class="og-cfg-identity">
          @if (profile().logoUrl; as url) {
            <img class="og-cfg-logo" [src]="url" alt="Logo da organização" />
          } @else {
            <span class="og-cfg-logo og-cfg-logo-empty">{{ initials() }}</span>
          }
          <div class="og-cfg-identity-text">
            <div class="og-cfg-orgname">{{ profile().orgName || 'Sem nome definido' }}</div>
            <div class="og-cfg-orgmeta">{{ locationLabel() }}</div>
          </div>
        </div>
        <div class="og-config-row"><span class="lbl">Responsável</span><span class="val">{{ responsavel() || '—' }}</span></div>
        <div class="og-config-row"><span class="lbl">E-mail de contato</span><span class="val">{{ profile().contactEmail || accountEmail() || '—' }}</span></div>
        <div class="og-config-row last"><span class="lbl">WhatsApp</span><span class="val">{{ phoneLabel() }}</span></div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()">
          <div class="og-cfg-logo-edit">
            @if (logoUrl(); as url) {
              <img class="og-cfg-logo" [src]="url" alt="Logo da organização" />
            } @else {
              <span class="og-cfg-logo og-cfg-logo-empty">{{ initials() }}</span>
            }
            <div class="og-cfg-logo-actions">
              <button type="button" class="og-ghost-btn" [disabled]="logoUploading()" (click)="logoInput.click()">
                @if (logoUploading()) {
                  <app-nx-spinner [size]="12" />
                }
                {{ logoUploading() ? 'Enviando…' : logoUrl() ? 'Trocar logo' : 'Enviar logo' }}
              </button>
              @if (logoUrl()) {
                <button type="button" class="og-ghost-btn" [disabled]="logoUploading()" (click)="removeLogo()">Remover</button>
              }
              <input #logoInput type="file" accept="image/*" hidden (change)="onLogoPicked($event)" />
            </div>
          </div>
          @if (logoError(); as e) {
            <p class="og-cfg-error">{{ e }}</p>
          }

          <div class="og-field-grid" style="margin-top:16px">
            <og-form-field label="Nome da organização">
              <input class="og-input-el" type="text" formControlName="orgName" placeholder="Liga Amadora Goiânia" />
            </og-form-field>
            <og-form-field label="Responsável">
              <input class="og-input-el" type="text" formControlName="displayName" placeholder="Nome de quem responde" />
            </og-form-field>
            <og-form-field label="E-mail de contato">
              <input class="og-input-el" type="email" formControlName="contactEmail" autocomplete="off" [placeholder]="accountEmail() || 'contato@suaorganizacao.com'" />
            </og-form-field>
            <og-form-field label="WhatsApp">
              <input class="og-input-el" type="tel" inputmode="numeric" formControlName="contactPhone" placeholder="(62) 99999-9999" />
            </og-form-field>
            <og-form-field label="Estado">
              <select class="og-select-el" formControlName="state" (change)="onStateChange()">
                <option value="">Selecione</option>
                @for (s of brLocations.states; track s.sigla) {
                  <option [value]="s.sigla">{{ s.name }} ({{ s.sigla }})</option>
                }
              </select>
            </og-form-field>
            <og-form-field label="Cidade">
              <select class="og-select-el" formControlName="city" [disabled]="!stateValue()">
                <option value="">{{ !stateValue() ? 'Selecione a UF primeiro' : brLocations.loaded() ? 'Selecione' : 'Carregando…' }}</option>
                @for (c of cities(); track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
            </og-form-field>
          </div>

          @if (fieldError(); as err) {
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
    .og-cfg-identity,
    .og-cfg-logo-edit {
      display: flex;
      align-items: center;
      gap: 14px;
      padding-bottom: 13px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-cfg-logo-edit {
      border-bottom: none;
      padding-bottom: 0;
    }
    .og-cfg-logo {
      width: 52px;
      height: 52px;
      flex: none;
      border-radius: var(--nx-r-3);
      object-fit: cover;
      border: 1px solid var(--nx-line);
    }
    .og-cfg-logo-empty {
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 17px;
      color: var(--nx-text-dim);
    }
    .og-cfg-identity-text {
      min-width: 0;
    }
    .og-cfg-orgname {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .og-cfg-orgmeta {
      margin-top: 3px;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
    .og-cfg-logo-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
  `,
})
export class OgConfigPerfilCardComponent {
  readonly uid = input.required<string>();
  readonly profile = input.required<OrganizerProfile>();
  readonly responsavel = input<string>('');
  readonly accountEmail = input<string>('');
  readonly loading = input(false);

  protected readonly brLocations = inject(BrLocationsService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly skeletonRows = [1, 2, 3, 4, 5];
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly logoUploading = signal(false);
  protected readonly logoError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    orgName: ['', [Validators.required, Validators.minLength(2)]],
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    contactEmail: [''],
    contactPhone: [''],
    state: [''],
    city: [''],
  });

  private readonly stateSignal = toSignal(this.form.controls.state.valueChanges, { initialValue: '' });
  private readonly emailSignal = toSignal(this.form.controls.contactEmail.valueChanges, { initialValue: '' });
  private readonly phoneSignal = toSignal(this.form.controls.contactPhone.valueChanges, { initialValue: '' });

  protected readonly stateValue = computed(() => this.stateSignal());
  protected readonly cities = computed(() => this.brLocations.citiesFor(this.stateSignal()));
  protected readonly initials = computed(() => initialsOf(this.profile().orgName || this.responsavel()));
  protected readonly phoneLabel = computed(() =>
    this.profile().contactPhone ? formatPhoneDisplay(this.profile().contactPhone) : '—',
  );

  protected readonly locationLabel = computed(() => {
    const p = this.profile();
    if (p.city && p.state) return `${p.city} · ${p.state}`;
    return p.city || p.state || 'Cidade não informada';
  });

  /** E-mail e telefone são opcionais, mas se preenchidos têm que estar certos. */
  protected readonly fieldError = computed(() => {
    const email = this.emailSignal().trim();
    if (email && !(email.includes('@') && email.length >= 5)) return 'E-mail de contato inválido.';
    const phone = digitsOnly(this.phoneSignal());
    if (phone && (phone.length < 10 || phone.length > 11)) return 'WhatsApp com DDD: 10 ou 11 dígitos.';
    return null;
  });

  protected readonly canSave = computed(() => !this.saving() && !this.logoUploading() && this.fieldError() == null);

  protected startEdit(): void {
    const p = this.profile();
    this.form.setValue({
      orgName: p.orgName,
      displayName: this.responsavel(),
      contactEmail: p.contactEmail,
      contactPhone: p.contactPhone ? formatPhoneDisplay(p.contactPhone) : '',
      state: p.state,
      city: p.city,
    });
    this.logoUrl.set(p.logoUrl);
    this.logoError.set(null);
    this.feedback.set(null);
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
    this.logoError.set(null);
  }

  protected onStateChange(): void {
    this.form.controls.city.setValue('');
  }

  protected async onLogoPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const invalid = validateLogoFile(file);
    if (invalid) {
      this.logoError.set(invalid);
      return;
    }
    this.logoError.set(null);
    this.logoUploading.set(true);
    try {
      this.logoUrl.set(await uploadOrganizerLogo(this.uid(), file));
    } catch {
      this.logoError.set('Não foi possível enviar a imagem. Tente novamente.');
    } finally {
      this.logoUploading.set(false);
    }
  }

  protected removeLogo(): void {
    this.logoUrl.set(null);
  }

  protected async submit(): Promise<void> {
    if (!this.canSave()) return;
    const raw = this.form.getRawValue();
    const orgName = raw.orgName.trim();
    const displayName = raw.displayName.trim();
    if (orgName.length < 2 || displayName.length < 2) {
      this.feedback.set({ ok: false, message: 'Nome da organização e responsável são obrigatórios.' });
      return;
    }

    this.saving.set(true);
    this.feedback.set(null);
    try {
      await saveOrganizerProfile(
        this.uid(),
        {
          orgName,
          contactEmail: raw.contactEmail.trim(),
          contactPhone: digitsOnly(raw.contactPhone),
          city: raw.city.trim(),
          state: raw.state.trim().toUpperCase(),
          logoUrl: this.logoUrl(),
        },
        displayName,
      );
      // Só depois do Firestore aceitar: se o write falhar, o nome do Auth não pode ter mudado.
      await this.auth.updateDisplayName(displayName);
      this.editing.set(false);
      this.feedback.set({ ok: true, message: 'Perfil atualizado.' });
    } catch (err) {
      const message = err instanceof OrganizerSettingsError ? err.message : 'Não foi possível salvar o perfil.';
      this.feedback.set({ ok: false, message });
    } finally {
      this.saving.set(false);
    }
  }
}
