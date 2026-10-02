import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { DEFAULT_CASHBACK_CONFIG, type CashbackConfig } from '../data/cashback-model';
import { CheckoutCashbackToggleComponent } from './checkout-cashback-toggle.component';

/** Pai de mentira: prova o two-way `[(use)]` com um signal, como os checkouts usam. */
@Component({
  standalone: true,
  imports: [CheckoutCashbackToggleComponent],
  template: `
    <app-checkout-cashback-toggle
      [priceReais]="price()"
      [availableCents]="available()"
      [config]="config()"
      [chargeLabel]="label()"
      [(use)]="use"
    />
  `,
})
class HostComponent {
  readonly price = signal(120);
  readonly available = signal(1240);
  readonly config = signal<CashbackConfig>({ ...DEFAULT_CASHBACK_CONFIG, enabled: true });
  readonly label = signal('PIX');
  readonly use = signal(false);
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('CheckoutCashbackToggleComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function sw(): HTMLButtonElement | null {
    return el().querySelector('[role="switch"]');
  }

  it('com saldo usável: switch desligado por padrão, mostrando o disponível', () => {
    expect(sw()).not.toBeNull();
    expect(sw()!.getAttribute('aria-checked')).toBe('false');
    expect(text(el().querySelector('.cbt-title'))).toBe('Usar meu cashback');
    expect(text(el().querySelector('.cbt-sub'))).toBe('R$ 12,40 disponível');
  });

  it('clicar liga, devolve o estado ao pai e mostra o valor usado', () => {
    sw()!.click();
    fixture.detectChanges();
    expect(host.use()).toBeTrue();
    expect(sw()!.getAttribute('aria-checked')).toBe('true');
    expect(text(el().querySelector('.cbt-sub'))).toBe('Usando R$ 12,40');
  });

  it('mínimo em dinheiro travando: avisa que o mínimo vai na cobrança', () => {
    host.price.set(20);
    host.available.set(5000);
    host.use.set(true);
    fixture.detectChanges();
    expect(text(el().querySelector('.cbt-sub'))).toBe('Usando R$ 15,00 (o mínimo de R$ 5,00 vai no PIX)');

    host.label.set('cartão');
    fixture.detectChanges();
    expect(text(el().querySelector('.cbt-sub'))).toBe('Usando R$ 15,00 (o mínimo de R$ 5,00 vai no cartão)');
  });

  it('sem saldo usável: sem switch, só a linha de ganho', () => {
    host.available.set(0);
    fixture.detectChanges();
    expect(sw()).toBeNull();
    expect(text(el().querySelector('.cbt-earn'))).toBe('Ganhe até 2% de volta neste pagamento');
  });

  it('preço no mínimo (clubinho de R$ 5): sem switch mesmo com saldo', () => {
    host.price.set(5);
    fixture.detectChanges();
    expect(sw()).toBeNull();
    expect(el().querySelector('.cbt-earn')).not.toBeNull();
  });

  it('recurso desligado: nada', () => {
    host.config.set({ ...DEFAULT_CASHBACK_CONFIG, enabled: false });
    fixture.detectChanges();
    expect(text(el())).toBe('');
  });
});
