import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { RecordRevenueInput } from '../data/company-finance.repository';
import { saoPauloDay } from '../data/company-finance';
import { RecordRevenueDialogComponent } from './record-revenue-dialog.component';

const ARENAS = [
  { arenaId: 'a-veg', name: 'Vegeton Beach Club', planTier: 'pro' },
  { arenaId: 'a-sem', name: null, planTier: null },
];

describe('RecordRevenueDialogComponent', () => {
  let fixture: ComponentFixture<RecordRevenueDialogComponent>;
  let el: HTMLElement;
  let emitted: RecordRevenueInput[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RecordRevenueDialogComponent] });
    fixture = TestBed.createComponent(RecordRevenueDialogComponent);
    fixture.componentRef.setInput('arenas', ARENAS);
    fixture.componentRef.setInput('open', true);
    emitted = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  const save = () => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Registrar'))!;
  const type = (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const pickArena = (id: string) => {
    const s = el.querySelector<HTMLSelectElement>('select')!;
    s.value = id;
    s.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  it('lista as arenas com o plano e começa com hoje, sem poder salvar', () => {
    expect(el.textContent).toContain('Vegeton Beach Club · Pro');
    expect(el.textContent).toContain('Arena sem nome');
    expect(el.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe(saoPauloDay());
    expect(save().disabled).toBeTrue();
  });

  it('arena, valor e data válidos registram em centavos', () => {
    pickArena('a-veg');
    type('input[inputmode="decimal"]', '249,00');
    type('input[type="date"]', '2026-11-12');
    type('input[maxlength]', ' PIX direto ');
    expect(el.textContent).toContain('249,00');
    expect(save().disabled).toBeFalse();
    save().click();
    expect(emitted).toEqual([{ source: 'planosArena', arenaId: 'a-veg', amountCents: 24900, receivedOn: '2026-11-12', note: 'PIX direto' }]);
  });

  it('valor inválido, acima do teto ou data futura não salvam', () => {
    pickArena('a-veg');
    type('input[inputmode="decimal"]', 'abc');
    expect(el.textContent).toContain('Valor inválido');
    expect(save().disabled).toBeTrue();
    type('input[inputmode="decimal"]', '20.000,01');
    expect(save().disabled).toBeTrue();
    type('input[inputmode="decimal"]', '249');
    type('input[type="date"]', '2999-01-01');
    expect(save().disabled).toBeTrue();
  });
});
