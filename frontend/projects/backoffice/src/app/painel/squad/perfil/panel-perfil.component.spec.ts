import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { DEFAULT_SQUAD_RULES } from '../niveis-regras/data/squad-rules';
import type { Commission, CommissionStatus } from '../comissoes/data/commission';
import { SquadProgramRepository } from '../data/squad-program.repository';
import type { Application } from '../candidaturas/data/application';
import { profileContractFromDoc, type ProfileContract } from './data/profile';
import { ProfileRepository, type ProfileState } from './data/profile.repository';
import { PanelPerfilComponent } from './panel-perfil.component';

const DAY = 24 * 60 * 60 * 1000;
const ago = (n: number) => new Date(Date.now() - n * DAY);
const ts = (d: Date) => ({ toDate: () => d });

function contract(over: Partial<ProfileContract> = {}): ProfileContract {
  return {
    ...profileContractFromDoc('joao', {
      displayName: 'João Victor Alves',
      tier: 'amb',
      code: 'JOAO10',
      commissionPct: 10,
      followerDiscountPct: 10,
      rulesVersion: 2,
      status: 'active',
      city: 'Goiânia',
      start: ts(ago(60)),
      end: ts(ago(-30)),
    }),
    ...over,
  };
}

let seq = 0;
function sale(status: CommissionStatus, daysAgo: number): Commission {
  return {
    id: `c${seq++}`,
    ambassadorId: 'joao',
    ambassadorName: 'João Victor',
    ambassadorCode: 'JOAO10',
    ambassadorTier: 'amb',
    registrationId: 'r',
    tournamentName: 'Liga NexaGO · Etapa 3',
    categoryName: 'Masc. C',
    paymentId: 'p',
    convertedLabel: 'Tatiane R.',
    convertedCount: 1,
    origin: 'link',
    grossCents: 140_00,
    feeCents: 0,
    netCents: 120_00,
    pct: 10,
    amountCents: 12_00,
    rulesVersion: 2,
    status,
    cancelReason: null,
    cancelNote: null,
    payoutId: null,
    hold: null,
    timeline: [],
    registeredAt: ago(daysAgo),
    releasedAt: null,
  };
}

const application = {
  id: 'app1',
  athleteId: 'joao',
  name: 'João Victor Alves',
  source: 'manual',
  submittedAt: null,
  answers: null,
  social: { followers: 8200, engagementPct: 4.1, checkedAt: null, checkedBy: null },
  snapshot: {
    city: 'Goiânia',
    state: 'GO',
    arenaName: 'Arena Errejota',
    tournaments: 12,
    elo: 'Competidor II',
    rankingPosition: 4,
    referredCount: 3,
    conductIncidents: null,
    memberSince: null,
  },
  suggestedTier: 'amb',
  suggestedAuto: true,
  stage: 'archived',
  archivedReason: 'accepted',
  internalReason: null,
  notes: [],
  inviteId: 'inv1',
  stageChangedAt: ago(60),
} as Application;

function state(over: Partial<ProfileState> = {}): ProfileState {
  const c = over.contract ?? contract();
  return {
    contract: c,
    contracts: [c],
    // Meio dia de folga: o "agora" do componente nasce depois das fixtures (o 7º dia cairia fora da semana).
    commissions: [...Array.from({ length: 30 }, (_, i) => sale('paid', i + 0.5)), sale('pending', 0)],
    signups: 74,
    application,
    rules: DEFAULT_SQUAD_RULES,
    rulesVersion: 2,
    frozenPackage: DEFAULT_SQUAD_RULES.tiers.amb,
    ...over,
  };
}

describe('PanelPerfilComponent', () => {
  let repo: jasmine.SpyObj<ProfileRepository>;
  let program: jasmine.SpyObj<SquadProgramRepository>;

  async function mount(data: ProfileState | null = state(), roles: string[] = ['admin']): Promise<HTMLElement> {
    repo = jasmine.createSpyObj<ProfileRepository>('ProfileRepository', ['load']);
    repo.load.and.resolveTo(data);
    program = jasmine.createSpyObj<SquadProgramRepository>('SquadProgramRepository', ['updateContract']);
    program.updateContract.and.resolveTo(undefined);
    await TestBed.configureTestingModule({
      imports: [PanelPerfilComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { displayName: signal('Lia Martins'), user: signal(null), roles: signal(roles), isSuperAdmin: signal(false) },
        },
        { provide: ProfileRepository, useValue: repo },
        { provide: SquadProgramRepository, useValue: program },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelPerfilComponent);
    fixture.componentRef.setInput('uid', 'joao');
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
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).startsWith(label));
  const kpi = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll('bo-squad-kpi')].find((k) => text(k.querySelector('.label')) === label)!;
  const openDialog = (host: HTMLElement) => [...host.querySelectorAll('dialog')].find((d) => d.open)!;

  it('cabeçalho, identidade e KPIs batem com a linha da tela 02', async () => {
    const host = await mount();
    expect(repo.load).toHaveBeenCalledWith('joao');
    expect(text(host.querySelector('h1'))).toContain('João Victor Alves');
    expect(text(host.querySelector('h1 .status'))).toBe('Elegível · promoção');
    expect(text(host.querySelector('bo-profile-identity .line'))).toBe(
      'Goiânia/GO · joga na Arena Errejota · Competidor II · 12 torneios no NexaGO',
    );
    expect(text(host.querySelector('bo-profile-identity .chips'))).toContain('atleta.nexago.com.br/?squad=JOAO10');
    expect(text(host.querySelector('bo-profile-identity .score b'))).toBe('—');
    expect(text(kpi(host, 'Conversões pagas').querySelector('.value'))).toBe('30');
    expect(text(kpi(host, 'Conversões pagas').querySelector('.delta'))).toBe('7 na semana');
    expect(text(kpi(host, 'Ambassador ROI').querySelector('.value'))).toBe('7,5x');
    expect(text(kpi(host, 'Ambassador ROI').querySelector('.hint'))).toBe('meta mínima 3,0x');
  });

  it('funil do embaixador, conversões e promoção', async () => {
    const host = await mount();
    const nums = [...host.querySelectorAll('bo-squad-funnel .num')].map((n) => text(n));
    expect(nums).toEqual(['—', '74', '31', '30']);
    const rows = host.querySelectorAll('bo-conversions-card .row:not(.head)');
    expect(rows.length).toBe(8);
    expect(text(rows[0]!.querySelector('.status'))).toBe('Aguardando pgto');
    button(host.querySelector('bo-conversions-card')!, 'Ver todas · 31')!.click();
    await settle();
    expect(host.querySelectorAll('bo-conversions-card .row:not(.head)').length).toBe(31);
    expect(text(host.querySelector('bo-promotion-progress-card .title'))).toBe('Promoção · Ambassador → Pro Ambassador');
    expect(text(host.querySelector('bo-promotion-progress-card .count b'))).toBe('30');
    expect(text(host.querySelector('bo-promotion-progress-card .count span'))).toBe('de 30 conversões');
  });

  it('"Promover a Pro" abre o aditivo já com Pro escolhido', async () => {
    const host = await mount();
    button(host.querySelector('.head')!, 'Promover a Pro')!.click();
    await settle();
    const dialog = openDialog(host);
    expect(dialog.querySelector<HTMLSelectElement>('select')!.value).toBe('pro');
  });

  it('pausar chama a mesma callable da tela 02', async () => {
    const host = await mount();
    button(host.querySelector('.head')!, 'Pausar')!.click();
    await settle();
    const dialog = openDialog(host);
    const reason = dialog.querySelector<HTMLTextAreaElement>('textarea')!;
    reason.value = 'Viagem';
    reason.dispatchEvent(new Event('input'));
    await settle();
    button(dialog, 'Pausar')!.click();
    await settle();
    expect(program.updateContract).toHaveBeenCalledWith('joao', { action: 'pause', reason: 'Viagem', until: null });
    expect(repo.load).toHaveBeenCalledTimes(2);
  });

  it('Financeiro só lê: sem botões de ação', async () => {
    const host = await mount(state(), ['financeiro']);
    expect(button(host.querySelector('.head')!, 'Pausar')).toBeUndefined();
    expect(button(host.querySelector('.head')!, 'Promover')).toBeUndefined();
  });

  it('pausado mostra "Retomar"; encerrado não tem ações', async () => {
    const paused = await mount(state({ contract: contract({ state: 'paused' }) }));
    expect(button(paused.querySelector('.head')!, 'Retomar')).toBeTruthy();
    TestBed.resetTestingModule();
    const ended = await mount(state({ contract: contract({ state: 'ended' }) }));
    expect(button(ended.querySelector('.head')!, 'Mudar nível')).toBeUndefined();
  });

  it('sem contrato: estado vazio com volta para a lista', async () => {
    const host = await mount(null);
    expect(text(host.querySelector('.empty'))).toContain('Nenhum contrato de embaixador para este atleta');
    expect(host.querySelector('.empty a')!.getAttribute('href')).toBe('/painel/squad/embaixadores');
  });
});
