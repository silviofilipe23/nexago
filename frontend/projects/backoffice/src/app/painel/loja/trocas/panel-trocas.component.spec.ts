import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { StoreBadgesService } from '../../data/store-badges.service';
import type { StockRow } from '../estoque/data/stock';
import { StockRepository } from '../estoque/data/stock.repository';
import { DEFAULT_RETURNS_CONFIG, returnFromDoc } from './data/returns';
import { ReturnsRepository } from './data/returns.repository';
import { PanelTrocasComponent } from './panel-trocas.component';

const today = new Date();
const iso = (daysAgo: number) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const doc = (id: string, over: Record<string, unknown>) =>
  returnFromDoc(id, {
    code: id.toUpperCase(), status: 'analisar', version: 1, customer: { name: 'Juliana Prado' },
    item: { productId: 'p', skuId: 'laranja_p', skuCode: 'NX-CAM-LARANJA-P', productName: 'Camiseta Dry', variantLabel: 'Laranja · P' },
    newItem: { productId: 'p', skuId: 'laranja_m', skuCode: 'NX-CAM-LARANJA-M', productName: 'Camiseta Dry', variantLabel: 'Laranja · M' },
    reason: 'tamanho', resolution: 'troca', deliveredAt: iso(11), orderRef: 'NX-4790', orderDate: iso(13),
    returnMethod: { type: 'arena', locationId: 'arena-errejota', costCents: 0, paidBy: 'cliente' },
    message: 'Ficou apertada', createdAt: new Date(today.getTime() - 2 * 86_400_000), ...over,
  });

const LIST = [
  doc('tc-031', {}),
  doc('tc-030', { reason: 'defeito', resolution: 'reembolso', newItem: null, createdAt: new Date(today.getTime() - 5 * 86_400_000) }),
  doc('tc-029', { status: 'em_transito', resolution: 'saldo', newItem: null }),
  doc('tc-028', { status: 'concluida' }),
];

const M_ROW = { productId: 'p', skuId: 'laranja_m', total: 7, byLocation: { cd: 5, 'arena-errejota': 2 }, reservedByLocation: {}, imageUrl: null } as unknown as StockRow;

describe('PanelTrocasComponent', () => {
  let act: jasmine.Spy;

  async function mount(stockRows: StockRow[] = [M_ROW], list = LIST): Promise<HTMLElement> {
    act = jasmine.createSpy('act').and.resolveTo({ version: 2, status: 'aprovada' });
    await TestBed.configureTestingModule({
      imports: [PanelTrocasComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        { provide: ReturnsRepository, useValue: { list: () => Promise.resolve(list), config: () => Promise.resolve(DEFAULT_RETURNS_CONFIG), act } },
        { provide: StockRepository, useValue: { load: () => Promise.resolve({ rows: stockRows, locations: [{ id: 'cd', name: 'CD Goiânia', type: 'cd' }, { id: 'arena-errejota', name: 'Arena Errejota', type: 'arena' }], movements: [] }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelTrocasComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }
  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }
  const codes = (host: HTMLElement) => [...host.querySelectorAll('.tr:not(.th) .code')].map((e) => e.textContent!.trim());

  it('abas com contagem; "Para analisar" é fila (mais antiga primeiro)', async () => {
    const host = await mount();
    const tabs = [...host.querySelectorAll('.tabs button')].map((e) => e.textContent!.replace(/\s+/g, ' ').trim());
    expect(tabs).toEqual(['Para analisar 2', 'Aguardando produto 1', 'Concluídas 1', 'Recusadas 0']);
    expect(codes(host)).toEqual(['TC-030', 'TC-031']);
    expect(TestBed.inject(StoreBadgesService).returnsToReview()).toBe(2);
  });

  it('painel da troca: estoque da variação nova, devolução e prazo; aprovar manda a resolução', async () => {
    const host = await mount();
    (host.querySelectorAll('.tr:not(.th)')[1] as HTMLElement).click();
    await settle();
    const checks = [...host.querySelectorAll('.checks > div')].map((d) => [d.querySelector('dt')!.textContent!.trim(), d.querySelector('dd')!.textContent!.trim()]);
    expect(checks).toEqual([
      ['Estoque do Laranja · M', '7 un. · Arena Errejota: 2'],
      ['Devolução', 'Na Arena Errejota · sem custo'],
      ['Prazo de 30 dias', 'Dentro (dia 12)'],
    ]);
    const approve = [...host.querySelectorAll('.actions button')].find((b) => b.textContent!.includes('Aprovar troca na arena')) as HTMLElement;
    approve.click();
    await settle();
    expect(act).toHaveBeenCalledWith(jasmine.objectContaining({ returnId: 'tc-031', action: 'aprovar', resolution: 'troca' }));
  });

  it('sem a variação nova no local, sugere aprovar como saldo na carteira', async () => {
    const host = await mount([{ ...M_ROW, byLocation: { cd: 5 } } as StockRow]);
    (host.querySelectorAll('.tr:not(.th)')[1] as HTMLElement).click();
    await settle();
    const primary = host.querySelector('.actions .bo-mini-btn-primary')!;
    expect(primary.textContent).toContain('Aprovar como saldo na carteira');
  });

  it('fora do prazo pede confirmação antes de aprovar', async () => {
    const host = await mount([M_ROW], [doc('tc-027', { deliveredAt: iso(40) })]);
    expect(host.querySelector('.checks .bad dd')!.textContent!.trim()).toBe('Fora (dia 41)');
    (host.querySelector('.actions .bo-mini-btn-primary') as HTMLElement).click();
    await settle();
    expect(act).not.toHaveBeenCalled();
    const dialog = [...host.querySelectorAll('dialog')].find((d) => d.textContent!.includes('Fora do prazo'))!;
    expect(dialog.open).toBeTrue();
    ([...dialog.querySelectorAll('button')].find((b) => b.textContent!.includes('Aprovar mesmo assim')) as HTMLElement).click();
    await settle();
    expect(act).toHaveBeenCalledWith(jasmine.objectContaining({ action: 'aprovar', confirmOutOfWindow: true }));
  });

  it('aba vazia mostra a mensagem certa', async () => {
    const host = await mount();
    (host.querySelectorAll('.tabs button')[3] as HTMLElement).click();
    await settle();
    expect(host.querySelector('.empty')!.textContent).toContain('Nenhuma solicitação recusada');
    expect(host.querySelector('.placeholder')!.textContent).toContain('Selecione uma solicitação');
  });
});
