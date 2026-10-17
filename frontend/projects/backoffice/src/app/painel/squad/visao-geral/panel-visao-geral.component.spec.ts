import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { DEFAULT_SQUAD_RULES, type SquadTier } from '../niveis-regras/data/squad-rules';
import type { Commission, CommissionOrigin, CommissionStatus } from '../comissoes/data/commission';
import { DEFAULT_CYCLE } from '../data/squad-program';
import { SquadProgramRepository, type Contract } from '../data/squad-program.repository';
import { OverviewRepository, type OverviewState } from './data/overview.repository';
import { PanelVisaoGeralComponent } from './panel-visao-geral.component';

const DAY = 24 * 60 * 60 * 1000;
const ago = (n: number) => new Date(Date.now() - n * DAY);

function contract(uid: string, name: string, tier: SquadTier, over: Partial<Contract> = {}): Contract {
  return {
    uid,
    name,
    city: 'Goiânia',
    arenaName: null,
    tier,
    code: `${uid.toUpperCase()}10`,
    commissionPct: 10,
    rulesVersion: 1,
    state: 'active',
    start: ago(60),
    end: null,
    pausedUntil: null,
    endsAt: null,
    pendingTier: null,
    score: null,
    points: null,
    ...over,
  };
}

let seq = 0;
function sale(ambassadorId: string, status: CommissionStatus, daysAgo: number, origin: CommissionOrigin = 'code'): Commission {
  return {
    id: `c${seq++}`,
    ambassadorId,
    ambassadorName: ambassadorId,
    ambassadorCode: null,
    ambassadorTier: null,
    registrationId: 'r',
    tournamentName: 'Open',
    categoryName: 'Masc. C',
    paymentId: 'p',
    convertedLabel: 'Lucas M.',
    convertedCount: 1,
    origin,
    grossCents: 120_00,
    feeCents: 0,
    netCents: 120_00,
    pct: 10,
    amountCents: 12_00,
    rulesVersion: 1,
    status,
    cancelReason: null,
    cancelNote: null,
    payoutId: null,
    hold: null,
    timeline: [],
    registeredAt: ago(daysAgo),
    releasedAt: ago(daysAgo),
  };
}

// Meio dia de folga: o "agora" do componente nasce depois das fixtures (o 7º dia cairia fora da semana).
const sales = (id: string, n: number, status: CommissionStatus = 'paid', origin: CommissionOrigin = 'code') =>
  Array.from({ length: n }, (_, i) => sale(id, status, i + 0.5, origin));

function state(over: Partial<OverviewState> = {}): OverviewState {
  return {
    contracts: [
      contract('joao', 'João Victor', 'amb', { score: 92 }),
      contract('marcos', 'Marcos Reis', 'cap', { score: 88 }),
      contract('ana', 'Ana Clara', 'ath'),
      contract('maria', 'Maria Fernanda', 'amb', { start: ago(40) }),
    ],
    commissions: [
      ...sales('joao', 20, 'paid', 'code'),
      ...sales('marcos', 30, 'paid', 'link'),
      ...sales('ana', 12, 'released', 'qr'),
      sale('joao', 'pending', 0),
    ],
    rules: DEFAULT_SQUAD_RULES,
    rulesVersion: 2,
    cycle: DEFAULT_CYCLE,
    outstandingInvites: 0,
    signups: 120,
    newApplications: 3,
    payoutDate: '2026-10-20',
    ...over,
  };
}

describe('PanelVisaoGeralComponent', () => {
  let repo: jasmine.SpyObj<OverviewRepository>;
  let program: jasmine.SpyObj<SquadProgramRepository>;

  async function mount(data: OverviewState = state(), roles: string[] = ['growth']): Promise<HTMLElement> {
    repo = jasmine.createSpyObj<OverviewRepository>('OverviewRepository', ['load']);
    repo.load.and.resolveTo(data);
    program = jasmine.createSpyObj<SquadProgramRepository>('SquadProgramRepository', ['sendInvite', 'searchAthletes']);
    program.searchAthletes.and.resolveTo([]);
    await TestBed.configureTestingModule({
      imports: [PanelVisaoGeralComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { displayName: signal('Lia Martins'), user: signal(null), roles: signal(roles), isSuperAdmin: signal(false) },
        },
        { provide: OverviewRepository, useValue: repo },
        { provide: SquadProgramRepository, useValue: program },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelVisaoGeralComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const kpi = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll('bo-squad-kpi')].find((k) => text(k.querySelector('.label')) === label)!;
  const card = (host: HTMLElement, title: string) =>
    [...host.querySelectorAll('bo-panel-card')].find((c) => text(c.querySelector('.title')) === title)!;

  it('título com o dia do ciclo e os 5 KPIs das mesmas linhas da tela 02', async () => {
    const host = await mount();
    expect(text(host.querySelector('h1'))).toMatch(/NexaGO Squad Piloto · (dia \d+ de 90|começa em|encerrado)/);
    expect(text(kpi(host, 'Embaixadores ativos').querySelector('.value'))).toBe('4');
    expect(text(kpi(host, 'Embaixadores ativos').querySelector('.hint'))).toBe('1 · 2 · 0 · 1 por nível');
    // O pendente não é conversão.
    expect(text(kpi(host, 'Conversões pagas').querySelector('.value'))).toBe('62');
    expect(text(kpi(host, 'Conversões pagas').querySelector('.delta'))).toBe('21 na semana');
    expect(text(kpi(host, 'Custo do programa').querySelector('.hint'))).toBe('comissões + kits');
  });

  it('ROI por perfil: maior primeiro, com o destaque de custo por conversão', async () => {
    const host = await mount();
    const roi = host.querySelector('bo-tier-roi-card')!;
    const tiers = [...roi.querySelectorAll('.row:not(.head) bo-tier-pill')].map((p) => text(p));
    expect(tiers).toEqual(['Captain', 'Athlete', 'Ambassador']);
    expect(text(roi.querySelector('.insight'))).toContain('Captains:');
  });

  it('funil com cliques sem medição e a divisão por origem das conversões', async () => {
    const host = await mount();
    const funnel = card(host, 'Funil de atribuição');
    const nums = [...funnel.querySelectorAll('.step .num')].map((n) => text(n));
    expect(nums).toEqual(['—', '120', '63', '62']);
    const origins = [...funnel.querySelectorAll('.origin')].map((o) => `${text(o.querySelector('span'))} ${text(o.querySelector('strong'))}`);
    expect(origins).toEqual(['Código 32%', 'Link 49%', 'QR Code 19%']);
  });

  it('precisa de atenção: repasse, elegível, em risco e candidaturas, com o link da tela que resolve', async () => {
    const host = await mount();
    const items = [...host.querySelectorAll('bo-attention-card .item')];
    expect(items.map((i) => text(i.querySelector('strong')))).toEqual([
      'R$ 144 em comissões liberadas',
      'Ana Clara elegível a Ambassador',
      'Maria Fernanda com ROI 0,0x',
      '3 candidaturas novas',
    ]);
    expect(items.map((i) => i.querySelector('a')!.getAttribute('href'))).toEqual([
      '/painel/squad/comissoes',
      '/painel/squad/embaixadores/ana',
      '/painel/squad/embaixadores/maria',
      '/painel/squad/candidaturas',
    ]);
    expect(text(items[0]!.querySelector('.text span'))).toBe('1 embaixador · repasse em 20 out');
  });

  it('Score: os maiores, com link para o perfil; sem Score, avisa que ainda não há cálculo', async () => {
    const host = await mount();
    const rows = [...host.querySelectorAll('bo-score-leaders-card a.row')];
    expect(rows.map((r) => text(r.querySelector('strong')))).toEqual(['João Victor', 'Marcos Reis']);
    expect(rows[0]!.getAttribute('href')).toBe('/painel/squad/embaixadores/joao');

    TestBed.resetTestingModule();
    const none = await mount(state({ contracts: state().contracts.map((c) => ({ ...c, score: null })) }));
    expect(text(none.querySelector('bo-score-leaders-card .empty'))).toContain('O Score diário ainda não foi calculado');
  });

  it('custo no piloto: comissões e kits; o resto sem fonte', async () => {
    const host = await mount();
    const cost = host.querySelector('bo-cost-card')!;
    const values = [...cost.querySelectorAll('.top')].map((t) => [...t.children].map((c) => text(c)).join(' '));
    expect(values.slice(2)).toEqual(['Inscrições gratuitas —', 'Cachês de campanha —', 'Eventos —']);
  });

  it('Financeiro só lê: sem "Convidar atleta"; Growth convida', async () => {
    const reader = await mount(state(), ['financeiro']);
    expect(text(reader.querySelector('.head'))).not.toContain('Convidar atleta');
    TestBed.resetTestingModule();
    const editor = await mount();
    expect(text(editor.querySelector('.head'))).toContain('Convidar atleta');
  });

  it('falha de leitura mostra o erro com "Tentar de novo"', async () => {
    repo = jasmine.createSpyObj<OverviewRepository>('OverviewRepository', ['load']);
    await TestBed.configureTestingModule({
      imports: [PanelVisaoGeralComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal(''), user: signal(null), roles: signal([]), isSuperAdmin: signal(false) } },
        { provide: OverviewRepository, useValue: repo },
        { provide: SquadProgramRepository, useValue: jasmine.createSpyObj('SquadProgramRepository', ['sendInvite']) },
      ],
    }).compileComponents();
    repo.load.and.rejectWith(new Error('offline'));
    const fixture = TestBed.createComponent(PanelVisaoGeralComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(text(host.querySelector('.bo-alert'))).toContain('Tentar de novo');
  });
});
