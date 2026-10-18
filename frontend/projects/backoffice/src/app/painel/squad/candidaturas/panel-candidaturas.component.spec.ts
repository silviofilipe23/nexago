import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { DEFAULT_SQUAD_RULES } from '../niveis-regras/data/squad-rules';
import { DEFAULT_CYCLE } from '../data/squad-program';
import { SquadProgramRepository } from '../data/squad-program.repository';
import { applicationFromDoc, inviteFromDoc } from './data/application';
import { ApplicationsRepository, type BoardState } from './data/applications.repository';
import { PanelCandidaturasComponent } from './panel-candidaturas.component';

const DAY = 24 * 60 * 60 * 1000;
const ago = (n: number) => new Date(Date.now() - n * DAY);

function board(over: Partial<BoardState> = {}): BoardState {
  return {
    applications: [
      applicationFromDoc('fc', {
        athleteId: 'fc', athleteName: 'Felipe Cardoso', stage: 'new', suggestedTier: 'cap',
        snapshot: { city: 'Goiânia', arenaName: 'Arena CFC', tournaments: 18, referredCount: 22 }, stageChangedAt: ago(2),
      }),
      applicationFromDoc('gp', {
        athleteId: 'gp', athleteName: 'Gustavo Pires', stage: 'new', suggestedTier: 'ath',
        snapshot: { city: 'Anápolis', tournaments: 6, elo: 'Competidor I' }, stageChangedAt: ago(1),
      }),
      applicationFromDoc('ra', { athleteId: 'ra', athleteName: 'Renata Alves', stage: 'review', suggestedTier: 'amb', snapshot: { city: 'Goiânia' } }),
      applicationFromDoc('bn', { athleteId: 'bn', athleteName: 'Bia Nogueira', stage: 'invited', suggestedTier: 'pro', inviteId: 'i1', snapshot: { city: 'Brasília' } }),
    ],
    invites: [inviteFromDoc('i1', { applicationId: 'bn', tier: 'pro', status: 'sent', sentAt: ago(3) })],
    contracts: [],
    rules: DEFAULT_SQUAD_RULES,
    rulesVersion: 2,
    cycle: DEFAULT_CYCLE,
    outstandingInvites: 1,
    ...over,
  };
}

describe('PanelCandidaturasComponent', () => {
  let program: jasmine.SpyObj<SquadProgramRepository>;

  async function mount(data: BoardState = board(), roles: string[] = ['admin']): Promise<HTMLElement> {
    program = jasmine.createSpyObj<SquadProgramRepository>('SquadProgramRepository', [
      'updateApplication',
      'updateInvite',
      'sendInvite',
      'searchAthletes',
      'cycle',
    ]);
    program.updateApplication.and.resolveTo(undefined);
    program.updateInvite.and.resolveTo(undefined);
    const repo = jasmine.createSpyObj<ApplicationsRepository>('ApplicationsRepository', ['board', 'archived', 'invitesFor']);
    repo.board.and.resolveTo(data);
    repo.archived.and.resolveTo([]);
    repo.invitesFor.and.resolveTo([]);
    await TestBed.configureTestingModule({
      imports: [PanelCandidaturasComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { displayName: signal('Lia Martins'), user: signal(null), roles: signal(roles), isSuperAdmin: signal(false) },
        },
        { provide: SquadProgramRepository, useValue: program },
        { provide: ApplicationsRepository, useValue: repo },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelCandidaturasComponent);
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
  const column = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll<HTMLElement>('.col')].find((c) => text(c.querySelector('h2')).startsWith(label))!;

  it('quatro colunas com contagem, card hot e vagas do ciclo', async () => {
    const host = await mount();
    expect(text(column(host, 'Novas').querySelector('h2'))).toBe('Novas 2');
    expect(text(column(host, 'Em análise').querySelector('h2'))).toBe('Em análise 1');
    expect(text(column(host, 'Contrato enviado'))).toContain('Nenhuma candidatura aqui');
    const felipe = column(host, 'Novas').querySelector('bo-application-card')!;
    expect(felipe.classList).toContain('hot');
    expect(text(felipe)).toContain('22 atletas');
    expect(text(host.querySelector('.cap'))).toBe('19 vagas no ciclo');
    expect(text(host.querySelector('.criteria'))).toContain('Próximo ciclo · 07 dez');
    expect(text(column(host, 'Convidados'))).toContain('Convite enviado há 3 dias · ainda não abriu');
  });

  it('piloto cheio mostra a pill amarela', async () => {
    const host = await mount(board({ cycle: { ...DEFAULT_CYCLE, seats: 1 } }));
    const cap = host.querySelector('.cap')!;
    expect(text(cap)).toBe('Piloto cheio · lista de espera');
    expect(cap.classList).toContain('full');
  });

  it('busca filtra todas as colunas e destaca o termo', async () => {
    const host = await mount();
    const input = host.querySelector<HTMLInputElement>('.head input[type="search"]')!;
    input.value = 'goiania';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(text(column(host, 'Novas').querySelector('h2'))).toBe('Novas 1');
    expect(text(column(host, 'Novas').querySelector('mark'))).toBe('Goiânia');
    expect(text(column(host, 'Convidados'))).toContain('Nada encontrado para "goiania"');
  });

  it('drawer: Analisar move para Em análise; recusar exige motivo', async () => {
    const host = await mount();
    (column(host, 'Novas').querySelector('bo-application-card') as HTMLElement).click();
    await settle();
    const drawer = host.querySelector('bo-application-drawer')!;
    button(drawer, 'Analisar')!.click();
    await settle();
    expect(program.updateApplication).toHaveBeenCalledWith('fc', { action: 'review' });

    button(drawer, 'Recusar')!.click();
    await settle();
    const confirm = [...drawer.querySelectorAll<HTMLButtonElement>('.actions button')].find((b) => text(b) === 'Recusar')!;
    expect(confirm.disabled).toBeTrue();
    expect(text(drawer)).toContain('Obrigado pelo interesse! Neste ciclo não seguimos com sua candidatura.');
  });

  it('arrastar de Novas para Em análise analisa; para Convidados não aceita', async () => {
    const host = await mount();
    const card = column(host, 'Novas').querySelectorAll('bo-application-card')[1] as HTMLElement;
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    await settle();
    const skip = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
    column(host, 'Convidados').dispatchEvent(skip);
    expect(skip.defaultPrevented).toBeFalse();
    const over = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
    column(host, 'Em análise').dispatchEvent(over);
    expect(over.defaultPrevented).toBeTrue();
    column(host, 'Em análise').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await settle();
    expect(program.updateApplication).toHaveBeenCalledWith('gp', { action: 'review' });
  });

  it('Financeiro só lê: card não arrasta e drawer sem ações', async () => {
    const host = await mount(board(), ['financeiro']);
    const card = column(host, 'Novas').querySelector('bo-application-card') as HTMLElement;
    expect(card.getAttribute('draggable')).toBe('false');
    card.click();
    await settle();
    expect(host.querySelector('bo-application-drawer .actions')).toBeNull();
    expect(button(host.querySelector('.head')!, 'Convidar atleta')).toBeUndefined();
  });
});
