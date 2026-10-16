import { ApplicationRef, provideZonelessChangeDetection, signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import type { StockRow } from './data/stock';
import { StockRepository, type TransferDoc } from './data/stock.repository';
import { StockEntryComponent } from './entrada/stock-entry.component';
import { StockTransferComponent } from './transferencia/stock-transfer.component';

const row = (over: Partial<StockRow>): StockRow => ({
  productId: 'p', productName: 'Óculos Polarizado', skuId: 'unico', skuCode: 'NX-OCU', barcode: '789',
  variantLabel: 'Fumê · único', category: 'acessorios', imageUrl: null, byLocation: { cd: 22, 'arena-cfc': 1 },
  total: 23, reservedByLocation: {}, reserved: 0, threshold: 3, costCents: 5780, lastCostCents: 5790, ...over,
});

const LOCATIONS = [
  { id: 'cd', name: 'CD Goiânia', type: 'cd' as const },
  { id: 'arena-cfc', name: 'Arena CFC', type: 'arena' as const },
];

function repoFake(extra: Record<string, unknown> = {}) {
  return {
    load: () => Promise.resolve({ locations: LOCATIONS, rows: [row({}), row({ productId: 'q', skuId: 'm', productName: 'Camiseta', skuCode: 'NX-CAM-M', barcode: '111', byLocation: { cd: 4 }, total: 4 })], movements: [] }),
    suggestions: () => Promise.resolve({ suppliers: ['Sunline'], transports: [], receivers: [] }),
    entryDraft: () => Promise.resolve(null),
    transfer: () => Promise.resolve(null),
    confirmEntry: jasmine.createSpy('confirmEntry').and.resolveTo({ movementId: 'x', units: 1 }),
    saveEntryDraft: jasmine.createSpy('saveEntryDraft').and.resolveTo(undefined),
    saveTransfer: jasmine.createSpy('saveTransfer').and.resolveTo({ transferId: 't1', code: 'TR-001', version: 2, status: 'separacao' }),
    advanceTransfer: jasmine.createSpy('advanceTransfer').and.resolveTo({ version: 4, status: 'recebido' }),
    ...extra,
  };
}

async function mount<T>(cmp: Type<T>, repo: ReturnType<typeof repoFake>, params: Record<string, string> = {}, query: Record<string, string> = {}) {
  await TestBed.configureTestingModule({
    imports: [cmp],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
      { provide: StockRepository, useValue: repo },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params), queryParamMap: convertToParamMap(query) } } },
    ],
  }).compileComponents();
  spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  const fixture = TestBed.createComponent(cmp);
  fixture.detectChanges();
  await settle();
  return fixture.nativeElement as HTMLElement;
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r));
  await TestBed.inject(ApplicationRef).whenStable();
}

const click = async (el: Element | null) => {
  (el as HTMLElement).click();
  await settle();
};
const byText = (host: HTMLElement, sel: string, text: string) =>
  [...host.querySelectorAll(sel)].find((e) => e.textContent!.includes(text)) ?? null;

describe('06a · Registrar entrada', () => {
  it('"Repor" chega com o SKU na linha e o custo da última compra', async () => {
    const host = await mount(StockEntryComponent, repoFake(), {}, { sku: 'q/m' });
    const rows = host.querySelectorAll('.tr:not(.th)');
    expect(rows.length).toBe(1);
    expect(rows[0]!.querySelector('.name')!.textContent).toContain('Camiseta');
  });

  it('confirmar sem fornecedor e NF mostra os erros e não chama o servidor', async () => {
    const repo = repoFake();
    const host = await mount(StockEntryComponent, repo, {}, { sku: 'p/unico' });
    await click(byText(host, 'button', 'Confirmar entrada'));
    expect(repo.confirmEntry).not.toHaveBeenCalled();
    expect(host.querySelector('#f-supplier')!.classList).toContain('err');
  });

  it('ajuste de inventário só pede motivo e manda a entrada para o servidor', async () => {
    const repo = repoFake();
    const host = await mount(StockEntryComponent, repo, {}, { sku: 'p/unico' });
    await click(byText(host, '.segmented button', 'Ajuste de inventário'));
    const reason = host.querySelector('#f-reason') as HTMLInputElement;
    reason.value = 'Inventário semanal';
    reason.dispatchEvent(new Event('input'));
    await settle();
    await click(byText(host, 'button', 'Confirmar entrada'));
    expect(repo.confirmEntry).toHaveBeenCalled();
    const payload = repo.confirmEntry.calls.mostRecent().args[0] as Record<string, unknown>;
    expect(payload['subtype']).toBe('ajuste');
    expect(payload['reason']).toBe('Inventário semanal');
    expect(payload['items']).toEqual([{ productId: 'p', skuId: 'unico', qty: 1, unitCostCents: 5790 }]);
  });

  it('alerta quando o custo foge mais de 5% da última compra', async () => {
    const host = await mount(StockEntryComponent, repoFake(), {}, { sku: 'p/unico' });
    const cost = host.querySelector('.tr:not(.th) .affix input') as HTMLInputElement;
    cost.value = '62,50';
    cost.dispatchEvent(new Event('change'));
    await settle();
    expect(host.querySelector('.warn-box')!.textContent).toContain('8% acima');
  });
});

describe('06b · Nova transferência', () => {
  it('"Transferir" chega com o SKU e o sugerido; criar manda submit para o servidor', async () => {
    const repo = repoFake();
    const host = await mount(StockTransferComponent, repo, {}, { sku: 'p/unico' });
    const line = host.querySelector('.tr:not(.th)')!;
    expect(line.querySelector('.sugg')!.textContent!.trim()).toBe('2');
    await click(byText(host, 'button', 'Criar transferência'));
    const payload = repo.saveTransfer.calls.mostRecent().args[0] as Record<string, unknown>;
    expect(payload['submit']).toBeTrue();
    expect(payload['fromLocationId']).toBe('cd');
    expect(payload['toLocationId']).toBe('arena-cfc');
    expect(payload['items']).toEqual([{ productId: 'p', skuId: 'unico', qty: 2 }]);
  });

  it('preencher com sugerido semeia os SKUs que precisam de reposição', async () => {
    const host = await mount(StockTransferComponent, repoFake());
    await click(byText(host, 'button', 'Preencher com sugerido'));
    // Óculos tem 1 na arena (alerta 3 → 2); Camiseta tem 0 lá (→ 3, limitado aos 4 do CD).
    const names = [...host.querySelectorAll('.tr:not(.th) .name')].map((e) => e.textContent!.trim());
    expect(names).toEqual(['Óculos Polarizado', 'Camiseta']);
  });

  it('em trânsito: confere o recebido e manda a divergência', async () => {
    const doc: TransferDoc = {
      id: 't1', code: 'TR-118', status: 'em_transito', version: 3, fromLocationId: 'cd', toLocationId: 'arena-cfc',
      items: [{ productId: 'p', skuId: 'unico', qty: 6, skuCode: 'NX-OCU', productName: 'Óculos', variantLabel: '' }],
      units: 6, transport: '', departAt: '', arriveAt: '', receiver: '', note: '', history: [],
    };
    const repo = repoFake({ transfer: () => Promise.resolve(doc) });
    const host = await mount(StockTransferComponent, repo, { id: 't1' });
    expect(host.querySelector('h1')!.textContent).toContain('TR-118');
    await click(host.querySelector('bo-qty-stepper button[aria-label="Diminuir"]'));
    expect(host.querySelector('input[placeholder*="avariada"]')).not.toBeNull();
    await click(byText(host, 'button', 'Confirmar recebimento'));
    const payload = repo.advanceTransfer.calls.mostRecent().args[0] as Record<string, unknown>;
    expect(payload['action']).toBe('recebido');
    expect(payload['received']).toEqual({ 'p/unico': 5 });
  });
});
