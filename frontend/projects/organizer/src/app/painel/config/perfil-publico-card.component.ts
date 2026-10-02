import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { NxSkeletonComponent } from '../../shared/loading/nx-skeleton.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import {
  ORGANIZER_BIO_MAX,
  buildOrganizerPublicProfilePatch,
  hasUsableContactPhone,
  organizerPublicProfileUrl,
  validateCoverFile,
  type OrganizerPublicProfileSettings,
} from '../data/organizer-public-profile';
import { OgCardComponent } from '../ui/card.component';
import { OgFormFieldComponent } from '../ui/form-field.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgToggleRowComponent } from '../ui/toggle-row.component';
import { formatPhoneDisplay } from './perfil-card.component';
import { OrganizerPublicProfileGateway } from './perfil-publico.gateway';

/** Capa escolhida e já redimensionada, ainda não enviada: sobe só no Salvar. */
interface PendingCover {
  jpeg: Blob;
  previewUrl: string;
}

/** Card "Perfil público" de `/painel/config`: capa, bio e o opt-in do botão de WhatsApp que o
 *  atleta vê em `/organizadores/{uid}` no portal dele. Nome, logo, cidade e telefone continuam
 *  no card "Perfil"; o servidor junta tudo em `organizerPublicProfiles/{uid}`.
 *
 *  Grava SÓ os três campos dele, por caminho pontilhado (ver `organizer-public-profile.ts`).
 *
 *  A capa sobe no Salvar, não na escolha: o arquivo tem caminho fixo no Storage, e reenviá-lo
 *  troca o token da URL de download. Subir na escolha e depois cancelar deixaria o doc
 *  apontando para uma URL que não abre mais. */
@Component({
  selector: 'og-config-perfil-publico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OgCardComponent,
    OgIconComponent,
    OgFormFieldComponent,
    OgToggleRowComponent,
    ReactiveFormsModule,
    NxSkeletonComponent,
    NxSpinnerComponent,
  ],
  template: `
    <og-card title="Perfil público" kicker="Vitrine">
      @if (!editing() && !loading()) {
        <button card-action type="button" class="og-ghost-btn" (click)="startEdit()">
          <og-icon name="edit" [size]="13" />Editar
        </button>
      }

      @if (loading()) {
        <app-nx-skeleton class="og-pp-cover-skel" w="100%" h="auto" r="10px" />
        <div class="og-config-row"><app-nx-skeleton w="70%" [h]="13" /></div>
        <div class="og-config-row last"><app-nx-skeleton w="38%" [h]="13" /><app-nx-skeleton w="20%" [h]="13" /></div>
      } @else if (!editing()) {
        <div class="og-pp-cover">
          @if (publicProfile().coverUrl; as url) {
            <img [src]="url" alt="Capa do perfil público" />
          } @else {
            <span class="og-pp-cover-empty">Sem capa</span>
          }
        </div>
        <p class="og-pp-bio" [class.empty]="!publicProfile().bio">
          {{ publicProfile().bio || 'Sem bio. Conte em poucas linhas quem organiza os seus eventos.' }}
        </p>
        <div class="og-config-row">
          <span class="lbl">Botão de WhatsApp</span>
          <span class="val">{{ whatsappStatus() }}</span>
        </div>
        <div class="og-config-row last">
          <span class="lbl">Página pública</span>
          <a class="og-pp-link" [href]="publicUrl()" target="_blank" rel="noopener">
            Ver meu perfil público<og-icon name="share" [size]="13" />
          </a>
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()">
          <div class="og-pp-cover">
            @if (coverPreview(); as url) {
              <img [src]="url" alt="Prévia da capa" />
            } @else {
              <span class="og-pp-cover-empty">Sem capa</span>
            }
            @if (coverPreparing()) {
              <span class="og-pp-cover-busy"><app-nx-spinner [size]="20" /></span>
            }
          </div>
          <div class="og-pp-cover-actions">
            <button type="button" class="og-ghost-btn" [disabled]="coverPreparing() || saving()" (click)="coverInput.click()">
              {{ coverPreparing() ? 'Preparando…' : coverPreview() ? 'Trocar capa' : 'Enviar capa' }}
            </button>
            @if (coverPreview()) {
              <button type="button" class="og-ghost-btn" [disabled]="coverPreparing() || saving()" (click)="removeCover()">
                Remover capa
              </button>
            }
            <input #coverInput type="file" accept="image/*" hidden (change)="onCoverPicked($event)" />
          </div>
          <p class="og-cfg-hint">Imagem de até 5 MB, na proporção 4:1 (por exemplo, 1600 × 400).</p>
          @if (coverError(); as e) {
            <p class="og-cfg-error og-pp-cover-error">{{ e }}</p>
          }

          <og-form-field label="Bio">
            <textarea
              class="og-textarea-el"
              rows="4"
              formControlName="bio"
              [attr.maxlength]="bioMax"
              placeholder="Quem organiza, onde e com que frequência. Ex.: torneios de vôlei de praia em Goiânia, uma etapa por mês."
            ></textarea>
          </og-form-field>
          <div class="og-pp-counter" [class.full]="bioLength() >= bioMax">{{ bioLength() }}/{{ bioMax }}</div>

          <og-toggle-row
            title="Mostrar botão de WhatsApp no meu perfil"
            [desc]="whatsappHint()"
            [on]="whatsappOn()"
            [disabled]="!hasPhone()"
            (toggled)="publicWhatsapp.set($event)"
          />

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
    .og-pp-cover,
    .og-pp-cover-skel {
      aspect-ratio: 4 / 1;
    }
    .og-pp-cover {
      position: relative;
      width: 100%;
      overflow: hidden;
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line);
      background: linear-gradient(135deg, var(--nx-surface-1), var(--nx-surface-0));
    }
    .og-pp-cover img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .og-pp-cover-empty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
    .og-pp-cover-busy {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgba(0, 0, 0, 0.45);
    }
    .og-pp-cover-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0 4px;
    }
    .og-pp-cover-error {
      margin: -6px 0 12px;
    }
    .og-pp-bio {
      margin: 14px 0 0;
      padding-bottom: 13px;
      border-bottom: 1px solid var(--nx-line);
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text);
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .og-pp-bio.empty {
      color: var(--nx-text-dim);
    }
    .og-pp-link {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-orange-500);
      text-decoration: none;
    }
    .og-pp-link:hover {
      text-decoration: underline;
    }
    .og-pp-counter {
      margin: 6px 0 4px;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .og-pp-counter.full {
      color: var(--nx-orange-500);
    }
  `,
})
export class OgConfigPerfilPublicoCardComponent {
  readonly uid = input.required<string>();
  readonly publicProfile = input.required<OrganizerPublicProfileSettings>();
  /** `organizerProfile.contactPhone`, editado no card "Perfil". */
  readonly contactPhone = input<string>('');
  readonly loading = input(false);

  private readonly gateway = inject(OrganizerPublicProfileGateway);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly bioMax = ORGANIZER_BIO_MAX;
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  /** URL já gravada que segue valendo no rascunho; `null` = sem capa ou removida. */
  protected readonly coverUrl = signal<string | null>(null);
  protected readonly pendingCover = signal<PendingCover | null>(null);
  protected readonly coverPreparing = signal(false);
  protected readonly coverError = signal<string | null>(null);
  protected readonly publicWhatsapp = signal(false);

  protected readonly form = this.fb.group({ bio: [''] });
  private readonly bioValue = toSignal(this.form.controls.bio.valueChanges, { initialValue: '' });

  protected readonly bioLength = computed(() => this.bioValue().length);
  protected readonly coverPreview = computed(() => this.pendingCover()?.previewUrl ?? this.coverUrl());
  protected readonly hasPhone = computed(() => hasUsableContactPhone(this.contactPhone()));
  /** Sem telefone o switch aparece desligado — e é isso que o Salvar grava. */
  protected readonly whatsappOn = computed(() => this.hasPhone() && this.publicWhatsapp());
  protected readonly whatsappHint = computed(() =>
    this.hasPhone()
      ? `Abre conversa no ${formatPhoneDisplay(this.contactPhone())}, o telefone de contato do card Perfil.`
      : 'Preencha o telefone de contato no card Perfil',
  );
  protected readonly whatsappStatus = computed(() => {
    if (!this.publicProfile().publicWhatsapp) return 'Oculto';
    return this.hasPhone() ? 'Visível' : 'Oculto · sem telefone de contato';
  });
  protected readonly publicUrl = computed(() => organizerPublicProfileUrl(environment.athleteAppUrl, this.uid()));
  protected readonly canSave = computed(() => !this.saving() && !this.coverPreparing());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.discardPendingCover());
  }

  protected startEdit(): void {
    const p = this.publicProfile();
    this.form.setValue({ bio: p.bio });
    this.coverUrl.set(p.coverUrl);
    this.publicWhatsapp.set(p.publicWhatsapp);
    this.discardPendingCover();
    this.coverError.set(null);
    this.feedback.set(null);
    this.editing.set(true);
  }

  protected cancel(): void {
    this.discardPendingCover();
    this.coverError.set(null);
    this.editing.set(false);
  }

  protected async onCoverPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const invalid = validateCoverFile(file);
    if (invalid) {
      this.coverError.set(invalid);
      return;
    }
    this.coverError.set(null);
    this.coverPreparing.set(true);
    try {
      const jpeg = await this.gateway.prepareCover(file);
      this.discardPendingCover();
      this.pendingCover.set({ jpeg, previewUrl: URL.createObjectURL(jpeg) });
    } catch (err) {
      console.warn('Perfil público: falha ao preparar a capa', err);
      this.coverError.set('Não foi possível ler a imagem. Tente outro arquivo.');
    } finally {
      this.coverPreparing.set(false);
    }
  }

  protected removeCover(): void {
    this.discardPendingCover();
    this.coverUrl.set(null);
  }

  protected async submit(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.feedback.set(null);
    try {
      const pending = this.pendingCover();
      if (pending) {
        try {
          const url = await this.gateway.uploadCover(this.uid(), pending.jpeg);
          // A URL antiga deixou de abrir com o reenvio; uma nova tentativa grava esta.
          this.coverUrl.set(url);
          this.discardPendingCover();
        } catch (err) {
          console.warn('Perfil público: falha ao enviar a capa', err);
          this.feedback.set({ ok: false, message: 'Não foi possível enviar a capa. Tente novamente.' });
          return;
        }
      }

      const patch = buildOrganizerPublicProfilePatch(
        { bio: this.form.controls.bio.value, coverUrl: this.coverUrl(), publicWhatsapp: this.publicWhatsapp() },
        { hasContactPhone: this.hasPhone() },
      );
      await this.gateway.save(this.uid(), patch);
      this.editing.set(false);
      this.feedback.set({ ok: true, message: 'Perfil público atualizado.' });
    } catch (err) {
      console.warn('Perfil público: falha ao salvar', err);
      this.feedback.set({ ok: false, message: 'Não foi possível salvar o perfil público. Tente novamente.' });
    } finally {
      this.saving.set(false);
    }
  }

  private discardPendingCover(): void {
    const pending = this.pendingCover();
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    this.pendingCover.set(null);
  }
}
