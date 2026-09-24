import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { PanelStockComponent } from './panel-stock.component';
import type { ArenaProduct } from './product.model';

/** Sinais protegidos que o teste alimenta na mão — o `effect` do construtor sai antes de
 *  tocar no Firestore porque `arenaId()` é `null` (mesmo truque do spec do fiscal). */
interface StockInternals {
  products: WritableSignal<ArenaProduct[]>;
  loading: WritableSignal<boolean>;
}

function contextStub() {
  return {
    arenaId: () => null,
    loading: () => false,
    notFound: () => false,
    arenaName: () => 'Arena X',
    hasCapability: () => true,
    managedArenas: () => [],
  };
}

function product(overrides: Partial<ArenaProduct> = {}): ArenaProduct {
  return {
    id: 'p1',
    name: 'Água mineral 500ml',
    category: 'bebidas',
    active: true,
    priceCents: 1000,
    stockQuantity: 10,
    minStockQuantity: 2,
    emoji: '💧',
    ...overrides,
  };
}

function render(products: ArenaProduct[]): ComponentFixture<PanelStockComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ArenaContextService, useValue: contextStub() },
      { provide: ArenaAccessService, useValue: { isOwner: () => true, canRead: () => true, canWrite: () => true } },
      { provide: AuthService, useValue: { user: signal({ uid: 'u1' }), displayName: () => 'Arena X' } },
    ],
  });
  const fixture = TestBed.createComponent(PanelStockComponent);
  const internals = fixture.componentInstance as unknown as StockInternals;
  internals.products.set(products);
  internals.loading.set(false);
  fixture.detectChanges();
  return fixture;
}

function marginCells(fixture: ComponentFixture<PanelStockComponent>): HTMLElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.product-margin'));
}

describe('PanelStockComponent — coluna de margem', () => {
  it('mostra a margem do produto com custo informado', () => {
    const cells = marginCells(render([product({ priceCents: 1000, costCents: 400 })]));

    expect(cells.length).toBe(1);
    expect(cells[0].textContent?.trim()).toBe('60%');
  });

  it('mostra travessão para produto sem custo informado', () => {
    const cells = marginCells(render([product({ priceCents: 1000, costCents: undefined })]));

    expect(cells[0].textContent?.trim()).toBe('—');
  });

  it('marca a margem negativa quando o custo passa do preço de venda', () => {
    const cells = marginCells(render([product({ priceCents: 1000, costCents: 1200 })]));

    expect(cells[0].textContent?.trim()).toBe('-20%');
    expect(cells[0].classList.contains('negative')).toBeTrue();
  });

  it('não marca como negativa a margem saudável', () => {
    const cells = marginCells(render([product({ priceCents: 1000, costCents: 400 })]));

    expect(cells[0].classList.contains('negative')).toBeFalse();
  });
});

describe('PanelStockComponent — KPI de valor em estoque', () => {
  it('mostra custo e lucro do estoque quando algum produto tem custo', () => {
    const fixture = render([product({ priceCents: 1000, costCents: 400, stockQuantity: 10 })]);
    const sub = (fixture.nativeElement as HTMLElement).querySelector('.summary-sub');

    // 10 unidades: custo 10 × R$ 4,00 = R$ 40,00 · lucro 10 × R$ 6,00 = R$ 60,00
    expect(sub?.textContent).toContain('40,00');
    expect(sub?.textContent).toContain('60,00');
  });

  it('esconde a linha de custo quando nenhum produto tem custo informado', () => {
    const fixture = render([product({ costCents: undefined })]);

    expect((fixture.nativeElement as HTMLElement).querySelector('.summary-sub')).toBeNull();
  });
});
