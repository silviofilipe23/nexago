import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FieldComponent } from '../../ui/field.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { ToggleComponent } from '../../ui/toggle.component';
import { clubErrorMessage } from '../data/club-errors';
import { ClubRepository } from '../data/club.repository';
import type { PartnerForm, PartnerFormErrors, PartnerFormField } from '../data/partner';
import {
  LEVEL_CHOICES,
  LOCATIONS_MAX,
  PLACEMENTS,
  PLACEMENT_LABELS,
  REQUIREMENT_LABELS,
  REQUIREMENT_LABEL_MAX,
  REQUIREMENT_TYPES,
  TERMS_TAGS,
  TERMS_TAG_LABELS,
  aspectDrift,
  coverFileError,
  defaultRequirementLabel,
  emptyLocation,
  locationErrors,
  requirementPayload,
  type LocationForm,
  type PartnerPlacement,
  type PartnerTermsTag,
  type RequirementType,
} from '../data/partner-premium';
import { TournamentPickerComponent } from './tournament-picker.component';

/** Acima disto a capa não é 16:9 e o app corta as bordas. */
const ASPECT_TOLERANCE = 0.05;

/**
 * Seções da versão premium no editor do parceiro: vitrine (capa, destaque, validade, onde
 * aparece), termos em chips, lugares e quem pode usar. O editor é dono do form; aqui só se emite
 * `patch`. A capa sobe daqui direto para o Storage.
 */
@Component({
  selector: 'bo-partner-premium-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, FieldComponent, IconComponent, ToggleComponent, TournamentPickerComponent],
  template: `
    <bo-panel-card title="Vitrine">
      <div class="stack">
        <div class="fld">
          <span class="lbl">Foto de capa (16:9)</span>
          <div class="cover-row">
            <div class="cover" [style.background]="f().brandColor">
              @if (f().coverUrl; as url) {
                <img [src]="url" alt="Prévia da capa" />
              } @else {
                <span>Sem capa: o app usa a cor da marca</span>
              }
            </div>
            <div class="cover-actions">
              <label class="bo-mini-btn file" [class.disabled]="disabled() || uploadPercent() !== null">
                <input type="file" accept="image/jpeg,image/webp,image/png" [disabled]="disabled() || uploadPercent() !== null" (change)="onCover($event)" />
                {{ f().coverUrl ? 'Trocar capa' : 'Enviar capa' }}
              </label>
              @if (f().coverUrl) {
                <button type="button" class="bo-ghost-btn" [disabled]="disabled()" (click)="patch.emit({ coverUrl: null })">Remover</button>
              }
            </div>
          </div>
          @if (uploadPercent() !== null) {
            <span class="hint">Enviando… {{ uploadPercent() }}%</span>
          } @else if (coverError() || errors().coverUrl; as e) {
            <span class="err">{{ e }}</span>
          } @else if (aspectWarning()) {
            <span class="warn">{{ aspectWarning() }}</span>
          } @else {
            <span class="hint">JPG ou WebP até 2 MB, 1600×900 de preferência. Aparece no card da vitrine e no topo da tela do parceiro.</span>
          }
        </div>

        <div class="g2">
          <bo-field label="Começa em" hint="Antes disso o parceiro não aparece. Vazio = já.">
            <input type="date" class="bo-input" [class.invalid]="errors().startsAt" [value]="f().startsAt" (input)="patch.emit({ startsAt: value($event) })" (blur)="touch.emit('startsAt')" />
            @if (errors().startsAt; as e) {
              <span class="err">{{ e }}</span>
            }
          </bo-field>
          <bo-field label="Termina em" hint="Vale o dia inteiro. Nos 7 dias antes o app mostra &quot;Termina em&quot;. Vazio = sem fim.">
            <input type="date" class="bo-input" [class.invalid]="errors().validUntil" [min]="f().startsAt" [value]="f().validUntil" (input)="patch.emit({ validUntil: value($event) })" (blur)="touch.emit('validUntil')" />
            @if (errors().validUntil; as e) {
              <span class="err">{{ e }}</span>
            }
          </bo-field>
        </div>

        <div class="g2">
          <div class="switch">
            <bo-toggle ariaLabel="Destaque da semana" [checked]="f().featured" [disabled]="disabled()" (checkedChange)="patch.emit({ featured: $event })" />
            <span>Destaque da semana <small>O de maior prioridade com destaque vai para o topo do clube.</small></span>
          </div>
          <div class="fld">
            <span class="lbl" id="pp-where">Onde mais aparece</span>
            <div class="checks" role="group" aria-labelledby="pp-where">
              @for (p of placements; track p) {
                <label class="check">
                  <input type="checkbox" [checked]="f().placements.includes(p)" [disabled]="disabled()" (change)="togglePlacement(p)" />
                  {{ placementLabels[p] }}
                </label>
              }
            </div>
            <span class="hint">Além do clube: depois do placar confirmado e no dia do torneio do atleta.</span>
          </div>
        </div>
      </div>
    </bo-panel-card>

    <bo-panel-card title="Termos em chips">
      <div class="chips" role="group" aria-label="Termos da oferta">
        @for (t of termsTags; track t) {
          <button type="button" class="bo-chip" [class.active]="f().termsTags.includes(t)" [attr.aria-pressed]="f().termsTags.includes(t)" [disabled]="disabled()" (click)="toggleTag(t)">
            {{ tagLabels[t] }}
          </button>
        }
      </div>
      <p class="hint pad">Aparecem acima do regulamento, para ler num relance. O texto dos termos continua valendo.</p>
    </bo-panel-card>

    <bo-panel-card title="Lugares">
      <div class="stack">
        @for (l of f().locations; track $index; let i = $index) {
          <fieldset class="place" [class.bad]="showLocationErrors() && rowErrors()[i]">
            <legend>Lugar {{ i + 1 }}</legend>
            <div class="g2">
              <input class="bo-input" placeholder="Nome (Loja Centro)" [attr.aria-label]="'Nome do lugar ' + (i + 1)" [value]="l.name" (input)="setLocation(i, { name: value($event) })" (blur)="touch.emit('locations')" />
              <input class="bo-input" placeholder="Endereço" [attr.aria-label]="'Endereço do lugar ' + (i + 1)" [value]="l.address" (input)="setLocation(i, { address: value($event) })" (blur)="touch.emit('locations')" />
            </div>
            <div class="g3">
              <input class="bo-input mono" inputmode="decimal" placeholder="Latitude (-16.6869)" [attr.aria-label]="'Latitude do lugar ' + (i + 1)" [value]="l.lat" (input)="setLocation(i, { lat: value($event) })" (blur)="touch.emit('locations')" />
              <input class="bo-input mono" inputmode="decimal" placeholder="Longitude (-49.2648)" [attr.aria-label]="'Longitude do lugar ' + (i + 1)" [value]="l.lng" (input)="setLocation(i, { lng: value($event) })" (blur)="touch.emit('locations')" />
              <input class="bo-input" placeholder="Horário (opcional)" [attr.aria-label]="'Horário do lugar ' + (i + 1)" [value]="l.hours" (input)="setLocation(i, { hours: value($event) })" />
            </div>
            <div class="place-foot">
              @if (showLocationErrors() && rowErrors()[i]; as e) {
                <span class="err">{{ e }}</span>
              }
              <button type="button" class="bo-ghost-btn" [disabled]="disabled()" (click)="removeLocation(i)">
                <bo-icon name="trash" [size]="12" /> Tirar
              </button>
            </div>
          </fieldset>
        } @empty {
          <p class="hint">Nenhum lugar. Com lugares, o parceiro entra no "perto de você" e no mapa (quando o clube tiver 8 ou mais parceiros).</p>
        }
        <div class="add-row">
          <button type="button" class="bo-mini-btn" [disabled]="disabled() || f().locations.length >= maxLocations" (click)="addLocation()">
            <bo-icon name="pin" [size]="13" /> Adicionar lugar
          </button>
          <span class="hint">{{ f().locations.length }}/{{ maxLocations }} · Latitude e longitude: clique com o botão direito no Google Maps e copie.</span>
        </div>
      </div>
    </bo-panel-card>

    <bo-panel-card title="Quem pode usar">
      <div class="stack">
        <div class="seg" role="radiogroup" aria-label="Requisito do benefício">
          @for (r of requirementTypes; track r) {
            <button type="button" role="radio" [attr.aria-checked]="f().requirementType === r" [class.on]="f().requirementType === r" [disabled]="disabled()" (click)="setRequirement(r)">
              {{ requirementLabels[r] }}
            </button>
          }
        </div>

        @switch (f().requirementType) {
          @case ('tournament') {
            <div class="fld">
              <span class="lbl">Torneios (até 10)</span>
              <bo-tournament-picker [ids]="f().tournamentIds" (idsChange)="patch.emit({ tournamentIds: $event }); touch.emit('tournamentIds')" />
              @if (errors().tournamentIds; as e) {
                <span class="err">{{ e }}</span>
              }
            </div>
          }
          @case ('min_level') {
            <bo-field label="Nível mínimo" hint="Da escada de níveis do atleta, em qualquer esporte.">
              <select class="bo-select" [class.invalid]="errors().minLevel" (change)="patch.emit({ minLevel: value($event) }); touch.emit('minLevel')">
                <option value="" [selected]="f().minLevel === ''">Escolha o nível</option>
                @for (l of levels; track l.code) {
                  <option [value]="l.code" [selected]="f().minLevel === l.code">{{ l.label }} ou acima</option>
                }
              </select>
              @if (errors().minLevel; as e) {
                <span class="err">{{ e }}</span>
              }
            </bo-field>
          }
        }

        @if (f().requirementType !== 'none') {
          <bo-field label="Texto do bloqueio" [hint]="labelHint()">
            <input class="bo-input" [placeholder]="labelPlaceholder()" [class.invalid]="errors().requirementLabel" [value]="f().requirementLabel" (input)="patch.emit({ requirementLabel: value($event) })" (blur)="touch.emit('requirementLabel')" />
            @if (errors().requirementLabel; as e) {
              <span class="err">{{ e }}</span>
            }
          </bo-field>
          <p class="explain">
            <bo-icon name="lock" [size]="13" />
            Quem não cumpre vê o parceiro com cadeado e esse texto. O cupom fixo sai do doc público e fica guardado à parte (só a
            equipe lê); o app só entrega o código a quem pode usar.
          </p>
        }
      </div>
    </bo-panel-card>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .stack { display: flex; flex-direction: column; gap: 16px; }
    .g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
    .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    @media (max-width: 760px) { .g2, .g3 { grid-template-columns: minmax(0, 1fr); } }
    .fld { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .hint { font-size: 11px; line-height: 1.35; color: var(--nx-text-dim); }
    .hint.pad { margin: 10px 0 0; }
    .err { font-size: 11.5px; line-height: 1.3; color: #ff9b94; }
    .warn { font-size: 11.5px; line-height: 1.3; color: var(--nx-pending); }
    .bo-input.invalid, .bo-select.invalid { border-color: rgba(255, 59, 48, 0.6); }
    .mono { font-family: var(--nx-font-mono); }
    .cover-row { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
    .cover { width: 256px; aspect-ratio: 16 / 9; border-radius: var(--nx-r-3); overflow: hidden; display: grid; place-items: center; border: 1px solid var(--nx-line); }
    .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover span { padding: 0 16px; text-align: center; font-size: 11px; color: rgba(255, 255, 255, 0.85); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }
    .cover-actions { display: flex; gap: 8px; align-items: center; }
    .file { position: relative; overflow: hidden; }
    .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .file.disabled { opacity: 0.5; pointer-events: none; }
    .file:focus-within { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .switch { display: flex; align-items: flex-start; gap: 12px; font-size: 13px; color: var(--nx-text); padding-top: 4px; }
    .switch small { display: block; margin-top: 2px; font-size: 11px; color: var(--nx-text-dim); }
    .checks { display: flex; gap: 16px; flex-wrap: wrap; }
    .check { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: var(--nx-text); cursor: pointer; }
    .check input { accent-color: var(--nx-orange-500); width: 16px; height: 16px; }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .place { margin: 0; padding: 12px; border: 1px solid var(--nx-line); border-radius: var(--nx-r-3); display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .place.bad { border-color: rgba(255, 59, 48, 0.5); }
    legend { padding: 0 6px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .place-foot { display: flex; align-items: center; gap: 10px; }
    .place-foot .bo-ghost-btn { margin-left: auto; }
    .add-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .seg { display: flex; gap: 6px; flex-wrap: wrap; }
    .seg button { flex: 1; min-width: 120px; height: 40px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: var(--nx-surface-1); color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .seg button.on { border-color: var(--nx-orange-500); background: rgba(255, 106, 26, 0.12); color: var(--nx-orange-400); }
    .seg button:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .explain { margin: 0; display: flex; gap: 8px; align-items: flex-start; font-size: 12px; line-height: 1.5; color: var(--nx-text-mute); }
  `,
})
export class PartnerPremiumFieldsComponent {
  private readonly repository = inject(ClubRepository);

  readonly form = input.required<PartnerForm>();
  /** Erros já filtrados pelo editor (só dos campos tocados ou depois de tentar salvar). */
  readonly errors = input<PartnerFormErrors>({});
  readonly showLocationErrors = input(false);
  /** Id para o nome do arquivo da capa (o slug do parceiro novo, antes de salvar). */
  readonly partnerId = input('');
  readonly disabled = input(false);
  readonly patch = output<Partial<PartnerForm>>();
  readonly touch = output<PartnerFormField>();
  readonly uploadingChange = output<boolean>();

  protected readonly f = this.form;
  protected readonly placements = PLACEMENTS;
  protected readonly placementLabels = PLACEMENT_LABELS;
  protected readonly termsTags = TERMS_TAGS;
  protected readonly tagLabels = TERMS_TAG_LABELS;
  protected readonly requirementTypes = REQUIREMENT_TYPES;
  protected readonly requirementLabels = REQUIREMENT_LABELS;
  protected readonly levels = LEVEL_CHOICES;
  protected readonly maxLocations = LOCATIONS_MAX;

  protected readonly uploadPercent = signal<number | null>(null);
  protected readonly coverError = signal('');
  protected readonly aspectWarning = signal('');
  protected readonly rowErrors = computed(() => locationErrors(this.f().locations));
  protected readonly labelPlaceholder = computed(() => {
    const f = this.f();
    return defaultRequirementLabel(requirementPayload(f.requirementType, f.tournamentIds, f.minLevel)) ?? '';
  });
  protected readonly labelHint = computed(
    () => `${this.f().requirementLabel.trim().length}/${REQUIREMENT_LABEL_MAX} · Vazio usa o texto padrão mostrado.`,
  );

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected togglePlacement(p: PartnerPlacement): void {
    const list = this.f().placements;
    this.patch.emit({ placements: list.includes(p) ? list.filter((x) => x !== p) : [...list, p] });
  }

  protected toggleTag(t: PartnerTermsTag): void {
    const list = this.f().termsTags;
    this.patch.emit({ termsTags: list.includes(t) ? list.filter((x) => x !== t) : [...list, t] });
  }

  protected setRequirement(type: RequirementType): void {
    this.patch.emit({ requirementType: type });
  }

  protected addLocation(): void {
    if (this.f().locations.length >= LOCATIONS_MAX) return;
    this.patch.emit({ locations: [...this.f().locations, emptyLocation()] });
  }

  protected removeLocation(index: number): void {
    this.patch.emit({ locations: this.f().locations.filter((_, i) => i !== index) });
  }

  protected setLocation(index: number, change: Partial<LocationForm>): void {
    this.patch.emit({ locations: this.f().locations.map((l, i) => (i === index ? { ...l, ...change } : l)) });
  }

  protected async onCover(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const problem = coverFileError(file);
    if (problem) {
      this.coverError.set(problem);
      return;
    }
    this.coverError.set('');
    this.aspectWarning.set(await this.aspectOf(file));
    this.uploadPercent.set(0);
    this.uploadingChange.emit(true);
    try {
      const url = await this.repository.uploadCover(this.partnerId(), file, (p) => this.uploadPercent.set(p));
      this.patch.emit({ coverUrl: url });
    } catch (error) {
      this.coverError.set(clubErrorMessage(error));
    } finally {
      this.uploadPercent.set(null);
      this.uploadingChange.emit(false);
    }
  }

  /** Aviso (não bloqueia) quando a imagem foge de 16:9; sem leitor de imagem, sem aviso. */
  private async aspectOf(file: File): Promise<string> {
    if (typeof createImageBitmap !== 'function') return '';
    try {
      const bitmap = await createImageBitmap(file);
      const drift = aspectDrift(bitmap.width, bitmap.height);
      const size = `${bitmap.width}×${bitmap.height}`;
      bitmap.close();
      return drift > ASPECT_TOLERANCE ? `A imagem tem ${size}, não é 16:9: o app corta as bordas.` : '';
    } catch {
      return '';
    }
  }
}
