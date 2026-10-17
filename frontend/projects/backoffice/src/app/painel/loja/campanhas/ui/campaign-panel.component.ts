import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { callableErrorMessage } from '../../../data/callable-error';
import { FieldComponent } from '../../../ui/field.component';
import { IconComponent } from '../../../ui/icon.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import { PRODUCT_CATEGORY_LABELS, PRODUCT_COLLECTIONS } from '../../produtos/data/products.repository';
import { CTA_LABEL_MAX, KICKER_MAX, SUBTITLE_MAX, TITLE_MAX, type CampaignBanner } from '../data/campaign';
import {
  emptyCampaignForm,
  formFromBanner,
  previewBanner,
  validateCampaignForm,
  type CampaignForm,
  type CampaignFormErrors,
  type SecondaryKind,
} from '../data/campaign-form';
import { CampaignsRepository } from '../data/campaigns.repository';

export type CampaignPanelMode =
  | { kind: 'new' }
  | { kind: 'edit'; banner: CampaignBanner }
  | { kind: 'duplicate'; banner: CampaignBanner };

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** O que a foto tem de errado para subir, ou `null`. Mesmo limite da rule do Storage. */
export function imageFileError(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return 'Use JPG, PNG ou WebP.';
  }
  return file.size >= IMAGE_MAX_BYTES ? 'A foto passa de 10 MB.' : null;
}

/**
 * Painel lateral "Nova campanha" / edição. Recriado a cada abertura: o form nasce do `mode`.
 * Não grava: emite o banner e a tela salva a lista inteira (a ordem é da lista).
 */
@Component({
  selector: 'bo-campaign-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldComponent, IconComponent, ToggleComponent],
  template: `
    <aside class="panel" aria-labelledby="campaign-panel-title">
      <header class="head">
        <h2 id="campaign-panel-title">{{ title() }}</h2>
        <button type="button" class="close" aria-label="Fechar" [disabled]="saving()" (click)="closed.emit()">✕</button>
      </header>

      <div class="body">
        <div class="photo-field">
          <span class="label">Foto</span>
          <div
            class="photo"
            [class.has-image]="form().imageUrl"
            (dragover)="$event.preventDefault()"
            (drop)="onDrop($event)"
          >
            @if (form().imageUrl; as img) {
              <img [src]="img" alt="Foto da campanha" />
            }
            @if (uploadProgress() !== null) {
              <div class="bar" aria-label="Enviando foto"><span [style.width.%]="uploadProgress()"></span></div>
            } @else {
              <div class="photo-actions">
                <label class="bo-mini-btn">
                  <bo-icon name="camera" [size]="13" />
                  {{ form().imageUrl ? 'Trocar' : 'Escolher foto' }}
                  <input type="file" hidden accept="image/jpeg,image/png,image/webp" [disabled]="saving()" (change)="onPick($event)" />
                </label>
                @if (form().imageUrl) {
                  <button type="button" class="bo-mini-btn" [disabled]="saving()" (click)="patch({ imageUrl: null })">Remover</button>
                }
              </div>
            }
          </div>
          <span class="hint" [class.err]="uploadError()">
            {{ uploadError() || 'JPG, PNG ou WebP · até 10 MB · horizontal, assunto no centro (o app corta as bordas). Sem foto, a vitrine usa o fundo da marca.' }}
          </span>
        </div>

        <bo-field label="Chamada" [hint]="errors().kicker ?? 'Opcional · linha laranja acima do título'">
          <input
            class="bo-input"
            placeholder="COLEÇÃO VERÃO 26"
            [attr.maxlength]="kickerMax"
            [class.invalid]="errors().kicker"
            [value]="form().kicker"
            (input)="patch({ kicker: text($event) })"
          />
        </bo-field>

        <bo-field label="Título" [hint]="errors().title ?? ''">
          <span class="counted">
            <input
              class="bo-input"
              [attr.maxlength]="titleMax"
              [class.invalid]="errors().title"
              [value]="form().title"
              (input)="patch({ title: text($event) })"
            />
            <span class="count" [class.near]="form().title.length > titleMax - 6" aria-live="polite">
              {{ form().title.length }}/{{ titleMax }}
            </span>
          </span>
        </bo-field>

        <bo-field label="Subtítulo" [hint]="errors().subtitle ?? 'Opcional · só aparece na web'">
          <span class="counted">
            <textarea
              class="bo-input area"
              rows="2"
              [attr.maxlength]="subtitleMax"
              [class.invalid]="errors().subtitle"
              [value]="form().subtitle"
              (input)="patch({ subtitle: text($event) })"
            ></textarea>
            <span class="count" [class.near]="form().subtitle.length > subtitleMax - 10" aria-live="polite">
              {{ form().subtitle.length }}/{{ subtitleMax }}
            </span>
          </span>
        </bo-field>

        <div class="group">
          <span class="group-title">Botão principal</span>
          <div class="two">
            <bo-field label="Texto" [hint]="errors().primaryLabel ?? ''">
              <input
                class="bo-input"
                [attr.maxlength]="ctaMax"
                [class.invalid]="errors().primaryLabel"
                [value]="form().primaryLabel"
                (input)="patch({ primaryLabel: text($event) })"
              />
            </bo-field>
            <bo-field label="Abre a coleção" [hint]="errors().collectionId ?? ''">
              <select class="bo-select" (change)="patch({ collectionId: text($event) })">
                @for (c of collections; track c.id) {
                  <option [value]="c.id" [selected]="form().collectionId === c.id">{{ c.label }}</option>
                }
              </select>
            </bo-field>
          </div>
        </div>

        <div class="group">
          <span class="group-title">Botão secundário <span class="dim">· só na web</span></span>
          <div class="segmented" role="radiogroup" aria-label="Botão secundário">
            @for (k of secondaryKinds; track k.id) {
              <button
                type="button"
                role="radio"
                [attr.aria-checked]="form().secondaryKind === k.id"
                [class.on]="form().secondaryKind === k.id"
                (click)="setSecondaryKind(k.id)"
              >
                {{ k.label }}
              </button>
            }
          </div>
          @if (form().secondaryKind !== 'none') {
            <div class="two">
              <bo-field label="Texto" [hint]="errors().secondaryLabel ?? ''">
                <input
                  class="bo-input"
                  [attr.maxlength]="ctaMax"
                  [class.invalid]="errors().secondaryLabel"
                  [value]="form().secondaryLabel"
                  (input)="patch({ secondaryLabel: text($event) })"
                />
              </bo-field>
              @if (form().secondaryKind === 'category') {
                <bo-field label="Abre a categoria" [hint]="errors().categoryId ?? ''">
                  <select class="bo-select" (change)="patch({ categoryId: text($event) })">
                    <option value="" [selected]="!form().categoryId">Escolha…</option>
                    @for (c of categories; track c.id) {
                      <option [value]="c.id" [selected]="form().categoryId === c.id">{{ c.label }}</option>
                    }
                  </select>
                </bo-field>
              } @else {
                <bo-field label="Link" [hint]="errors().url ?? '/caminho do portal ou https://'">
                  <input
                    class="bo-input mono"
                    placeholder="/torneios"
                    inputmode="url"
                    [class.invalid]="errors().url"
                    [value]="form().url"
                    (input)="patch({ url: text($event) })"
                  />
                </bo-field>
              }
            </div>
          }
        </div>

        <div class="two">
          <bo-field label="Início" [hint]="errors().startDate ?? 'Vazio = já no ar'">
            <input class="bo-input mono" type="date" [value]="form().startDate" (input)="patch({ startDate: text($event) })" />
          </bo-field>
          <bo-field label="Fim" [hint]="errors().endDate ?? 'Vazio = sem prazo'">
            <input class="bo-input mono" type="date" [class.invalid]="errors().endDate" [value]="form().endDate" (input)="patch({ endDate: text($event) })" />
          </bo-field>
        </div>
        <p class="note">Datas de São Paulo, inclusivas: entra no ar às 0h do início e sai no fim do último dia.</p>

        <div class="toggle-row">
          <span>
            Ativa
            <span class="dim">· pausada fica guardada, fora da vitrine</span>
          </span>
          <bo-toggle ariaLabel="Campanha ativa" [checked]="form().active" (checkedChange)="patch({ active: $event })" />
        </div>

        @if (serverError(); as err) {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ err }}</span></div>
        }
      </div>

      <footer class="foot">
        <button type="button" class="bo-ghost-btn" [disabled]="saving()" (click)="closed.emit()">Cancelar</button>
        <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="saving() || uploadProgress() !== null" (click)="submit()">
          {{ saving() ? 'Salvando…' : mode().kind === 'edit' ? 'Salvar' : 'Criar campanha' }}
        </button>
      </footer>
    </aside>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .panel { position: sticky; top: 20px; display: flex; flex-direction: column; max-height: calc(100vh - 120px); background: var(--nx-surface-0); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-4); box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45); }
    .head { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--nx-line); }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .close { flex: none; width: 28px; height: 28px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; }
    .close:hover { background: var(--nx-surface-1); color: var(--nx-text); }
    .body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
    .foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--nx-line); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .mono { font-family: var(--nx-font-mono); letter-spacing: 0.02em; }
    .bo-input.invalid { border-color: rgba(255, 59, 48, 0.6); }
    .area { height: auto; padding: 10px 13px; line-height: 1.45; resize: vertical; }

    .label, .group-title { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .group { display: flex; flex-direction: column; gap: 10px; padding-top: 12px; border-top: 1px solid var(--nx-line); }
    .dim { color: var(--nx-text-dim); font-weight: 400; text-transform: none; letter-spacing: 0; font-family: var(--nx-font-ui); font-size: 11.5px; }
    .group-title .dim { font-size: 10.5px; }

    .photo-field { display: flex; flex-direction: column; gap: 8px; }
    .photo { position: relative; height: 150px; border: 1px dashed var(--nx-line-strong); border-radius: var(--nx-r-3); overflow: hidden; display: grid; place-items: center; background-color: #16120f; background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0 9px, transparent 9px 18px); }
    .photo.has-image { border-style: solid; border-color: var(--nx-line); }
    .photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .photo-actions { position: relative; display: flex; gap: 8px; }
    .photo.has-image .photo-actions { position: absolute; right: 10px; bottom: 10px; }
    .photo-actions .bo-mini-btn { background: rgba(11, 11, 12, 0.85); cursor: pointer; }
    .bar { position: absolute; left: 16px; right: 16px; bottom: 16px; height: 4px; border-radius: var(--nx-r-pill); background: rgba(255, 255, 255, 0.15); overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--nx-orange-500); transition: width 120ms linear; }
    .hint { font-size: 11px; line-height: 1.35; color: var(--nx-text-dim); }
    .hint.err { color: var(--nx-live); }

    .counted { position: relative; display: block; }
    .counted .bo-input { padding-right: 58px; }
    .count { position: absolute; right: 12px; top: 13px; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); pointer-events: none; }
    .count.near { color: var(--nx-orange-500); }

    .segmented { display: grid; grid-template-columns: repeat(3, 1fr); padding: 3px; gap: 3px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .segmented button { height: 32px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .segmented button.on { background: var(--nx-surface-0); color: var(--nx-text); }

    .note { margin: -4px 0 0; font-size: 11px; line-height: 1.35; color: var(--nx-text-dim); }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 12px; border-top: 1px solid var(--nx-line); font-size: 13px; color: var(--nx-text); }
  `,
})
export class CampaignPanelComponent implements OnInit {
  private readonly repository = inject(CampaignsRepository);

  readonly mode = input.required<CampaignPanelMode>();
  readonly saving = input(false);
  readonly serverError = input('');

  readonly closed = output<void>();
  /** Banner validado; `id` vazio = novo (a tela gera a partir do título). */
  readonly submitted = output<CampaignBanner>();
  /** A cada mudança, o banner da prévia. */
  readonly draftChange = output<CampaignBanner>();

  protected readonly titleMax = TITLE_MAX;
  protected readonly subtitleMax = SUBTITLE_MAX;
  protected readonly kickerMax = KICKER_MAX;
  protected readonly ctaMax = CTA_LABEL_MAX;
  protected readonly collections = PRODUCT_COLLECTIONS;
  protected readonly categories = Object.entries(PRODUCT_CATEGORY_LABELS).map(([id, label]) => ({ id, label }));
  protected readonly secondaryKinds: ReadonlyArray<{ id: SecondaryKind; label: string }> = [
    { id: 'none', label: 'Nenhum' },
    { id: 'category', label: 'Categoria' },
    { id: 'url', label: 'Link' },
  ];

  protected readonly form = signal<CampaignForm>(emptyCampaignForm());
  protected readonly errors = signal<CampaignFormErrors>({});
  protected readonly uploadProgress = signal<number | null>(null);
  protected readonly uploadError = signal('');

  protected readonly title = computed(() => {
    const m = this.mode();
    return m.kind === 'edit' ? `Editar ${m.banner.title}` : m.kind === 'duplicate' ? 'Duplicar campanha' : 'Nova campanha';
  });

  ngOnInit(): void {
    const m = this.mode();
    // A cópia nasce pausada: duas iguais no ar não é o que ninguém quer.
    this.form.set(m.kind === 'new' ? emptyCampaignForm() : { ...formFromBanner(m.banner), active: m.kind === 'edit' && m.banner.active });
    this.draftChange.emit(previewBanner(this.form()));
  }

  protected patch(patch: Partial<CampaignForm>): void {
    this.form.update((f) => ({ ...f, ...patch }));
    const keys = Object.keys(patch);
    this.errors.update((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))));
    this.draftChange.emit(previewBanner(this.form()));
  }

  protected setSecondaryKind(kind: SecondaryKind): void {
    if (kind !== this.form().secondaryKind) {
      this.patch({ secondaryKind: kind, categoryId: '', url: '' });
    }
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      void this.upload(file);
    }
  }

  protected onDrop(event: DragEvent): void {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      event.preventDefault();
      void this.upload(file);
    }
  }

  private async upload(file: File): Promise<void> {
    if (this.uploadProgress() !== null) {
      return;
    }
    const problem = imageFileError(file);
    this.uploadError.set(problem ?? '');
    if (problem) {
      return;
    }
    this.uploadProgress.set(0);
    try {
      const url = await this.repository.uploadImage(file, (p) => this.uploadProgress.set(p));
      this.patch({ imageUrl: url });
    } catch (error) {
      this.uploadError.set(`Não foi possível enviar a foto. ${callableErrorMessage(error)}`);
    } finally {
      this.uploadProgress.set(null);
    }
  }

  protected submit(): void {
    if (this.saving() || this.uploadProgress() !== null) {
      return;
    }
    const m = this.mode();
    const result = validateCampaignForm(this.form(), m.kind === 'edit' ? m.banner.id : '');
    if (!result.ok) {
      this.errors.set(result.errors);
      return;
    }
    this.submitted.emit(result.banner);
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
