import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { ReceivingActions } from '../../data/actions/receiving.actions';
import { formatInstant } from '../../domain/dates';
import { COMPANY_TYPES, RECEIVING_STATUS, type ReceivingAccount } from '../../domain/models';
import { BannerComponent, SegmentedComponent } from '../../ui/kit';
import { parseReais, receivingFormError, receivingView } from './receiving-view';

/** Configurações › Conta de recebimento: subconta Asaas criada pelo próprio centro. */
@Component({
  selector: 'ct-receiving-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, SegmentedComponent, BannerComponent],
  template: `
    @let v = view();
    <div class="ct-grid-aside">
      <div class="main">
        @if (v.kind === 'form') {
          <form class="ct-card" [formGroup]="form" (ngSubmit)="create()">
            <div class="ct-card-head">
              <div class="ct-grow">
                <div class="ct-kick">Asaas · conta do centro sob a NexaGO</div>
                <div class="ct-card-title">{{ v.failed ? 'Tentar de novo' : 'Criar conta de recebimento' }}</div>
              </div>
            </div>
            @if (v.failed) {
              <ct-banner tone="red" [inline]="true" title="A última tentativa não criou a conta">Confira os dados e envie de novo.</ct-banner>
            }
            <div class="kind">
              <ct-segmented [options]="personOptions" [value]="form.controls.personType.value" [disabled]="busy()" (valueChange)="setPerson($event)" />
            </div>
            <div class="ct-form-grid">
              @if (company()) {
                <div class="ct-field wide">
                  <label for="ra-name">Razão social</label>
                  <input id="ra-name" class="ct-input" formControlName="name" autocomplete="organization" />
                </div>
                <div class="ct-field">
                  <label for="ra-doc">CNPJ</label>
                  <input id="ra-doc" class="ct-input mono" formControlName="cpfCnpj" inputmode="numeric" />
                </div>
                <div class="ct-field">
                  <label for="ra-type">Tipo de empresa</label>
                  <select id="ra-type" class="ct-input" formControlName="companyType">
                    <option value="">Selecione</option>
                    @for (t of companyTypes; track t.value) {
                      <option [value]="t.value">{{ t.label }}</option>
                    }
                  </select>
                </div>
              } @else {
                <div class="ct-field wide">
                  <label for="ra-name">Nome completo</label>
                  <input id="ra-name" class="ct-input" formControlName="name" autocomplete="name" />
                </div>
                <div class="ct-field">
                  <label for="ra-doc">CPF</label>
                  <input id="ra-doc" class="ct-input mono" formControlName="cpfCnpj" inputmode="numeric" />
                </div>
                <div class="ct-field">
                  <label for="ra-birth">Data de nascimento</label>
                  <input id="ra-birth" class="ct-input" type="date" formControlName="birthDate" />
                </div>
              }
              <div class="ct-field">
                <label for="ra-email">E-mail da conta</label>
                <input id="ra-email" class="ct-input" type="email" formControlName="email" autocomplete="email" />
              </div>
              <div class="ct-field">
                <label for="ra-phone">Celular</label>
                <input id="ra-phone" class="ct-input" type="tel" formControlName="mobilePhone" placeholder="(13) 99123-4567" />
              </div>
              <div class="ct-field">
                <label for="ra-income">{{ company() ? 'Faturamento mensal' : 'Renda mensal' }}</label>
                <input id="ra-income" class="ct-input mono" formControlName="income" inputmode="decimal" placeholder="R$ 25.000" />
              </div>
              <div class="ct-field">
                <label for="ra-cep">CEP</label>
                <input id="ra-cep" class="ct-input mono" formControlName="postalCode" inputmode="numeric" />
              </div>
              <div class="ct-field wide">
                <label for="ra-address">Endereço</label>
                <input id="ra-address" class="ct-input" formControlName="address" autocomplete="address-line1" />
              </div>
              <div class="ct-field">
                <label for="ra-number">Número</label>
                <input id="ra-number" class="ct-input" formControlName="addressNumber" />
              </div>
              <div class="ct-field">
                <label for="ra-comp">Complemento</label>
                <input id="ra-comp" class="ct-input" formControlName="complement" />
              </div>
              <div class="ct-field">
                <label for="ra-province">Bairro</label>
                <input id="ra-province" class="ct-input" formControlName="province" />
              </div>
            </div>
            <div class="save">
              <button type="submit" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy()">{{ busy() ? 'Criando no Asaas…' : 'Criar conta' }}</button>
              <span class="ct-dim">Os dados vão direto para o Asaas · o NexaGO não guarda CPF/CNPJ completo.</span>
            </div>
            @if (err()) {
              <p class="ct-error-text" role="alert">{{ err() }}</p>
            }
          </form>
        } @else if (v.kind === 'readonly') {
          <section class="ct-card">
            <div class="ct-card-title">Conta de recebimento ainda não criada</div>
            <p class="ct-muted">Só o owner do centro cria a conta que recebe os pagamentos. Peça para {{ ctx.center()?.ownerName || 'o owner' }} abrir esta tela.</p>
          </section>
        } @else if (account(); as a) {
          <section class="ct-card">
            <div class="ct-card-head">
              <div class="ct-grow">
                <div class="ct-kick">{{ a.source === 'manual' ? 'Conectada pelo time NexaGO' : 'Asaas · subconta do centro' }}</div>
                <div class="ct-card-title">{{ v.title }}</div>
              </div>
              <span [class]="'ct-pill ' + statusLabel[a.status][1]">{{ statusLabel[a.status][0] }}</span>
            </div>
            <p class="ct-muted">{{ v.text }}</p>
            @if (a.name) {
              <div class="ct-kv"><span>{{ a.personType === 'company' ? 'Razão social' : 'Titular' }}</span><span>{{ a.name }}</span></div>
            }
            @if (a.document) {
              <div class="ct-kv mono"><span>{{ a.personType === 'company' ? 'CNPJ' : 'CPF' }}</span><span>{{ a.document }}</span></div>
            }
            @if (a.email) {
              <div class="ct-kv"><span>E-mail da conta</span><span>{{ a.email }}</span></div>
            }
            @if (a.createdAt) {
              <div class="ct-kv"><span>Criada</span><span>{{ when(a.createdAt) }}{{ a.createdByName ? ' · ' + a.createdByName : '' }}</span></div>
            }
            @if (a.source === 'self' && a.status !== 'approved') {
              <div class="save">
                <button type="button" class="ct-ghost-btn" [disabled]="refreshing()" (click)="refresh()">{{ refreshing() ? 'Consultando…' : 'Atualizar situação' }}</button>
                <span class="ct-dim">{{ a.statusCheckedAt ? 'Consultado ' + when(a.statusCheckedAt) : 'Consultamos o Asaas de hora em hora' }}</span>
              </div>
              @if (err()) {
                <p class="ct-error-text" role="alert">{{ err() }}</p>
              }
            }
          </section>

          @if (v.pendingDocs.length) {
            <section class="ct-card">
              <div class="ct-card-head">
                <div class="ct-grow">
                  <div class="ct-kick">O Asaas precisa destes documentos</div>
                  <div class="ct-card-title">Documentos pendentes</div>
                </div>
              </div>
              @for (d of v.pendingDocs; track d.title) {
                <div class="doc">
                  <div class="ct-grow">
                    <div class="ct-disp">{{ d.title }}</div>
                    <div class="ct-mono">{{ d.label }}</div>
                  </div>
                  @if (d.url && ctx.isOwner()) {
                    <a class="ct-mini-btn" [href]="d.url" target="_blank" rel="noopener">Enviar</a>
                  }
                </div>
              }
              <p class="ct-dim">O link abre o envio no Asaas e expira; se não abrir, toque em "Atualizar situação" para gerar outro.</p>
            </section>
          }
        } @else {
          <div class="ct-empty">Carregando…</div>
        }
      </div>

      <section class="ct-card">
        <div class="ct-card-head">
          <div class="ct-grow">
            <div class="ct-kick">Como funciona</div>
            <div class="ct-card-title">Recebimento pelo NexaGO</div>
          </div>
        </div>
        <ol class="steps">
          <li><strong>Crie a conta</strong> com os dados do centro. Ela nasce no Asaas, ligada ao NexaGO.</li>
          <li><strong>Envie os documentos</strong> que o Asaas pedir. A análise leva de 1 a 3 dias úteis.</li>
          <li><strong>Aprovada</strong>, as cobranças passam a sair com link de Pix ou cartão e o dinheiro cai na conta do centro, já com a taxa NexaGO descontada.</li>
        </ol>
        <p class="ct-dim">
          O Asaas manda um e-mail para definir a senha da conta. Saldo, extrato e saques ficam no app ou site do Asaas. Já tem conta Asaas própria? Fale com o time NexaGO para conectar.
        </p>
      </section>
    </div>
  `,
  styles: `
    .main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .kind { margin: 4px 0 14px; }
    .wide { grid-column: 1 / -1; }
    .save { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
    .doc { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--nx-line); }
    .steps { margin: 0 0 12px; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; color: var(--nx-text-dim); font-size: 13px; line-height: 1.45; }
    .steps strong { color: var(--nx-text); }
    .ct-card > p { margin: 8px 0 0; }
  `,
})
export class ReceivingAccountComponent {
  protected readonly ctx = inject(CenterContextService);
  private readonly actions = inject(ReceivingActions);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly statusLabel = RECEIVING_STATUS;
  protected readonly companyTypes = COMPANY_TYPES;
  protected readonly personOptions = [
    { value: 'company', label: 'CNPJ' },
    { value: 'person', label: 'CPF' },
  ];

  protected readonly account = signal<ReceivingAccount | null | undefined>(undefined);
  protected readonly busy = signal(false);
  protected readonly refreshing = signal(false);
  protected readonly err = signal('');

  protected readonly form = this.fb.group({
    personType: 'company' as 'company' | 'person',
    companyType: '',
    name: ['', Validators.required],
    cpfCnpj: ['', Validators.required],
    birthDate: '',
    email: ['', Validators.required],
    mobilePhone: ['', Validators.required],
    income: ['', Validators.required],
    postalCode: ['', Validators.required],
    address: ['', Validators.required],
    addressNumber: ['', Validators.required],
    complement: '',
    province: ['', Validators.required],
  });
  protected readonly company = signal(true);

  protected readonly view = computed(() =>
    receivingView(this.account(), this.ctx.center()?.receivingStatus ?? 'none', this.ctx.center()?.receivingConnected ?? false, this.ctx.isOwner()),
  );

  constructor() {
    const stop = this.actions.watch(
      (a) => {
        // Erro do formulário não vale mais depois que a conta existe.
        if (a && !this.account()) this.err.set('');
        this.account.set(a);
      },
      () => this.account.set(null),
    );
    inject(DestroyRef).onDestroy(stop);
    // Pré-preenche com o cadastro do centro (o owner confere antes de enviar).
    effect(() => {
      const c = this.ctx.center();
      if (c && this.form.pristine) {
        this.form.patchValue(
          { name: c.legalName || c.name, cpfCnpj: c.cnpj, email: c.contactEmail, mobilePhone: c.contactPhone, address: c.address },
          { emitEvent: false },
        );
      }
    });
  }

  protected setPerson(value: string): void {
    const person = value === 'person';
    this.company.set(!person);
    this.form.patchValue({ personType: person ? 'person' : 'company', cpfCnpj: '', name: '' });
    this.form.markAsDirty();
  }

  protected when(d: Date): string {
    return formatInstant(d, this.ctx.center()?.timezone);
  }

  protected async create(): Promise<void> {
    if (this.busy()) {
      return;
    }
    const raw = this.form.getRawValue();
    const income = parseReais(raw.income);
    const problem = receivingFormError({ ...raw, incomeValue: income });
    if (problem) {
      this.err.set(problem);
      return;
    }
    this.busy.set(true);
    this.err.set('');
    try {
      await this.actions.create({
        personType: raw.personType,
        companyType: raw.personType === 'company' ? raw.companyType : '',
        name: raw.name.trim(),
        email: raw.email.trim(),
        cpfCnpj: raw.cpfCnpj,
        mobilePhone: raw.mobilePhone,
        birthDate: raw.personType === 'person' ? raw.birthDate : '',
        incomeValue: income ?? 0,
        postalCode: raw.postalCode,
        address: raw.address.trim(),
        addressNumber: raw.addressNumber.trim(),
        complement: raw.complement.trim(),
        province: raw.province.trim(),
      });
    } catch (e) {
      this.err.set(writeErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async refresh(): Promise<void> {
    this.refreshing.set(true);
    this.err.set('');
    try {
      await this.actions.refresh();
    } catch (e) {
      this.err.set(writeErrorMessage(e));
    } finally {
      this.refreshing.set(false);
    }
  }
}
