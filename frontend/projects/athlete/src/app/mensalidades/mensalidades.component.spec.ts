import { Component, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { centersFromRaw, paymentsFromRaw, TRAINING_BILLING_API, type TrainingBillingApi } from '../data/training-billing';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { AthleteFaturaCentroComponent } from './athlete-fatura-centro.component';
import { AthleteMensalidadesComponent } from './athlete-mensalidades.component';

@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

const centers = centersFromRaw({
  centers: [
    {
      centerId: 'ct1',
      name: 'CT Areia Alta',
      enrollments: [{ className: 'Performance', planName: 'Mensal', priceCents: 48000, billing: { billingDay: 5, method: 'pix_manual' } }],
      invoices: [
        { invoiceId: 'i1', reference: 'Novembro', amountCents: 48000, dueDate: '2099-11-05', status: 'pending' },
        { invoiceId: 'i0', reference: 'Outubro', amountCents: 48000, dueDate: '2026-10-05', status: 'approved', paidOn: '2026-10-03' },
      ],
    },
  ],
});

function api(over: Partial<TrainingBillingApi> = {}): TrainingBillingApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetchBillingSources: async () => ({
      centers,
      charges: [],
      payments: paymentsFromRaw({
        payments: [{ source: 'professor', chargeId: 'p1', payee: 'Prof. Thiago', description: 'Pacote 8 aulas', amountReais: 640, paidOn: '2026-10-01' }],
      }),
    }),
    fetchTrainingCenters: async () => centers,
    fetchCenterInvoicePix: async (c, i) => {
      calls.push(`pix ${c}/${i}`);
      return { status: 'pending', invoiceUrl: 'https://asaas/i/1', pixPayload: '00020126580014BR.GOV.BCB.PIX0136' + 'x'.repeat(40) };
    },
    checkCenterInvoice: async (c, i) => {
      calls.push(`check ${c}/${i}`);
      return 'approved';
    },
    ...over,
  };
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  for (let i = 0; i < 4; i++) {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  }
}

function setup(fake: TrainingBillingApi, params: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ uid: 'ana', displayName: 'Ana' }) } },
      { provide: TRAINING_BILLING_API, useValue: fake },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params) } } },
    ],
  });
  for (const c of [AthleteMensalidadesComponent, AthleteFaturaCentroComponent]) {
    TestBed.overrideComponent(c, { remove: { imports: [AtPanelShellComponent] }, add: { imports: [PanelShellStubComponent] } });
  }
}

describe('W1 · Mensalidades', () => {
  it('resumo, linhas das origens e Pagar abre a fatura do centro', async () => {
    setup(api());
    const fixture = TestBed.createComponent(AthleteMensalidadesComponent);
    await settle(fixture);
    const host = fixture.nativeElement as HTMLElement;
    expect(text(host.querySelector('.ms-tile .ms-big'))).toBe('R$ 480,00');
    const rows = [...host.querySelectorAll('.ms-row:not(.head)')];
    expect(rows.length).toBe(3);
    expect(text(rows[0]!.querySelector('.ms-title'))).toBe('Novembro');
    const pay = rows[0]!.querySelector('a.ms-btn') as HTMLAnchorElement;
    expect(pay.getAttribute('href')).toBe('/mensalidades/centro/ct1/i1');
    expect(text(host)).toContain('Prof. Thiago');
    expect(text(host)).toContain('Pix · todo dia 05');
  });
});

describe('W2 · Fatura do centro', () => {
  it('gera o Pix, verifica e mostra paga', async () => {
    const fake = api();
    setup(fake, { centerId: 'ct1', invoiceId: 'i1' });
    const fixture = TestBed.createComponent(AthleteFaturaCentroComponent);
    await settle(fixture);
    const host = fixture.nativeElement as HTMLElement;
    expect(fake.calls).toEqual(['pix ct1/i1']);
    expect(host.querySelector('.ms-pix img')).not.toBeNull();
    const check = [...host.querySelectorAll('button')].find((b) => text(b).startsWith('Já paguei')) as HTMLButtonElement;
    check.click();
    await settle(fixture);
    expect(fake.calls).toEqual(['pix ct1/i1', 'check ct1/i1']);
    expect(text(host)).toContain('Mensalidade paga');
  });

  it('fatura paga abre direto como paga, sem gerar Pix', async () => {
    const fake = api();
    setup(fake, { centerId: 'ct1', invoiceId: 'i0' });
    const fixture = TestBed.createComponent(AthleteFaturaCentroComponent);
    await settle(fixture);
    expect(fake.calls).toEqual([]);
    expect(text(fixture.nativeElement as HTMLElement)).toContain('Mensalidade paga');
  });
});
