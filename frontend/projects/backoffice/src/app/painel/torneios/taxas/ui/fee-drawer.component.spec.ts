import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { FeeRow } from '../data/fee-rows';
import { feeOverrideFromRaw, type ResolvedFeeRule } from '../data/tournament-fees';
import { FeeDrawerComponent, type FeeSaveRequest } from './fee-drawer.component';

const TODAY = '2026-10-26';
const BASE: ResolvedFeeRule = { percent: 8, floorReais: 1.5, payer: 'organizador', source: 'default' };

function row(overrides: Partial<FeeRow> = {}): FeeRow {
  return {
    tournament: {
      id: 't1', name: 'Open Goiás', sport: null, status: 'inscricoes', visibility: null, startAt: null, place: null,
      categoriesCount: 1, capacity: null, managerId: 'o1', entryFeeReais: { min: 100, max: 100 },
    },
    organizerName: 'Federação Goiana',
    override: null,
    version: 0,
    base: BASE,
    rule: BASE,
    expired: false,
    ...overrides,
  };
}

describe('FeeDrawerComponent: quem paga', () => {
  async function mount(r: FeeRow): Promise<ComponentFixture<FeeDrawerComponent>> {
    await TestBed.configureTestingModule({
      imports: [FeeDrawerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(FeeDrawerComponent);
    fixture.componentRef.setInput('row', r);
    fixture.componentRef.setInput('today', TODAY);
    fixture.componentRef.setInput('history', []);
    fixture.componentRef.setInput('canEdit', true);
    await fixture.whenStable();
    return fixture;
  }

  const button = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label)!;

  /** Linha da comparação Atual × Nova: [rótulo, atual, nova]. */
  const cmp = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll('.cmp-row')]
      .map((r) => [...r.children].map((c) => c.textContent!.replace(/\s+/g, ' ').trim()))
      .find((cells) => cells[0] === label)!;

  it('personalizada com atleta pagando: compara Atual × Nova com a taxa por cima do preço', async () => {
    const fixture = await mount(row());
    const host = fixture.nativeElement as HTMLElement;

    button(host, 'Personalizada').click();
    await fixture.whenStable();
    expect(host.textContent).toContain('Quem paga a taxa');
    expect(host.textContent).toContain('o preço para o atleta não muda');

    button(host, 'Atleta').click();
    await fixture.whenStable();
    expect(cmp(host, 'Atleta paga')).toEqual(['Atleta paga', 'R$ 100,00', 'R$ 108,00']);
    expect(cmp(host, 'Organizador recebe')).toEqual(['Organizador recebe', 'R$ 92,00', 'R$ 100,00']);
    expect(cmp(host, 'NexaGO recebe')).toEqual(['NexaGO recebe', 'R$ 8,00', 'R$ 8,00']);
    expect(host.querySelector('.cmp-row .b.hl')).not.toBeNull();
    expect(host.textContent).toContain('O atleta paga a taxa por cima do preço da inscrição');
  });

  it('salva o quem paga escolhido junto da exceção', async () => {
    const fixture = await mount(row());
    const host = fixture.nativeElement as HTMLElement;
    const saved: FeeSaveRequest[] = [];
    fixture.componentInstance.save.subscribe((r) => saved.push(r));

    button(host, 'Personalizada').click();
    await fixture.whenStable();
    button(host, 'Dividido').click();
    button(host, 'Parceria comercial').click();
    await fixture.whenStable();
    expect(cmp(host, 'Atleta paga')).toEqual(['Atleta paga', 'R$ 100,00', 'R$ 104,00']);

    button(host, 'Salvar taxa').click();
    expect(saved.length).toBe(1);
    expect(saved[0]!.draft.mode).toBe('custom');
    expect(saved[0]!.draft.payer).toBe('dividido');
  });

  it('exceção gravada com o atleta pagando abre com o seletor nele; só trocar quem paga é mudança', async () => {
    const override = feeOverrideFromRaw({
      mode: 'custom', percent: 8, floorReais: 1.5, payer: 'atleta', reason: 'Parceria comercial', until: null,
    });
    const rule: ResolvedFeeRule = { percent: 8, floorReais: 1.5, payer: 'atleta', source: 'tournament' };
    const fixture = await mount(row({ override, rule, version: 1 }));
    const host = fixture.nativeElement as HTMLElement;

    expect(button(host, 'Atleta').getAttribute('aria-checked')).toBe('true');
    expect(button(host, 'Salvar taxa').disabled).toBeTrue();
    expect(cmp(host, 'Atleta paga')).toEqual(['Atleta paga', 'R$ 108,00', 'R$ 108,00']);

    button(host, 'Organizador').click();
    await fixture.whenStable();
    expect(button(host, 'Salvar taxa').disabled).toBeFalse();
    expect(cmp(host, 'Atleta paga')).toEqual(['Atleta paga', 'R$ 108,00', 'R$ 100,00']);
  });
});
