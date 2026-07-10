import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';

type Cobertura = 'Coberta' | 'Descoberta';
type InitialStatus = 'livre' | 'manutencao';

interface CourtFormData {
  name: string;
  modalidade: string;
  cobertura: Cobertura;
  preco: string;
  abreAs: string;
  fechaAs: string;
  status: InitialStatus;
  photoDataUrl: string | null;
}

const MODALIDADE_OPTIONS = ['Beach Tennis', 'Vôlei de praia', 'Beach Soccer', 'Futevôlei'];
const COBERTURA_OPTIONS: Cobertura[] = ['Coberta', 'Descoberta'];
const STATUS_OPTIONS: { key: InitialStatus; label: string }[] = [
  { key: 'livre', label: 'Livre agora' },
  { key: 'manutencao', label: 'Em manutenção' },
];

const MOCK_COURTS: Record<string, CourtFormData> = {
  q1: { name: 'Quadra 1', modalidade: 'Beach Tennis', cobertura: 'Coberta', preco: '60,00', abreAs: '07:00', fechaAs: '23:00', status: 'livre', photoDataUrl: null },
  q2: { name: 'Quadra 2', modalidade: 'Vôlei de praia', cobertura: 'Descoberta', preco: '50,00', abreAs: '07:00', fechaAs: '23:00', status: 'livre', photoDataUrl: null },
  q3: { name: 'Quadra 3', modalidade: 'Beach Soccer', cobertura: 'Coberta', preco: '80,00', abreAs: '07:00', fechaAs: '23:00', status: 'manutencao', photoDataUrl: null },
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Tela Nova/Editar quadra do painel (protótipo ArQuadraFormScreen): informações básicas, preço/disponibilidade e status inicial. */
@Component({
  selector: 'ar-panel-court-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="headerTitle()" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canSave()" (click)="save()">
          <ar-icon name="check" [size]="14" />
          Salvar quadra
        </button>
      </ar-page-header>

      <div class="body">
        <div class="form-col">
          <ar-panel-card title="Informações básicas">
            <div class="photo-row">
              <label class="dropzone" (dragover)="$event.preventDefault()" (drop)="handleDrop($event)">
                <input type="file" accept="image/*" class="sr-only" (change)="handleFileChange($event)" />
                @if (photoDataUrl(); as url) {
                  <img [src]="url" alt="Foto da quadra" />
                } @else {
                  <ar-icon name="image" [size]="22" style="color: var(--nx-text-dim)" />
                }
              </label>
              <div class="photo-hint">Arraste uma foto da quadra<br />ou clique para escolher um arquivo</div>
            </div>

            <div class="field-label">Nome da quadra</div>
            <input
              type="text"
              class="input-box name-input"
              placeholder="Ex.: Quadra 4"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />

            <div class="field-label">Modalidade</div>
            <div class="ar-filter-bar filter-block">
              @for (opt of modalidadeOptions; track opt) {
                <button type="button" class="ar-chip" [class.active]="modalidade() === opt" (click)="modalidade.set(opt)">{{ opt }}</button>
              }
            </div>

            <div class="field-label">Cobertura</div>
            <div class="ar-filter-bar">
              @for (opt of coberturaOptions; track opt) {
                <button type="button" class="ar-chip" [class.active]="cobertura() === opt" (click)="cobertura.set(opt)">{{ opt }}</button>
              }
            </div>
          </ar-panel-card>

          <ar-panel-card title="Preço e disponibilidade">
            <div class="row-3">
              <div>
                <div class="field-label">Preço por hora</div>
                <div class="price-box">
                  <span>R$</span>
                  <input type="text" inputmode="decimal" [value]="preco()" (input)="preco.set($any($event.target).value)" />
                </div>
              </div>
              <div>
                <div class="field-label">Abre às</div>
                <input type="time" class="input-box" [value]="abreAs()" (input)="abreAs.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Fecha às</div>
                <input type="time" class="input-box" [value]="fechaAs()" (input)="fechaAs.set($any($event.target).value)" />
              </div>
            </div>
          </ar-panel-card>

          <ar-panel-card title="Status inicial">
            <div class="ar-filter-bar">
              @for (opt of statusOptions; track opt.key) {
                <button type="button" class="ar-chip" [class.active]="status() === opt.key" (click)="status.set(opt.key)">{{ opt.label }}</button>
              }
            </div>
          </ar-panel-card>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      justify-content: center;
      overflow: auto;
    }

    .form-col {
      width: 100%;
      max-width: 860px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .photo-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }

    .dropzone {
      width: 120px;
      height: 120px;
      flex: none;
      border-radius: var(--nx-r-2);
      border: 1px dashed var(--nx-line-strong);
      background: var(--nx-surface-1);
      display: grid;
      place-items: center;
      cursor: pointer;
      overflow: hidden;
      transition: border-color 140ms var(--nx-ease-out);
    }

    .dropzone:hover {
      border-color: var(--nx-orange-500);
    }

    .dropzone:focus-within {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }

    .dropzone img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .photo-hint {
      font-size: 13px;
      line-height: 1.5;
      color: var(--nx-text-dim);
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .filter-block {
      margin-bottom: 18px;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .name-input {
      margin-bottom: 18px;
    }

    .price-box {
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .price-box:focus-within {
      border-color: var(--nx-orange-500);
    }

    .price-box span {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      color: var(--nx-text-dim);
    }

    .price-box input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
    }

    .row-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    @media (max-width: 720px) {
      .row-3 {
        grid-template-columns: 1fr;
      }

      .photo-row {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `,
})
export class PanelCourtFormComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly id = input<string | null>(null);

  protected readonly modalidadeOptions = MODALIDADE_OPTIONS;
  protected readonly coberturaOptions = COBERTURA_OPTIONS;
  protected readonly statusOptions = STATUS_OPTIONS;

  private readonly courtData = computed(() => (this.id() ? (MOCK_COURTS[this.id()!] ?? null) : null));

  protected readonly isEdit = computed(() => this.id() != null);

  protected readonly name = linkedSignal(() => this.courtData()?.name ?? '');
  protected readonly modalidade = linkedSignal(() => this.courtData()?.modalidade ?? MODALIDADE_OPTIONS[0]);
  protected readonly cobertura = linkedSignal<Cobertura>(() => this.courtData()?.cobertura ?? 'Coberta');
  protected readonly preco = linkedSignal(() => this.courtData()?.preco ?? '0,00');
  protected readonly abreAs = linkedSignal(() => this.courtData()?.abreAs ?? '07:00');
  protected readonly fechaAs = linkedSignal(() => this.courtData()?.fechaAs ?? '23:00');
  protected readonly status = linkedSignal<InitialStatus>(() => this.courtData()?.status ?? 'livre');
  protected readonly photoDataUrl = linkedSignal<string | null>(() => this.courtData()?.photoDataUrl ?? null);

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected readonly headerTitle = computed(() => (this.isEdit() ? 'Editar quadra' : 'Nova quadra'));
  protected readonly headerSubtitle = computed(() =>
    this.isEdit() ? `Editar quadra na ${this.arenaName()}` : `Cadastrar quadra na ${this.arenaName()}`,
  );

  protected readonly canSave = computed(() => this.name().trim().length > 0);

  protected async handleFileChange(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.photoDataUrl.set(await readFileAsDataUrl(file));
    }
  }

  protected async handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.photoDataUrl.set(await readFileAsDataUrl(file));
    }
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    this.router.navigate(['/painel/quadras']);
  }
}
