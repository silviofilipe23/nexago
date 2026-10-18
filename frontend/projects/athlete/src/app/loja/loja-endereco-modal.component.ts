import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import {
  ADDRESS_LABELS,
  EMPTY_ADDRESS_DRAFT,
  addressDraftErrors,
  addressFromDraft,
  draftFromAddress,
  formatCep,
  formatPhone,
  type AddressDraft,
  type AddressField,
  type StoreAddress,
} from '../data/store-checkout-model';
import { fetchAddressByCep } from '../data/via-cep';

export interface AddressSaved {
  address: StoreAddress;
  makeMain: boolean;
}

/** Busca de CEP dos Correios — para quem não sabe o próprio. */
const CORREIOS_CEP_URL = 'https://buscacepinter.correios.com.br/app/endereco/index.php';

/**
 * Novo endereço / editar endereço (web 05). O CEP preenche rua, bairro, cidade e UF pelo ViaCEP;
 * o resto o atleta digita. Quem salva é o checkout (a lista inteira vai para `storeAddresses`).
 */
@Component({
  selector: 'app-loja-endereco-modal',
  templateUrl: './loja-endereco-modal.component.html',
  styleUrl: './loja-endereco-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class LojaEnderecoModalComponent {
  /** `null` = novo. */
  readonly address = input<StoreAddress | null>(null);
  /** Primeiro endereço do atleta: nasce principal, sem a caixa. */
  readonly first = input(false);
  readonly defaultRecipient = input('');
  readonly saving = input(false);
  readonly saved = output<AddressSaved>();
  readonly removed = output<string>();
  readonly closed = output<void>();

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly cepInput = viewChild<ElementRef<HTMLInputElement>>('cepInput');
  private readonly numberInput = viewChild<ElementRef<HTMLInputElement>>('numberInput');

  protected readonly labels = ADDRESS_LABELS;
  protected readonly correiosUrl = CORREIOS_CEP_URL;
  protected readonly draft = signal<AddressDraft>(EMPTY_ADDRESS_DRAFT);
  protected readonly makeMain = signal(false);
  protected readonly touched = signal(false);
  protected readonly cepState = signal<'idle' | 'loading' | 'found' | 'not_found'>('idle');
  /** Campos que vieram do CEP (ganham o ✓ do desenho). */
  protected readonly fromCep = signal<ReadonlySet<AddressField>>(new Set());

  protected readonly editing = computed(() => this.address() !== null);
  protected readonly errors = computed(() => addressDraftErrors(this.draft()));
  protected readonly cepLabel = computed(() => formatCep(this.draft().zip));
  protected readonly phoneLabel = computed(() => formatPhone(this.draft().phone));

  private cepSeq = 0;

  constructor() {
    effect(() => {
      const a = this.address();
      const recipient = this.defaultRecipient();
      untracked(() => {
        this.draft.set(a ? draftFromAddress(a) : { ...EMPTY_ADDRESS_DRAFT, recipient });
        this.makeMain.set(a?.main ?? false);
        this.fromCep.set(new Set());
        this.cepState.set(a ? 'found' : 'idle');
        this.touched.set(false);
        queueMicrotask(() => this.cepInput()?.nativeElement.focus());
      });
    });
  }

  protected error(field: AddressField): string | null {
    return this.touched() ? (this.errors()[field] ?? null) : null;
  }

  protected set(field: AddressField, value: string): void {
    this.draft.update((d) => ({ ...d, [field]: value }));
    if (this.fromCep().has(field)) {
      const next = new Set(this.fromCep());
      next.delete(field);
      this.fromCep.set(next);
    }
  }

  protected onPhone(value: string): void {
    this.set('phone', value.replace(/\D/g, '').slice(0, 11));
  }

  protected onCep(value: string): void {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    this.set('zip', digits);
    if (digits.length === 8) void this.lookupCep(digits);
    else this.cepState.set('idle');
  }

  private async lookupCep(cep: string): Promise<void> {
    const seq = ++this.cepSeq;
    this.cepState.set('loading');
    const found = await fetchAddressByCep(cep);
    if (seq !== this.cepSeq) return;
    if (!found) {
      this.cepState.set('not_found');
      return;
    }
    const filled = new Set<AddressField>(['city', 'uf']);
    if (found.street) filled.add('street');
    if (found.district) filled.add('district');
    this.draft.update((d) => ({
      ...d,
      street: found.street || d.street,
      district: found.district || d.district,
      city: found.city,
      uf: found.uf,
    }));
    this.fromCep.set(filled);
    this.cepState.set('found');
    // O desenho: depois do CEP o cursor vai pro número.
    queueMicrotask(() => this.numberInput()?.nativeElement.focus());
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.touched.set(true);
    if (Object.keys(this.errors()).length > 0) {
      this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const current = this.address();
    const id = current?.id ?? crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const makeMain = this.first() || this.makeMain();
    this.saved.emit({ address: addressFromDraft(this.draft(), id, makeMain), makeMain });
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }
}
