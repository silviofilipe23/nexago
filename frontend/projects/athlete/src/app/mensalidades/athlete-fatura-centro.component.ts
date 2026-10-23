import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { pixQrSvgDataUrl } from '../data/pix-qr';
import {
  formatCents,
  TRAINING_BILLING_API,
  shortDate,
  type CenterInvoice,
  type TrainingCenterBilling,
} from '../data/training-billing';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';

type Method = 'pix' | 'card';

/** Mensagem curta do erro da callable. */
function messageOf(e: unknown, fallback: string): string {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
  return m && !/^internal$/i.test(m) ? m : fallback;
}

/**
 * W2 · Fatura do centro na web — Pix (QR + copia-e-cola) e cartão pela página segura do provedor,
 * com "Já paguei · verificar". A cobrança é do CENTRO; só muda para paga quando o provedor confirma.
 */
@Component({
  selector: 'app-athlete-fatura-centro',
  standalone: true,
  imports: [AtPanelShellComponent, NxPageLoadingComponent, RouterLink],
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <header class="ms-header">
        <h1>{{ invoice()?.reference ? 'Fatura · ' + invoice()!.reference : 'Fatura' }}</h1>
        <div class="ms-sub">{{ center()?.name ?? 'Centro de treinamento' }}</div>
      </header>
      <div class="ms-body">
        @if (loading()) {
          <app-nx-page-loading title="Carregando a fatura…" subtitle="Centro de treinamento" />
        } @else if (!invoice()) {
          <div class="ms-note"><strong>Fatura não encontrada</strong>Ela não está mais na sua lista. Confira as mensalidades.</div>
          <a class="ms-btn ghost" routerLink="/mensalidades" style="align-self: flex-start">Voltar para Mensalidades</a>
        } @else {
          @let i = invoice()!;
          <div class="ms-grid">
            <div style="display: flex; flex-direction: column; gap: 14px">
              <div class="ms-card">
                <div class="ms-kicker">{{ center()!.name }}</div>
                <div class="ms-big" style="font-size: 30px">{{ money(i.amountCents) }}</div>
                <div class="ms-line">{{ paid() ? 'Paga' + (i.paidOn ? ' em ' + short(i.paidOn) : '') : (late() ? 'Venceu ' : 'Vence ') + short(i.dueDate) }}</div>
                <div style="margin-top: 12px">
                  <div class="ms-kv"><span>Referência</span><span>{{ i.reference }}</span></div>
                  @if (enrollmentLine()) {
                    <div class="ms-kv"><span>Turma</span><span>{{ enrollmentLine() }}</span></div>
                  }
                  <div class="ms-kv"><span>Cobrado por</span><span>{{ center()!.name }}</span></div>
                  <div class="ms-kv"><span>Fatura</span><span style="font-family: var(--nx-font-mono)">{{ i.invoiceId }}</span></div>
                </div>
              </div>
              <div class="ms-line">A cobrança é do centro, não do professor. A fatura só muda para paga quando o provedor confirma.</div>
            </div>

            <div class="ms-card ms-pay">
              @if (paid()) {
                <div class="ms-paid">
                  <div class="ms-kicker" style="color: var(--nx-win)">Pagamento confirmado</div>
                  <div class="ms-big">Mensalidade paga</div>
                  <div class="ms-line">O recibo é enviado pelo centro.</div>
                </div>
              } @else {
                <div style="font: 700 15px var(--nx-font-display); color: var(--nx-text)">Pagar agora</div>
                @if (i.status === 'failed') {
                  <div class="ms-note red"><strong>Pagamento não aprovado</strong>O cartão foi recusado. Pague com Pix ou tente outro cartão.</div>
                }
                <div class="ms-seg" role="tablist">
                  <button type="button" [class.on]="method() === 'pix'" (click)="method.set('pix')">Pix</button>
                  <button type="button" [class.on]="method() === 'card'" (click)="method.set('card')">Cartão</button>
                </div>
                @if (method() === 'pix') {
                  @if (pixLoading()) {
                    <div class="ms-line">Gerando o Pix…</div>
                  } @else if (pixError()) {
                    <div class="ms-note red"><strong>Não deu para gerar o Pix</strong>{{ pixError() }}</div>
                    <button type="button" class="ms-btn ghost" (click)="loadPix()">Tentar de novo</button>
                  } @else if (qr()) {
                    <div class="ms-pix">
                      <img [src]="qr()" alt="QR do Pix" />
                      <div style="display: flex; flex-direction: column; gap: 10px; flex: 1">
                        <div class="ms-line">Escaneie com o app do banco ou copie o código.</div>
                        <button type="button" class="ms-btn ghost" (click)="copy()">{{ copied() ? 'Código copiado' : 'Copiar código Pix' }}</button>
                      </div>
                    </div>
                  } @else {
                    <div class="ms-line">O Pix copia-e-cola não veio agora. Pague pela fatura, que aceita Pix e cartão.</div>
                    @if (payUrl()) {
                      <a class="ms-btn ghost" [href]="payUrl()" target="_blank" rel="noopener">Abrir fatura</a>
                    }
                  }
                } @else {
                  <div class="ms-line">O cartão é digitado na página segura do provedor. O NexaGO não guarda os dados do cartão.</div>
                  <a class="ms-btn" [class.wide]="true" [attr.href]="payUrl()" target="_blank" rel="noopener" [attr.aria-disabled]="!payUrl()">Pagar com cartão</a>
                }
                @if (checked() && checked() !== 'approved') {
                  <div class="ms-note"><strong>Ainda não confirmou</strong>Se você acabou de pagar, o banco pode levar alguns minutos. Não pague de novo.</div>
                }
                @if (checkError()) {
                  <div class="ms-note red">{{ checkError() }}</div>
                }
                <button type="button" class="ms-btn wide" [disabled]="checking()" (click)="check()">
                  {{ checking() ? 'Verificando…' : 'Já paguei · verificar' }}
                </button>
              }
            </div>
          </div>
          <a class="ms-btn ghost" routerLink="/mensalidades" style="align-self: flex-start">Voltar para Mensalidades</a>
        }
      </div>
    </app-at-panel-shell>
  `,
  styleUrl: './mensalidades.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteFaturaCentroComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(TRAINING_BILLING_API);
  private readonly route = inject(ActivatedRoute);
  private readonly centerId = this.route.snapshot.paramMap.get('centerId') ?? '';
  private readonly invoiceId = this.route.snapshot.paramMap.get('invoiceId') ?? '';

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly loading = signal(true);
  protected readonly center = signal<TrainingCenterBilling | null>(null);
  protected readonly invoice = signal<CenterInvoice | null>(null);
  protected readonly method = signal<Method>('pix');
  protected readonly qr = signal<string | null>(null);
  private readonly pixPayload = signal('');
  private readonly pixUrl = signal<string | null>(null);
  protected readonly pixLoading = signal(false);
  protected readonly pixError = signal('');
  protected readonly copied = signal(false);
  protected readonly checking = signal(false);
  protected readonly checked = signal<string | null>(null);
  protected readonly checkError = signal('');

  protected readonly paid = computed(() => this.invoice()?.status === 'approved' || this.checked() === 'approved');
  protected readonly late = computed(() => {
    const i = this.invoice();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    return !!i && i.dueDate !== '' && i.dueDate < today;
  });
  protected readonly payUrl = computed(() => this.invoice()?.payUrl ?? this.pixUrl());
  protected readonly enrollmentLine = computed(() => {
    const e = this.center()?.enrollments[0];
    return e ? `${e.className} · ${e.planName}` : '';
  });

  constructor() {
    this.api
      .fetchTrainingCenters()
      .then((list) => {
        const c = list.find((x) => x.centerId === this.centerId) ?? null;
        this.center.set(c);
        const inv = c?.invoices.find((i) => i.invoiceId === this.invoiceId) ?? null;
        this.invoice.set(inv);
        if (inv && (inv.status === 'pending' || inv.status === 'failed')) void this.loadPix();
      })
      .catch(() => this.center.set(null))
      .finally(() => this.loading.set(false));
  }

  protected async loadPix(): Promise<void> {
    this.pixLoading.set(true);
    this.pixError.set('');
    try {
      const p = await this.api.fetchCenterInvoicePix(this.centerId, this.invoiceId);
      this.pixPayload.set(p.pixPayload);
      this.pixUrl.set(p.invoiceUrl);
      this.qr.set(await pixQrSvgDataUrl(p.pixPayload));
    } catch (e) {
      this.pixError.set(messageOf(e, 'Tente de novo em instantes.'));
    } finally {
      this.pixLoading.set(false);
    }
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pixPayload());
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  protected async check(): Promise<void> {
    this.checking.set(true);
    this.checkError.set('');
    try {
      this.checked.set(await this.api.checkCenterInvoice(this.centerId, this.invoiceId));
    } catch (e) {
      this.checkError.set(messageOf(e, 'Não foi possível verificar agora. Tente de novo.'));
    } finally {
      this.checking.set(false);
    }
  }

  protected money(cents: number): string {
    return formatCents(cents);
  }

  protected short(d: string | null): string {
    return shortDate(d);
  }
}
