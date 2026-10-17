import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import {
  commissionFromDoc,
  dayMonthOfKey,
  openPayoutDate,
  spDateKey,
  type Commission,
} from './data/commission';
import { CommissionsRepository, type PayoutState } from './data/commissions.repository';
import { PanelComissoesComponent } from './panel-comissoes.component';

const DAY = 24 * 60 * 60 * 1000;
/** Três dias atrás: sempre antes do fechamento do repasse em aberto, qualquer que seja hoje. */
const RELEASED = new Date(Date.now() - 3 * DAY);
const OPEN = openPayoutDate(spDateKey(new Date()), null, [6, 20]);

function c(id: string, over: Record<string, unknown> = {}): Commission {
  return commissionFromDoc(id, {
    ambassadorId: 'jv',
    ambassadorName: 'João Victor',
    ambassadorTier: 'amb',
    convertedLabel: 'Lucas M.',
    origin: 'code',
    netCents: 140_00,
    pct: 10,
    amountCents: 14_00,
    status: 'released',
    registeredAt: RELEASED,
    releasedAt: RELEASED,
    ...over,
  });
}

const LIST = [
  c('a'),
  c('b', { amountCents: 12_00, convertedLabel: 'Tatiane R.' }),
  c('c', { ambassadorId: 'ac', ambassadorName: 'Ana Clara Dias', amountCents: 6_00 }),
  c('p', { status: 'pending', releasedAt: null, convertedLabel: 'Equipe CFC (4 atl.)' }),
  c('x', { status: 'canceled', cancelReason: 'refund', convertedLabel: 'Henrique A.' }),
];

describe('PanelComissoesComponent', () => {
  let repo: {
    load: jasmine.Spy;
    payoutState: jasmine.Spy;
    ambassadors: jasmine.Spy;
    approve: jasmine.Spy;
    setHold: jasmine.Spy;
    cancel: jasmine.Spy;
    reassign: jasmine.Spy;
  };

  async function mount(roles: string[] = ['admin'], list: Commission[] = LIST): Promise<HTMLElement> {
    const state: PayoutState = {
      released: list.filter((x) => x.status === 'released'),
      adjustments: [],
      payouts: [],
      config: { days: [6, 20], minNetCents: 20_00 },
    };
    repo = {
      load: jasmine.createSpy('load').and.resolveTo(list),
      payoutState: jasmine.createSpy('payoutState').and.resolveTo(state),
      ambassadors: jasmine.createSpy('ambassadors').and.resolveTo([]),
      approve: jasmine
        .createSpy('approve')
        .and.resolveTo({ payoutId: OPEN, status: 'done', creditedCount: 1, failedCount: 0, totalCents: 26_00 }),
      setHold: jasmine.createSpy('setHold').and.resolveTo(undefined),
      cancel: jasmine.createSpy('cancel').and.resolveTo(undefined),
      reassign: jasmine.createSpy('reassign').and.resolveTo(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [PanelComissoesComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { displayName: signal('Lia Martins'), user: signal(null), roles: signal(roles), isSuperAdmin: signal(false) },
        },
        { provide: CommissionsRepository, useValue: repo },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelComissoesComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const button = (root: ParentNode, label: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).startsWith(label))!;
  const openDialog = (host: HTMLElement) => [...host.querySelectorAll('dialog')].find((d) => d.open)!;

  it('KPIs e faixa do repasse: só quem passa do mínimo entra', async () => {
    const host = await mount();
    const kpis = text(host.querySelector('bo-commission-kpis'));
    expect(kpis).toContain('R$ 32');
    expect(kpis).toContain('2 embaixadores');
    expect(kpis).toContain('1 reembolso');
    // João: 14 + 12 = 26 (entra); Ana Clara: 6 (acumula).
    const strip = text(host.querySelector('bo-payout-strip'));
    expect(strip).toContain(`Próximo repasse · ${dayMonthOfKey(OPEN)}`);
    expect(strip).toContain('R$ 26 para 1 embaixador');
  });

  it('abas mostram a contagem e filtram a tabela', async () => {
    const host = await mount();
    expect(text(button(host, 'Todas'))).toBe('Todas 5');
    expect(host.querySelectorAll('bo-commissions-table .row:not(.head)').length).toBe(5);
    button(host, 'Aguardando').click();
    await settle();
    const rows = host.querySelectorAll('bo-commissions-table .row:not(.head)');
    expect(rows.length).toBe(1);
    expect(text(rows[0]!)).toContain('Equipe CFC (4 atl.)');
    expect(text(rows[0]!)).toContain('Aguardando pgto');
  });

  it('só liberada pode ser marcada; marcar abre a barra de retenção em lote', async () => {
    const host = await mount();
    const boxes = [...host.querySelectorAll<HTMLInputElement>('bo-commissions-table input[type="checkbox"]')];
    const byLabel = (part: string) => boxes.find((b) => b.getAttribute('aria-label')!.includes(part))!;
    expect(byLabel('Equipe CFC').disabled).toBeTrue();
    expect(byLabel('Henrique').disabled).toBeTrue();

    byLabel('Tatiane').click();
    await settle();
    expect(text(host.querySelector('.batch'))).toContain('1 selecionada');

    button(host.querySelector('.batch')!, 'Reter no próximo repasse').click();
    await settle();
    const dialog = openDialog(host);
    const area = dialog.querySelector('textarea')!;
    area.value = 'Suspeita de fraude';
    area.dispatchEvent(new Event('input'));
    await settle();
    button(dialog, 'Reter').click();
    await settle();
    expect(repo.setHold).toHaveBeenCalledWith(['b'], OPEN, 'Suspeita de fraude');
    expect(host.querySelector('.batch')).toBeNull();
  });

  it('aprovar pede confirmação com o total e chama a callable do repasse em aberto', async () => {
    const host = await mount();
    button(host.querySelector('bo-payout-strip')!, 'Aprovar repasse').click();
    await settle();
    const dialog = openDialog(host);
    expect(text(dialog)).toContain('Creditar R$ 26,00 na carteira de 1 embaixador? Essa ação não pode ser desfeita.');
    expect(repo.approve).not.toHaveBeenCalled();

    button(dialog.querySelector('.actions') ?? dialog, 'Aprovar repasse').click();
    await settle();
    expect(repo.approve).toHaveBeenCalledWith(OPEN);
    expect(text(host.querySelector('.toast'))).toContain('Repasse aprovado · R$ 26,00 para 1 embaixador');
  });

  it('Revisar lista mostra quem entra, quem acumula e deixa reter com motivo', async () => {
    const host = await mount();
    button(host, 'Revisar lista').click();
    await settle();
    const drawer = host.querySelector('bo-payout-drawer')!;
    const rows = [...drawer.querySelectorAll('.row:not(.head)')].map(text);
    expect(rows[0]).toContain('Ana Clara Dias');
    expect(rows[0]).toContain('Acumulando');
    expect(rows[1]).toContain('João Victor');
    expect(rows[1]).toContain('Incluído');

    button(drawer, 'Reter').click();
    await settle();
    const area = drawer.querySelector('textarea')!;
    area.value = 'Contrato pausado';
    area.dispatchEvent(new Event('input'));
    await settle();
    button(drawer, 'Reter neste repasse').click();
    await settle();
    expect(repo.setHold).toHaveBeenCalledWith(['c'], OPEN, 'Contrato pausado');
  });

  it('clicar na linha abre a comissão com o cálculo', async () => {
    const host = await mount();
    (host.querySelectorAll<HTMLElement>('bo-commissions-table .row:not(.head)')[0]!).click();
    await settle();
    const drawer = text(host.querySelector('bo-commission-drawer'));
    expect(drawer).toContain('R$ 140,00 × 10% = R$ 14,00');
    expect(drawer).toContain('Cancelar comissão');
  });

  it('Growth vê e retém, mas não aprova nem cancela', async () => {
    const host = await mount(['growth']);
    expect(host.querySelector('bo-payout-strip')!.querySelector('.bo-mini-btn-primary')).toBeNull();
    (host.querySelectorAll<HTMLElement>('bo-commissions-table .row:not(.head)')[0]!).click();
    await settle();
    expect(text(host.querySelector('bo-commission-drawer'))).not.toContain('Cancelar comissão');
  });

  it('sem conversão no período mostra o estado vazio e a faixa sem repasse', async () => {
    const host = await mount(['admin'], []);
    expect(text(host.querySelector('.empty'))).toContain('Nenhuma comissão em');
    expect(text(host.querySelector('bo-payout-strip'))).toContain(`Nada a repassar em ${dayMonthOfKey(OPEN)}`);
  });
});
