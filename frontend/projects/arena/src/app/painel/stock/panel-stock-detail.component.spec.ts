import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { PanelStockDetailComponent } from './panel-stock-detail.component';
import type { ArenaProduct } from './product.model';

/** O `effect` do construtor sai antes de tocar no Firestore porque `arenaId()` é `null`;
 *  o produto entra pela mão, como se tivesse vindo do `fetchProductWithCost`. */
interface DetailInternals {
  product: WritableSignal<ArenaProduct | null>;
  loading: WritableSignal<boolean>;
  costValue: WritableSignal<string>;
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
    ...overrides,
  };
}

function render(loaded: ArenaProduct): ComponentFixture<PanelStockDetailComponent> {
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
  const fixture = TestBed.createComponent(PanelStockDetailComponent);
  fixture.componentRef.setInput('id', loaded.id);
  const internals = fixture.componentInstance as unknown as DetailInternals;
  internals.product.set(loaded);
  internals.loading.set(false);
  fixture.detectChanges();
  return fixture;
}

function internals(fixture: ComponentFixture<PanelStockDetailComponent>): DetailInternals {
  return fixture.componentInstance as unknown as DetailInternals;
}

function text(fixture: ComponentFixture<PanelStockDetailComponent>, selector: string): string {
  return (fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent?.trim() ?? '';
}

describe('PanelStockDetailComponent — campo de custo', () => {
  it('preenche o campo com o custo gravado', () => {
    const fixture = render(product({ costCents: 400 }));

    expect(internals(fixture).costValue()).toBe('4,00');
  });

  it('deixa o campo vazio quando o produto não tem custo — não mostra 0,00', () => {
    const fixture = render(product({ costCents: undefined }));

    expect(internals(fixture).costValue()).toBe('');
  });
});

describe('PanelStockDetailComponent — margem e valor em estoque', () => {
  it('mostra margem e lucro por unidade a partir do custo', () => {
    const fixture = render(product({ priceCents: 1000, costCents: 400 }));

    expect(text(fixture, '.margin-hint')).toContain('60%');
    expect(text(fixture, '.margin-hint')).toContain('6,00');
  });

  it('pede o custo quando ele não foi informado', () => {
    const fixture = render(product({ costCents: undefined }));

    expect(text(fixture, '.margin-hint')).toContain('Informe o custo');
    expect(text(fixture, '.cost-hint')).toContain('Informe o preço de custo');
  });

  it('soma custo imobilizado e lucro potencial do estoque parado', () => {
    // 10 unidades a R$ 4,00 de custo e R$ 10,00 de venda.
    const fixture = render(product({ priceCents: 1000, costCents: 400, stockQuantity: 10 }));
    const rows = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(rows).toContain('Custo imobilizado');
    expect(rows).toContain('40,00');
    expect(rows).toContain('Lucro potencial');
    expect(rows).toContain('60,00');
  });

  it('acompanha o custo digitado na hora, sem esperar o salvar', () => {
    const fixture = render(product({ priceCents: 1000, costCents: 400 }));

    internals(fixture).costValue.set('8,00');
    fixture.detectChanges();

    expect(text(fixture, '.margin-hint')).toContain('20%');
  });

  it('marca prejuízo quando o custo passa do preço de venda', () => {
    const fixture = render(product({ priceCents: 1000, costCents: 1200 }));
    const hint = (fixture.nativeElement as HTMLElement).querySelector('.margin-hint');

    expect(hint?.textContent).toContain('-20%');
    expect(hint?.classList.contains('negative')).toBeTrue();
  });
});
