import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { ReviewSummary } from './data/tournament-reviews';
import { TournamentReviewsAdminRepository } from './data/tournament-reviews.repository';
import { PanelAvaliacoesComponent } from './panel-avaliacoes.component';

function summary(over: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Aurora',
    organizerId: 'organizer-uid-123456',
    tournamentStartAt: new Date('2026-09-26T12:00:00Z'),
    opensAt: null,
    closesAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    status: 'open',
    eligibleCount: 42,
    count: 23,
    average: 4.62,
    ...over,
  };
}

const LIST = [
  summary(),
  summary({ tournamentId: 't2', tournamentName: 'Etapa Setembro', tournamentStartAt: new Date('2026-09-30T12:00:00Z'), average: 3.1, count: 12 }),
  summary({
    tournamentId: 't3',
    tournamentName: 'Teste sem atletas',
    tournamentStartAt: new Date('2026-10-01T12:00:00Z'),
    organizerId: 'other-org-999999',
    count: 0,
    eligibleCount: 0,
    average: null,
    status: 'closed',
  }),
];

describe('PanelAvaliacoesComponent', () => {
  let fixture: ComponentFixture<PanelAvaliacoesComponent>;

  async function mount(repo: Partial<TournamentReviewsAdminRepository>): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [PanelAvaliacoesComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal(null), user: signal(null) } },
        { provide: TournamentReviewsAdminRepository, useValue: repo },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PanelAvaliacoesComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  /** As leituras são promises fora do controle do TestBed: deixa elas resolverem e re-renderiza. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  const names = (host: HTMLElement) => [...host.querySelectorAll('.cell-name')].map((e) => e.textContent!.trim());

  it('mais recentes primeiro, com organizador, média, resposta, janela e link para o detalhe', async () => {
    const host = await mount({
      listSummaries: () => Promise.resolve(LIST),
      profileNames: () => Promise.resolve(new Map([['organizer-uid-123456', 'Arena Garden Eventos']])),
    });
    expect(names(host)).toEqual(['Teste sem atletas', 'Etapa Setembro', 'Copa Aurora']);
    const copa = [...host.querySelectorAll<HTMLAnchorElement>('a.table-row')][2];
    expect(copa.getAttribute('href')).toBe('/painel/avaliacoes/t1');
    const text = copa.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Arena Garden Eventos');
    expect(text).toContain('26/09/2026');
    expect(text).toContain('4,6');
    expect(text).toContain('23 de 42');
    expect(text).toContain('Aberta até');
  });

  it('pior média: os com nota na frente, do pior para o melhor; sem nota depois', async () => {
    const host = await mount({ listSummaries: () => Promise.resolve(LIST), profileNames: () => Promise.resolve(new Map()) });
    const worst = [...host.querySelectorAll<HTMLButtonElement>('.bo-chip')].find((b) => b.textContent!.includes('Pior média'))!;
    worst.click();
    await settle();
    expect(names(host)).toEqual(['Etapa Setembro', 'Copa Aurora', 'Teste sem atletas']);
    expect(host.textContent).toContain('Pior média ordena só os torneios com 3 ou mais avaliações');
  });

  it('sem atletas aptos e sem nota: — no lugar de "0 de 0" e da média; organizador sem nome vira uid encurtado', async () => {
    const host = await mount({ listSummaries: () => Promise.resolve(LIST), profileNames: () => Promise.resolve(new Map()) });
    const teste = [...host.querySelectorAll<HTMLAnchorElement>('a.table-row')][0];
    const text = teste.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Sem nome (…999999)');
    expect(text).not.toContain('0 de 0');
    expect(teste.querySelector('.cell-avg')!.textContent!.trim()).toBe('—');
    expect(teste.querySelector('.cell-resp')!.textContent!.trim()).toBe('—');
    expect(text).toContain('Encerrada');
  });

  it('nomes que não carregam não derrubam a tela', async () => {
    const host = await mount({ listSummaries: () => Promise.resolve(LIST), profileNames: () => Promise.reject(new Error('offline')) });
    expect(names(host).length).toBe(3);
    expect(host.querySelector('.bo-alert')).toBeNull();
    expect(host.textContent).toContain('Sem nome (…123456)');
  });

  it('sem permissão: mensagem clara e Tentar de novo', async () => {
    const host = await mount({ listSummaries: () => Promise.reject({ code: 'permission-denied' }), profileNames: () => Promise.resolve(new Map()) });
    expect(host.querySelector('.bo-alert')!.textContent).toContain('A tela precisa do papel admin.');
    expect([...host.querySelectorAll('button')].some((b) => b.textContent!.includes('Tentar de novo'))).toBeTrue();
  });

  it('a ordenação escolhida sobrevive a abrir um torneio e voltar', async () => {
    await mount({ listSummaries: () => Promise.resolve(LIST), profileNames: () => Promise.resolve(new Map()) });
    const host1 = fixture.nativeElement as HTMLElement;
    [...host1.querySelectorAll<HTMLButtonElement>('.bo-chip')].find((b) => b.textContent!.includes('Pior média'))!.click();
    await settle();
    fixture.destroy();
    fixture = TestBed.createComponent(PanelAvaliacoesComponent);
    fixture.detectChanges();
    await settle();
    const host2 = fixture.nativeElement as HTMLElement;
    expect(names(host2)).toEqual(['Etapa Setembro', 'Copa Aurora', 'Teste sem atletas']);
    expect(host2.querySelector('.bo-chip.active')!.textContent).toContain('Pior média');
  });

  it('enquanto os nomes carregam, o organizador aparece como "…", não como "Sem nome"', async () => {
    const host = await mount({ listSummaries: () => Promise.resolve(LIST), profileNames: () => new Promise(() => undefined) });
    const organizers = [...host.querySelectorAll('.cell-sub')].map((e) => e.textContent!.trim());
    expect(organizers).toEqual(['…', '…', '…']);
    expect(host.textContent).not.toContain('Sem nome');
  });

  it('Atualizar no meio da leitura de nomes: a resposta antiga não sobrescreve a nova', async () => {
    const pending: ((names: Map<string, string>) => void)[] = [];
    const host = await mount({
      listSummaries: () => Promise.resolve(LIST),
      profileNames: () => new Promise<Map<string, string>>((resolve) => pending.push(resolve)),
    });
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Atualizar'))!.click();
    await settle();
    pending[1](new Map([['organizer-uid-123456', 'Nome novo']]));
    await settle();
    pending[0](new Map([['organizer-uid-123456', 'Nome velho']]));
    await settle();
    expect(host.textContent).toContain('Nome novo');
    expect(host.textContent).not.toContain('Nome velho');
  });

  it('acessibilidade: chips dizem qual está ativo e cada linha tem uma frase para o leitor de tela', async () => {
    const host = await mount({
      listSummaries: () => Promise.resolve(LIST),
      profileNames: () => Promise.resolve(new Map([['organizer-uid-123456', 'Arena Garden Eventos']])),
    });
    const pressed = [...host.querySelectorAll('.bo-chip')].map((b) => [b.textContent!.trim(), b.getAttribute('aria-pressed')]);
    expect(pressed).toEqual([
      ['Mais recentes', 'true'],
      ['Pior média', 'false'],
    ]);
    const copa = [...host.querySelectorAll<HTMLAnchorElement>('a.table-row')][2];
    expect(copa.getAttribute('aria-label')).toContain('Copa Aurora, organizado por Arena Garden Eventos, 26/09/2026. Média 4,6');
  });

  it('lista vazia explica que nenhum torneio passou pela avaliação', async () => {
    const host = await mount({ listSummaries: () => Promise.resolve([]), profileNames: () => Promise.resolve(new Map()) });
    expect(host.textContent).toContain('Nenhum torneio passou pela avaliação dos atletas ainda.');
  });
});
