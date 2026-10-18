import { Component, input, provideZonelessChangeDetection, signal, type Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import type { TournamentSummary } from '../data/tournaments-repository';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { SQUAD_API, type SquadApi } from './data/squad-api';
import { SQUAD_NOW, SQUAD_TOURNAMENTS } from './data/squad-tokens';
import type { ApplicationAnswers, SquadAthleteView } from './data/squad-view';
import { SquadStore } from './data/squad.store';
import { SquadGanhosComponent } from './squad-ganhos.component';
import { SquadHomeComponent } from './squad-home.component';
import { SquadNivelComponent } from './squad-nivel.component';
import { SQUAD_TEST_NOW, ambassadorView, candidateView, commissionLine, daysAgoIso } from '../../testing/squad-fixtures';
import { SquadFrameComponent } from './ui/squad-frame.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

const DAY = 24 * 60 * 60 * 1000;

const TOURNAMENTS = [
  {
    id: 'open-errejota',
    name: 'Open Errejota',
    city: 'Goiânia',
    location: 'Arena Errejota',
    startAt: new Date(SQUAD_TEST_NOW.getTime() + 9 * DAY),
    endAt: new Date(SQUAD_TEST_NOW.getTime() + 9 * DAY),
    rawStatus: 'open',
    liveMatchesNow: 0,
    enrolledCount: 0,
    capacity: 64,
    isCancelled: false,
    coverUrl: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
    categories: [],
  } as unknown as TournamentSummary,
];

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** Texto com espaço entre os nós (o template não deixa espaço entre elementos vizinhos). */
function words(el: Element | null | undefined): string {
  if (!el) return '';
  const out: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n.textContent?.replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out.join(' ');
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
  }
}

interface FakeApi extends SquadApi {
  submitted: ApplicationAnswers[];
}

function fakeApi(views: Array<SquadAthleteView | Error>): FakeApi {
  const queue = [...views];
  const submitted: ApplicationAnswers[] = [];
  return {
    submitted,
    fetchView: async () => {
      const next = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (next instanceof Error) throw next;
      return next;
    },
    submitApplication: async (answers) => {
      submitted.push(answers);
    },
  };
}

async function render<T>(
  component: Type<T>,
  api: FakeApi,
  before?: () => void,
): Promise<{ fixture: ComponentFixture<T>; host: HTMLElement }> {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      SquadStore,
      { provide: AuthService, useValue: { user: signal({ uid: 'jv', displayName: 'João Victor' }) } },
      { provide: SQUAD_API, useValue: api },
      { provide: SQUAD_NOW, useValue: () => SQUAD_TEST_NOW },
      { provide: SQUAD_TOURNAMENTS, useValue: async () => TOURNAMENTS },
    ],
  }).overrideComponent(SquadFrameComponent, {
    remove: { imports: [AtPanelShellComponent] },
    add: { imports: [PanelShellStubComponent] },
  });
  before?.();
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

describe('Squad · Painel do embaixador', () => {
  it('herói, código, ranking, próxima conquista e torneios com dados da callable', async () => {
    const { host } = await render(SquadHomeComponent, fakeApi([ambassadorView()]));
    expect(text(host.querySelector('.sq-hero-title'))).toBe('Você já trouxe 27 atletas pro NexaGO.');
    expect(text(host.querySelector('.sqp-hero'))).toContain('Piloto · dia 40 de 90');
    const stats = Array.from(host.querySelectorAll('.sqp-hero-stats .sq-stat-v')).map(text);
    expect(stats).toEqual(['R$ 324', 'R$ 132', '11']);
    expect(text(host.querySelector('.sqc-code'))).toBe('JOAO10');
    expect(text(host.querySelector('.sqc-link'))).toBe('atleta.nexago.com.br/?squad=JOAO10');
    expect(text(host.querySelector('.sqc-offer'))).toContain('até 10% OFF na primeira inscrição');
    const rank = Array.from(host.querySelectorAll('.sqp-rank-row')).map(words);
    expect(rank[0]).toBe('1 JV Você ▲2 1.280');
    expect(rank[1]).toContain('Marcos R.');
    expect(text(host.querySelector('.sqp-next-count strong'))).toBe('27/30');
    expect(text(host.querySelector('.sqp-next-level'))).toContain('Nível Gold · 1.280 pts');
    expect(text(host.querySelector('.sqp-next-level'))).toContain('720 p/ Elite');
    expect(host.querySelectorAll('.sqp-conv-row').length).toBe(3);
    expect(text(host.querySelector('.sqp-promo-row'))).toContain('Open Errejota');
    expect(text(host.querySelector('.sqp-promo-row'))).toContain('26 out · Arena Errejota');
    // Abas do embaixador, com Painel aceso.
    expect(text(host.querySelector('.sq-tab--on'))).toBe('Painel');
  });

  it('Score, ROI e ranking interno não aparecem para o atleta', async () => {
    const { host } = await render(SquadHomeComponent, fakeApi([ambassadorView()]));
    const all = text(host).toLowerCase();
    expect(all).not.toContain('score');
    expect(all).not.toContain('roi');
  });

  it('contrato pausado: aviso no topo e divulgação desligada', async () => {
    const v = ambassadorView();
    const { host } = await render(SquadHomeComponent, fakeApi([{ ...v, contract: { ...v.contract, status: 'paused', pausedUntil: '2026-11-01' } }]));
    expect(text(host.querySelector('.sq-notice'))).toContain('pausado até 01 nov');
    expect((host.querySelector('.sqc-share') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('erro da callable mostra a mensagem certa e tenta de novo', async () => {
    const notDeployed = Object.assign(new Error('NOT FOUND'), { code: 'functions/not-found' });
    const { fixture, host } = await render(SquadHomeComponent, fakeApi([notDeployed, ambassadorView()]));
    expect(text(host.querySelector('.sq-error'))).toContain('O Squad ainda não está disponível por aqui');
    (host.querySelector('.sq-error button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(text(host.querySelector('.sq-hero-title'))).toContain('27 atletas');
  });
});

describe('Squad · Entrar no Squad', () => {
  it('sem contrato: programa, perfil, vagas do piloto e sem abas', async () => {
    const { host } = await render(SquadHomeComponent, fakeApi([candidateView()]));
    expect(host.querySelector('.sq-tabs')).toBeNull();
    expect(text(host.querySelector('.sqe-hero'))).toContain('Traga sua galera pra areia.');
    expect(text(host.querySelector('.sqe-profile'))).toContain('Caio Teixeira');
    expect(text(host.querySelector('.sqe-profile'))).toContain('11 torneios · Competidor II · Arena Errejota');
    expect(text(host.querySelector('.sq-callout--gold'))).toContain('As 20 vagas do piloto estão preenchidas');
    expect(text(host.querySelector('.sq-callout--gold'))).toContain('próximo ciclo, em 07 dez');
    expect((host.querySelector('input[name=city]') as HTMLInputElement).value).toBe('Goiânia, GO');
    expect(Array.from(host.querySelectorAll('.sqe-step')).map(text)[1]).toContain('Até 10% OFF na 1ª inscrição');
  });

  it('candidatura: valida antes de enviar, manda as respostas e passa a "em análise"', async () => {
    const after = candidateView({ application: { status: 'review', submittedAt: '2026-10-17T15:00:00.000Z' } });
    const api = fakeApi([candidateView(), after]);
    const { fixture, host } = await render(SquadHomeComponent, api);

    (host.querySelector('.sqe-submit') as HTMLButtonElement).click();
    await settle(fixture);
    expect(api.submitted.length).toBe(0);
    expect(host.querySelectorAll('.sq-field-error').length).toBe(2);

    const ig = host.querySelector('input[name=instagram]') as HTMLInputElement;
    ig.value = '@caio.beach';
    ig.dispatchEvent(new Event('input'));
    (Array.from(host.querySelectorAll('.sq-option')).find((b) => text(b) === 'Sim, 10–30') as HTMLButtonElement).click();
    const why = host.querySelector('textarea[name=why]') as HTMLTextAreaElement;
    why.value = 'Organizo o racha de quinta com uns 18 atletas.';
    why.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (host.querySelector('.sqe-submit') as HTMLButtonElement).click();
    await settle(fixture);

    expect(api.submitted).toEqual([
      { instagram: 'caio.beach', city: 'Goiânia, GO', leadsGroup: '10to30', why: 'Organizo o racha de quinta com uns 18 atletas.' },
    ]);
    expect(text(host.querySelector('.sqe-state'))).toContain('Candidatura em análise');
    expect(host.querySelector('.sqe-fields')).toBeNull();
  });

  it('convite em aberto manda para o app', async () => {
    const { host } = await render(SquadHomeComponent, fakeApi([candidateView({ invite: { tier: 'amb', expiresAt: '2026-10-22T15:00:00.000Z' } })]));
    expect(text(host.querySelector('.sqe-state'))).toContain('Você foi convidado como Ambassador');
    expect(text(host.querySelector('.sqe-state'))).toContain('até 22 out');
    expect(host.querySelector('.sqe-fields')).toBeNull();
  });
});

describe('Squad · Ganhos', () => {
  it('quatro saldos, como recebe e o extrato com filtro', async () => {
    const { fixture, host } = await render(SquadGanhosComponent, fakeApi([ambassadorView()]));
    const cards = Array.from(host.querySelectorAll('.sq-row--4 .sq-box')).map(words);
    expect(cards).toEqual([
      'Disponível R$ 132,00 vai pra carteira em 20 out',
      'A liberar R$ 12,00 1 pagamento pendente',
      'Já recebido R$ 180,00 repasse de 06 out',
      'Total no piloto R$ 324,00 10% de R$ 3.240',
    ]);
    expect(text(host.querySelector('.sqg-how'))).toContain('Pagamento confirmado');
    expect(Array.from(host.querySelectorAll('.sqg-how-title')).map(text)[1]).toBe('Repasse nos dias 06 e 20');
    expect(host.querySelectorAll('.sqg-line').length).toBe(4);
    (Array.from(host.querySelectorAll('.sq-seg')).find((b) => text(b) === 'Repasses') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(Array.from(host.querySelectorAll('.sqg-line')).map(words)).toEqual([
      '06 out Repasse para a carteira − R$ 180,00 Carteira do Squad',
    ]);
    expect(text(host.querySelector('.sq-tab--on'))).toBe('Ganhos');
  });

  it('extrato longo abre com 15 linhas e "Mostrar mais" traz as próximas', async () => {
    const many = Array.from({ length: 20 }, (_, i) => commissionLine({ id: `m${i}`, at: daysAgoIso(i + 1) }));
    const { fixture, host } = await render(SquadGanhosComponent, fakeApi([ambassadorView({ commissions: many, wallet: [] })]));
    expect(host.querySelectorAll('.sqg-line').length).toBe(15);
    (host.querySelector('.sqg-more') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelectorAll('.sqg-line').length).toBe(20);
    expect(host.querySelector('.sqg-more')).toBeNull();
  });

  it('quem não é embaixador volta para /squad', async () => {
    let navigate: jasmine.Spy | undefined;
    const { host } = await render(SquadGanhosComponent, fakeApi([candidateView()]), () => {
      navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    });
    expect(navigate).toHaveBeenCalledWith('/squad', { replaceUrl: true });
    expect(host.querySelector('.sq-row--4')).toBeNull();
  });
});

describe('Squad · Nível & benefícios', () => {
  it('pacote, pontos, promoção sem ROI e regras de divulgação', async () => {
    const { host } = await render(SquadNivelComponent, fakeApi([ambassadorView()]));
    const benefits = Array.from(host.querySelectorAll('.sqn-benefit')).map(words);
    expect(benefits[0]).toBe('10% de comissão sobre cada inscrição paga com seu código Ativo');
    expect(benefits[2]).toContain('No pacote');
    expect(text(host.querySelector('.sqn-mine-head'))).toContain('desde 08 set · contrato até 06 dez');
    expect(words(host.querySelector('.sqn-points'))).toBe('1.280 pts · Gold');
    expect(host.querySelectorAll('.sqn-earn-soon').length).toBe(2);
    expect(text(host.querySelector('.sqn-promo-title'))).toBe('Faltam 3 conversões pra concorrer');
    expect(Array.from(host.querySelectorAll('.sqn-criteria li')).map(words)).toEqual([
      '30 conversões pagas 27 de 30',
      'Influência relevante avaliado pelo time',
      'Participação consistente avaliado pelo time',
    ]);
    expect(Array.from(host.querySelectorAll('.sqn-chips .sq-chip')).map(text)).toContain('Comissão de 10 a 15%');
    expect(host.querySelectorAll('.sqn-rules li').length).toBe(3);
    const all = text(host).toLowerCase();
    expect(all).not.toContain('roi');
    expect(all).not.toContain('score');
  });
});
