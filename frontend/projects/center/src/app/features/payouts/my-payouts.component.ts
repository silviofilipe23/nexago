import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { MyPayoutsActions, type CoachAccount } from '../../data/actions/my-payouts.actions';
import { formatDayKey, formatInstant, monthLabel } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import { PAYOUT_STATUS, describeRule, paidMethodLabel, type Payout } from '../../domain/payouts';
import { BannerComponent, PageHeaderComponent } from '../../ui/kit';
import { parseReais } from '../settings/receiving-view';

const ACCOUNT_STATUS: Record<CoachAccount['status'], [string, string]> = {
  creating: ['Criando', 'yellow'],
  failed: ['Não criada', 'red'],
  pending: ['Em análise', 'yellow'],
  approved: ['Ativa', 'green'],
  rejected: ['Recusada', 'red'],
};

/** O professor: repasses que o centro fechou/pagou e a conta Asaas onde recebe pelo NexaGO. */
@Component({
  selector: 'ct-my-payouts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PageHeaderComponent, BannerComponent],
  template: `
    <ct-page-header title="Meus repasses" [subtitle]="ctx.center()?.name ?? ''" />
    <div class="page ct-grid-aside">
      <section class="ct-card flush">
        <div class="head">
          <div class="ct-kick">Fechados pelo centro</div>
          <div class="ct-card-title">Repasses</div>
        </div>
        @for (p of payouts(); track p.id) {
          <div class="row">
            <div class="ct-grow">
              <div class="ct-disp">{{ monthTitle(p.month) }}</div>
              <div class="ct-mono">{{ ruleLabel(p) }}{{ p.rule.kind === 'per_class' ? ' · ' + p.classesGiven + ' aulas' : '' }}</div>
              @if (p.status === 'paid') {
                <div class="ct-dim">Pago em {{ formatDayKey(p.paidOn) }} · {{ methodLabel(p.paidMethod) }}</div>
              } @else if (p.transferStatus === 'pending' || p.transferStatus === 'requested') {
                <div class="ct-dim">Transferência a caminho da sua conta Asaas</div>
              }
            </div>
            <span class="val">{{ formatBRL(p.totalCents) }}</span>
            <span [class]="'ct-pill ' + STATUS[p.status][1]">{{ STATUS[p.status][0] }}</span>
          </div>
        } @empty {
          <div class="ct-empty">{{ loaded() ? 'Nenhum repasse fechado ainda. O centro fecha o mês com as aulas que você deu.' : 'Carregando…' }}</div>
        }
      </section>

      <section class="ct-card">
        <div class="ct-card-head">
          <div class="ct-grow">
            <div class="ct-kick">Para receber pelo NexaGO</div>
            <div class="ct-card-title">Sua conta de recebimento</div>
          </div>
          @if (account(); as a) {
            <span [class]="'ct-pill ' + ACCOUNT[a.status][1]">{{ ACCOUNT[a.status][0] }}</span>
          }
        </div>
        @if (account(); as a) {
          @if (a.status === 'approved') {
            <p class="ct-muted">Pronta. Quando o centro pagar pelo NexaGO, o valor cai na sua conta Asaas — saldo e saques ficam no app do Asaas.</p>
          } @else if (a.status === 'pending' || a.status === 'creating') {
            <p class="ct-muted">Em análise no Asaas. Siga o e-mail do Asaas para enviar os documentos e definir a senha.</p>
            <button type="button" class="ct-ghost-btn" [disabled]="busy()" (click)="refresh()">{{ busy() ? 'Consultando…' : 'Atualizar situação' }}</button>
          } @else if (a.status === 'rejected') {
            <p class="ct-muted">O Asaas recusou o cadastro. Fale com o time NexaGO.</p>
          }
          @if (a.name) {
            <div class="ct-kv"><span>Titular</span><span>{{ a.name }}</span></div>
          }
          @if (a.cpfMasked) {
            <div class="ct-kv mono"><span>CPF</span><span>{{ a.cpfMasked }}</span></div>
          }
          @if (a.statusCheckedAt) {
            <div class="ct-kv"><span>Consultado</span><span>{{ when(a.statusCheckedAt) }}</span></div>
          }
        }
        @if (showForm()) {
          <p class="ct-dim">O centro pode pagar seus repasses direto numa conta Asaas sua (sem custo para abrir). Os dados vão para o Asaas.</p>
          <form [formGroup]="form" (ngSubmit)="create()">
            <div class="ct-form-grid">
              <div class="ct-field wide"><label for="mp-name">Nome completo</label><input id="mp-name" class="ct-input" formControlName="name" autocomplete="name" /></div>
              <div class="ct-field"><label for="mp-cpf">CPF</label><input id="mp-cpf" class="ct-input mono" formControlName="cpfCnpj" inputmode="numeric" /></div>
              <div class="ct-field"><label for="mp-birth">Nascimento</label><input id="mp-birth" class="ct-input" type="date" formControlName="birthDate" /></div>
              <div class="ct-field"><label for="mp-email">E-mail</label><input id="mp-email" class="ct-input" type="email" formControlName="email" /></div>
              <div class="ct-field"><label for="mp-phone">Celular</label><input id="mp-phone" class="ct-input" type="tel" formControlName="mobilePhone" /></div>
              <div class="ct-field"><label for="mp-income">Renda mensal</label><input id="mp-income" class="ct-input mono" formControlName="income" inputmode="decimal" placeholder="R$ 5.000" /></div>
              <div class="ct-field"><label for="mp-cep">CEP</label><input id="mp-cep" class="ct-input mono" formControlName="postalCode" inputmode="numeric" /></div>
              <div class="ct-field wide"><label for="mp-address">Endereço</label><input id="mp-address" class="ct-input" formControlName="address" /></div>
              <div class="ct-field"><label for="mp-number">Número</label><input id="mp-number" class="ct-input" formControlName="addressNumber" /></div>
              <div class="ct-field"><label for="mp-comp">Complemento</label><input id="mp-comp" class="ct-input" formControlName="complement" /></div>
              <div class="ct-field"><label for="mp-province">Bairro</label><input id="mp-province" class="ct-input" formControlName="province" /></div>
            </div>
            <div class="save">
              <button type="submit" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy()">{{ busy() ? 'Criando no Asaas…' : 'Criar conta' }}</button>
            </div>
          </form>
        }
        @if (err()) {
          <p class="ct-error-text" role="alert">{{ err() }}</p>
        }
        @if (account()?.status === 'failed') {
          <ct-banner tone="red" [inline]="true" title="A última tentativa não criou a conta">Confira os dados e tente de novo.</ct-banner>
        }
      </section>
    </div>
  `,
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; }
    .head { padding: 16px 18px 6px; }
    .row { display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-top: 1px solid var(--nx-line); }
    .val { font-family: var(--nx-font-mono); font-weight: 700; color: var(--nx-text); }
    .wide { grid-column: 1 / -1; }
    .save { margin-top: 14px; }
    .ct-card > p { margin: 8px 0 12px; line-height: 1.45; }
  `,
})
export class MyPayoutsComponent {
  protected readonly ctx = inject(CenterContextService);
  private readonly actions = inject(MyPayoutsActions);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly STATUS = PAYOUT_STATUS;
  protected readonly ACCOUNT = ACCOUNT_STATUS;
  protected readonly formatBRL = formatBRL;
  protected readonly formatDayKey = formatDayKey;

  protected readonly payouts = signal<Payout[]>([]);
  protected readonly loaded = signal(false);
  protected readonly account = signal<CoachAccount | null | undefined>(undefined);
  protected readonly busy = signal(false);
  protected readonly err = signal('');
  protected readonly showForm = computed(() => {
    const a = this.account();
    return a === null || a?.status === 'failed';
  });

  protected readonly form = this.fb.group({
    name: '',
    cpfCnpj: '',
    birthDate: '',
    email: '',
    mobilePhone: '',
    income: '',
    postalCode: '',
    address: '',
    addressNumber: '',
    complement: '',
    province: '',
  });

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(
      this.actions.watchPayouts(
        (p) => {
          this.payouts.set(p);
          this.loaded.set(true);
        },
        (e) => {
          this.loaded.set(true);
          this.err.set(writeErrorMessage(e));
        },
      ),
    );
    destroy.onDestroy(this.actions.watchAccount((a) => this.account.set(a), () => this.account.set(null)));
    const me = this.ctx.me();
    if (me) this.form.patchValue({ name: me.displayName, email: me.email });
  }

  protected monthTitle(m: string): string {
    const label = monthLabel(m, true);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  protected ruleLabel(p: Payout): string {
    return describeRule(p.rule, formatBRL);
  }

  protected methodLabel(m: string): string {
    return paidMethodLabel(m);
  }

  protected when(d: Date): string {
    return formatInstant(d, this.ctx.center()?.timezone);
  }

  protected async create(): Promise<void> {
    if (this.busy()) return;
    const v = this.form.getRawValue();
    const income = parseReais(v.income);
    if (!income) {
      this.err.set('Informe a renda mensal.');
      return;
    }
    this.busy.set(true);
    this.err.set('');
    try {
      await this.actions.createAccount({ ...v, incomeValue: income });
    } catch (e) {
      this.err.set(writeErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async refresh(): Promise<void> {
    this.busy.set(true);
    this.err.set('');
    try {
      await this.actions.refreshAccount();
    } catch (e) {
      this.err.set(writeErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
