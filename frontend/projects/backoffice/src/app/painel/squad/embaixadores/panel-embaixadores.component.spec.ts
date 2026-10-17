import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { DEFAULT_SQUAD_RULES } from '../niveis-regras/data/squad-rules';
import { DEFAULT_CYCLE } from '../data/squad-program';
import { SquadProgramRepository, type Contract, type CountedCommission, type ProgramState } from '../data/squad-program.repository';
import { PanelEmbaixadoresComponent } from './panel-embaixadores.component';

const DAY = 24 * 60 * 60 * 1000;
const ago = (n: number) => new Date(Date.now() - n * DAY);

function contract(uid: string, name: string, over: Partial<Contract> = {}): Contract {
  return {
    uid,
    name,
    city: 'Goiânia',
    arenaName: 'Arena Errejota',
    tier: 'amb',
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

const sales = (id: string, n: number, net: number): CountedCommission[] =>
  Array.from({ length: n }, (_, i) => ({ ambassadorId: id, netCents: net, amountCents: net / 10, registeredAt: ago(i + 1) }));

function state(over: Partial<ProgramState> = {}): ProgramState {
  return {
    contracts: [
      contract('joao', 'João Victor', { score: 92 }),
      contract('marcos', 'Marcos Reis', { tier: 'cap', city: 'Brasília' }),
      contract('maria', 'Maria Fernanda'),
      contract('edu', 'Eduardo Nunes', { state: 'ended' }),
    ],
    commissions: [...sales('joao', 27, 120_00), ...sales('marcos', 34, 120_00), ...sales('maria', 1, 120_00)],
    rules: DEFAULT_SQUAD_RULES,
    rulesVersion: 2,
    cycle: DEFAULT_CYCLE,
    outstandingInvites: 0,
    ...over,
  };
}

describe('PanelEmbaixadoresComponent', () => {
  let repo: jasmine.SpyObj<SquadProgramRepository>;

  async function mount(data: ProgramState = state(), roles: string[] = ['admin']): Promise<HTMLElement> {
    repo = jasmine.createSpyObj<SquadProgramRepository>('SquadProgramRepository', [
      'load',
      'updateContract',
      'sendInvite',
      'searchAthletes',
    ]);
    repo.load.and.resolveTo(data);
    repo.updateContract.and.resolveTo(undefined);
    repo.searchAthletes.and.resolveTo([]);
    await TestBed.configureTestingModule({
      imports: [PanelEmbaixadoresComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { displayName: signal('Lia Martins'), user: signal(null), roles: signal(roles), isSuperAdmin: signal(false) },
        },
        { provide: SquadProgramRepository, useValue: repo },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelEmbaixadoresComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(ms = 0) {
    await new Promise((r) => setTimeout(r, ms));
    await TestBed.inject(ApplicationRef).whenStable();
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const button = (root: ParentNode, label: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).startsWith(label));
  const rows = (host: HTMLElement) => [...host.querySelectorAll('bo-ambassadors-table .row:not(.head)')];
  const openDialog = (host: HTMLElement) => [...host.querySelectorAll('dialog')].find((d) => d.open)!;

  it('header com vagas, abas por nível e tabela por ROI', async () => {
    const host = await mount();
    expect(text(host.querySelector('h1'))).toContain('3 de 20 vagas do piloto');
    expect(text(button(host, 'Todos')!)).toBe('Todos 3');
    expect(text(button(host, 'Captain')!)).toBe('Captain 1');
    // Encerrado fica fora do padrão; Marcos (Captain) tem o maior ROI.
    expect(rows(host).map((r) => text(r.querySelector('.who strong')))).toEqual(['Marcos Reis', 'João Victor', 'Maria Fernanda']);
    expect(text(host.querySelector('.foot'))).toContain('Mostrando 3 de 3');
    expect(text(host.querySelector('.foot'))).toContain('Score é interno — o atleta vê só pontos e nível');
  });

  it('Score sem fonte mostra "—"; status derivado aparece na pill', async () => {
    const host = await mount();
    const marcos = rows(host)[0]!;
    expect(text(marcos.querySelector('.score'))).toBe('—');
    expect(text(rows(host)[1]!.querySelector('.score'))).toContain('92');
    // Maria: 1 conversão em 60 dias, ROI < 1,5x → Em risco.
    expect(text(rows(host)[2]!.querySelector('.status'))).toBe('Em risco');
  });

  it('estado vazio oferece o convite', async () => {
    const host = await mount(state({ contracts: [], commissions: [] }));
    expect(text(host.querySelector('.empty'))).toContain('Nenhum embaixador ainda');
    expect(button(host.querySelector('.empty')!, 'Convidar atleta')).toBeTruthy();
  });

  it('busca sem resultado (300 ms depois de 2 caracteres)', async () => {
    const host = await mount();
    const input = host.querySelector<HTMLInputElement>('bo-ambassador-filters input[type="search"]')!;
    input.value = 'zz';
    input.dispatchEvent(new Event('input'));
    await settle(350);
    expect(text(host.querySelector('.empty'))).toContain('Nada encontrado para "zz"');
  });

  it('Financeiro só lê: sem convite e sem ações no menu', async () => {
    const host = await mount(state(), ['financeiro']);
    expect(button(host.querySelector('.head')!, 'Convidar atleta')).toBeUndefined();
    rows(host)[0]!.querySelector<HTMLButtonElement>('.more')!.click();
    await settle();
    const menu = text(host.querySelector('.menu'));
    expect(menu).toContain('Copiar código');
    expect(menu).not.toContain('Pausar');
    expect(menu).toContain('Em breve');
  });

  it('pausar chama a callable com motivo e data de retorno', async () => {
    const host = await mount();
    rows(host)[0]!.querySelector<HTMLButtonElement>('.more')!.click();
    await settle();
    button(host.querySelector('.menu')!, 'Pausar')!.click();
    await settle();
    const dialog = openDialog(host);
    const reason = dialog.querySelector<HTMLTextAreaElement>('textarea')!;
    reason.value = 'Lesão no joelho';
    reason.dispatchEvent(new Event('input'));
    await settle();
    button(dialog, 'Pausar')!.click();
    await settle();
    expect(repo.updateContract).toHaveBeenCalledWith('marcos', { action: 'pause', reason: 'Lesão no joelho', until: null });
  });

  it('com o piloto cheio o convite vira agendamento', async () => {
    const full = state({ cycle: { ...DEFAULT_CYCLE, seats: 3 } });
    const host = await mount(full);
    button(host.querySelector('.head')!, 'Convidar atleta')!.click();
    await settle();
    const dialog = openDialog(host);
    expect(text(dialog)).toContain('Vagas preenchidas · o convite entra para o próximo ciclo');
    expect(button(dialog, 'Agendar convite')).toBeTruthy();
  });
});
