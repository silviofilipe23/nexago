import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { TournamentsRepository, type TournamentRow } from '../../torneios/data/tournaments.repository';
import { BlogPostEditorComponent } from './blog-post-editor.component';
import type { BlogPost, BlogPushReach, SaveBlogPostInput, SaveBlogPostResult } from './data/blog-post';
import { BlogMetricsRepository } from './data/blog-metrics.repository';
import { BlogPostsRepository } from './data/blog-posts.repository';

const STORED: BlogPost = {
  id: 'p1',
  title: 'Chegou a Toalha nexaGO',
  subtitle: 'Com o seu nome.',
  slug: 'chegou-a-toalha-nexago',
  seoDescription: '',
  coverUrl: null,
  category: 'loja',
  sport: 'all',
  tags: ['toalha'],
  author: { name: 'Ana Souza', role: 'Equipe nexaGO' },
  body: [{ type: 'paragraph', text: 'Quem joga na areia sabe: toalha some.' }],
  cta: null,
  channels: { app: true, site: true },
  featured: false,
  push: { enabled: false, city: null, sport: 'all' },
  pushSentAt: null,
  pushResult: null,
  status: 'published',
  publishAt: new Date('2026-10-28T12:00:00Z'),
  readMinutes: 1,
  readCount: 10,
  helpfulCount: 2,
  updatedAt: new Date('2026-10-28T12:00:00Z'),
  version: 4,
};

describe('BlogPostEditorComponent', () => {
  let save: jasmine.Spy<(input: SaveBlogPostInput) => Promise<SaveBlogPostResult>>;
  let navigate: jasmine.Spy;
  let estimate: jasmine.Spy;

  const COPA: TournamentRow = {
    id: 't1',
    name: 'Copa Goiás Beach',
    sport: null,
    status: 'inscricoes',
    visibility: null,
    startAt: new Date('2026-11-14T12:00:00Z'),
    place: 'Goiânia',
    categoriesCount: 4,
    capacity: null,
    managerId: null,
    entryFeeReais: null,
  };
  const REACH: BlogPushReach = { reachable: 1240, athletes: 3106, minBuild: 118, cities: [{ city: 'Goiânia', count: 2100 }] };

  async function mount(
    id: string | null,
    saveImpl?: (input: SaveBlogPostInput) => Promise<SaveBlogPostResult>,
    stored: BlogPost = STORED,
    query: Record<string, string> = {},
  ): Promise<HTMLElement> {
    estimate = jasmine.createSpy('estimatePushReach').and.resolveTo(REACH);
    save = jasmine.createSpy('save').and.callFake(
      saveImpl ??
        ((input: SaveBlogPostInput) =>
          Promise.resolve({ id: input.id ?? 'novo1', version: input.version + 1, slug: input.post.slug, status: input.post.status, publishAt: null })),
    );
    await TestBed.configureTestingModule({
      imports: [BlogPostEditorComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}), queryParamMap: convertToParamMap(query) } },
        },
        {
          provide: BlogPostsRepository,
          useValue: {
            get: () => Promise.resolve(id === 'p1' ? stored : null),
            save,
            delete: jasmine.createSpy('delete'),
            uploadImage: jasmine.createSpy('uploadImage'),
            estimatePushReach: estimate,
            listShowcase: () => Promise.resolve([]),
            showcaseProduct: () => Promise.resolve(null),
            listArenas: () =>
              Promise.resolve([
                { id: 'a1', name: 'Arena Errejota', location: 'Goiânia, GO', coverUrl: null, unclaimed: false },
                { id: 'a2', name: 'Beach Point', location: 'Anápolis, GO', coverUrl: null, unclaimed: false },
              ]),
            arena: (arenaId: string) =>
              Promise.resolve(arenaId === 'a1' ? { id: 'a1', name: 'Arena Errejota', location: 'Goiânia, GO', coverUrl: null, unclaimed: false } : null),
          },
        },
        {
          provide: BlogMetricsRepository,
          useValue: { post: () => Promise.resolve({ reads: 2140, avgSeconds: 151, finished: 1284, ctaClicks: 96 }) },
        },
        {
          provide: TournamentsRepository,
          useValue: {
            listTournaments: () => Promise.resolve({ rows: [COPA], cursor: null, hasMore: false }),
            byIds: (ids: string[]) => Promise.resolve(ids.includes('t1') ? [COPA] : []),
          },
        },
      ],
    }).compileComponents();
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(BlogPostEditorComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }
  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }
  const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event('input'));
  };
  const primary = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('bo-page-header .bo-mini-btn-primary')!;

  it('post novo: endereço segue o título e o rascunho vai para a callable sem id', async () => {
    const host = await mount(null);
    expect(primary(host).textContent!.trim()).toBe('Salvar rascunho');
    expect(primary(host).disabled).toBeTrue();
    expect(host.querySelector('.issues')!.textContent).toContain('Dê um título ao post.');

    type(host.querySelector<HTMLInputElement>('.title-input')!, 'Liga nexaGO: 2ª etapa');
    type(host.querySelector<HTMLTextAreaElement>('textarea.paragraph')!, 'Tudo o que você precisa saber.');
    await settle();
    expect(host.querySelector<HTMLInputElement>('.slug-input')!.value).toBe('liga-nexago-2a-etapa');
    expect(host.querySelector('.read-time')!.textContent).toContain('1 min · calculado');
    expect(primary(host).disabled).toBeFalse();

    primary(host).click();
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    const input = save.calls.mostRecent().args[0];
    expect(input.id).toBeNull();
    expect(input.version).toBe(0);
    expect(input.post).toEqual(
      jasmine.objectContaining({
        title: 'Liga nexaGO: 2ª etapa',
        slug: 'liga-nexago-2a-etapa',
        status: 'draft',
        body: [{ type: 'paragraph', text: 'Tudo o que você precisa saber.' }],
        author: { name: 'Ana Souza', role: 'Equipe nexaGO' },
        publishAt: null,
      }),
    );
    expect(navigate).toHaveBeenCalledWith(['/painel/conteudo/blog', 'novo1'], { replaceUrl: true });
    expect(host.querySelector('.saved-ago')!.textContent!.trim()).toBe('Salvo agora');
  });

  it('post publicado: endereço preso, salvar manda a versão lida e tirar do ar pede confirmação', async () => {
    const host = await mount('p1');
    expect(primary(host).textContent!.trim()).toBe('Salvar alterações');
    expect(primary(host).disabled).toBeTrue();

    type(host.querySelector<HTMLInputElement>('.title-input')!, 'Chegou a Toalha nexaGO com o seu nome');
    await settle();
    expect(host.querySelector<HTMLInputElement>('.slug-input')!.value).toBe('chegou-a-toalha-nexago');
    primary(host).click();
    await settle();
    expect(save.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ id: 'p1', version: 4 }));

    const draftOption = [...host.querySelectorAll<HTMLButtonElement>('.option')].find((b) => b.textContent!.includes('Rascunho'))!;
    draftOption.click();
    await settle();
    primary(host).click();
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(host.querySelector('dialog[open] h2')!.textContent).toContain('Tirar o post do ar?');
  });

  it('conflito de versão mostra a mensagem do servidor e o Recarregar', async () => {
    const host = await mount('p1', () =>
      Promise.reject({ code: 'functions/failed-precondition', message: 'O post foi alterado por outra pessoa. Recarregue antes de salvar.' }),
    );
    type(host.querySelector<HTMLInputElement>('.subtitle-input')!, 'Nova linha fina');
    await settle();
    primary(host).click();
    await settle();
    expect(host.querySelector('.bo-alert')!.textContent).toContain('O post foi alterado por outra pessoa.');
    expect([...host.querySelectorAll('.bo-alert button')].map((b) => b.textContent!.trim())).toEqual(['Recarregar']);
  });

  it('post que não existe mais', async () => {
    const host = await mount('sumiu');
    expect(host.querySelector('.empty')!.textContent).toContain('Este post não existe mais.');
  });

  it('push: ligar busca o alcance (com espera) e mostra a linha; desligar o app vira erro', async () => {
    const host = await mount('p1', undefined, { ...STORED, status: 'scheduled', publishAt: new Date('2099-01-01T12:00:00Z') });
    const pushToggle = host.querySelector<HTMLButtonElement>('bo-blog-push-settings bo-toggle button')!;
    pushToggle.click();
    await settle();
    expect(host.querySelector('bo-blog-push-settings .reach')!.textContent!.trim()).toBe('Calculando alcance…');
    await new Promise((r) => setTimeout(r, 600));
    await settle();
    expect(estimate).toHaveBeenCalledOnceWith({ city: null, sport: 'all', category: 'loja' });
    expect(host.querySelector('bo-blog-push-settings .reach')!.textContent!.trim()).toBe(
      'Alcance estimado: 1.240 atletas com o app atualizado · de 3.106 no público · respeita quem desligou avisos do blog',
    );
    const cities = [...host.querySelectorAll('bo-blog-push-settings option')].map((o) => o.textContent!.trim());
    expect(cities).toContain('Goiânia · 2100');

    const appToggle = host.querySelector<HTMLButtonElement>('bo-toggle[ariaLabel="Blog no app"] button')!;
    appToggle.click();
    await settle();
    expect(host.querySelector('.issues')!.textContent).toContain('A notificação abre o post no app: ligue "Blog no app".');
    expect(primary(host).disabled).toBeTrue();
  });

  it('push já enviado vira resumo, sem controle para religar', async () => {
    const host = await mount('p1', undefined, {
      ...STORED,
      push: { enabled: true, city: null, sport: 'all' },
      pushSentAt: new Date('2026-10-28T12:00:05Z'),
      pushResult: { state: 'sent', recipients: 1240, sent: 1200 },
    });
    expect(host.querySelector('bo-blog-push-settings')!.textContent).toContain('Push enviado em 28 out · 09:00 para 1.240 atletas');
    expect(host.querySelector('bo-blog-push-settings bo-toggle')).toBeNull();
    expect(estimate).not.toHaveBeenCalled();
  });

  it('publicado sem push enviado avisa que ligar agora não envia', async () => {
    const host = await mount('p1');
    expect(host.querySelector('bo-blog-push-settings')!.textContent).toContain('ligar agora não envia');
  });

  it('bloco nexaGO: escolher torneio insere o bloco com a prévia e vai no post', async () => {
    const host = await mount('p1');
    host.querySelector<HTMLButtonElement>('bo-blog-embed-menu .trigger')!.click();
    await settle();
    const item = [...host.querySelectorAll<HTMLButtonElement>('bo-blog-embed-menu .item')].find((b) => b.textContent!.includes('Torneio'))!;
    item.click();
    await settle();
    const option = host.querySelector<HTMLButtonElement>('bo-blog-embed-picker .row')!;
    expect(option.textContent).toContain('Copa Goiás Beach');
    expect(option.textContent).toContain('Goiânia · 14 nov');
    option.click();
    await settle();
    const insert = [...host.querySelectorAll<HTMLButtonElement>('bo-blog-embed-picker dialog .actions button')].find(
      (b) => b.textContent!.trim() === 'Inserir',
    )!;
    insert.click();
    await settle();
    expect(host.querySelector('bo-blog-embed-picker')).toBeNull();
    expect(host.querySelector('bo-blog-embed-preview')!.textContent).toContain('Copa Goiás Beach');

    primary(host).click();
    await settle();
    expect(save.calls.mostRecent().args[0].post.body).toContain({ type: 'tournament', tournamentId: 't1' });
  });

  it('post publicado mostra o resultado; agendado não', async () => {
    const host = await mount('p1', undefined, { ...STORED, cta: { label: 'Personalizar', destination: 'loja', url: null } });
    const rows = [...host.querySelectorAll('bo-blog-post-result .row')].map((r) => [
      r.querySelector('dt')!.textContent!.trim(),
      r.querySelector('dd')!.textContent!.trim(),
    ]);
    expect(rows).toEqual([
      ['Leituras no app', '2.140'],
      ['Tempo médio', '2m 31s'],
      ['Lido até o fim', '60%'],
      ['Cliques na chamada', '96 · 4,5%'],
      ['“Ajudou”', '2'],
      ['Leitores', '10'],
    ]);
  });

  it('post agendado não mostra o resultado', async () => {
    const host = await mount('p1', undefined, { ...STORED, status: 'scheduled', publishAt: new Date('2099-01-01T12:00:00Z') });
    expect(host.querySelector('bo-blog-post-result')).toBeNull();
  });

  const menuItem = async (host: HTMLElement, label: string) => {
    host.querySelector<HTMLButtonElement>('bo-blog-embed-menu .trigger')!.click();
    await settle();
    return [...host.querySelectorAll<HTMLButtonElement>('bo-blog-embed-menu .item')].find((b) => b.textContent!.includes(label))!;
  };
  const dialogButton = (host: HTMLElement, selector: string, label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>(`${selector} dialog .actions button`)].find((b) => b.textContent!.trim() === label)!;

  it('arena: busca por cidade, insere com a prévia e vai no post', async () => {
    const host = await mount('p1');
    (await menuItem(host, 'Arena')).click();
    await settle();
    const search = host.querySelector<HTMLInputElement>('bo-blog-embed-picker input')!;
    type(search, 'anapolis');
    await settle();
    expect([...host.querySelectorAll('bo-blog-embed-picker .row .name')].map((e) => e.textContent!.trim())).toEqual(['Beach Point']);
    type(search, 'goiania');
    await settle();
    host.querySelector<HTMLButtonElement>('bo-blog-embed-picker .row')!.click();
    await settle();
    dialogButton(host, 'bo-blog-embed-picker', 'Inserir').click();
    await settle();
    expect(host.querySelector('bo-blog-embed-preview')!.textContent).toContain('Arena Errejota');
    primary(host).click();
    await settle();
    expect(save.calls.mostRecent().args[0].post.body).toContain({ type: 'arena', arenaId: 'a1' });
  });

  it('ranking: escolhe esporte, equipes e gênero; o bloco mostra o resumo', async () => {
    const host = await mount('p1');
    (await menuItem(host, 'Ranking')).click();
    await settle();
    expect(dialogButton(host, 'bo-blog-ranking-picker', 'Inserir').disabled).toBeTrue();
    const select = host.querySelector<HTMLSelectElement>('bo-blog-ranking-picker select')!;
    select.value = 'beachVolleyball';
    select.dispatchEvent(new Event('change'));
    const chip = (label: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('bo-blog-ranking-picker .chip')].find((b) => b.textContent!.trim() === label)!;
    chip('Equipes').click();
    chip('Feminino').click();
    await settle();
    dialogButton(host, 'bo-blog-ranking-picker', 'Inserir').click();
    await settle();
    expect(host.querySelector('bo-blog-block-editor .rank-summary')!.textContent!.trim()).toBe('Top 5 · Vôlei de praia · Equipes · Feminino');
    primary(host).click();
    await settle();
    expect(save.calls.mostRecent().args[0].post.body).toContain({ type: 'ranking', sport: 'beachVolleyball', mode: 'teams', gender: 'feminino' });
  });

  it('com 10 blocos nexaGO os quatro tipos desabilitam e o vídeo segue livre', async () => {
    const body = Array.from({ length: 10 }, () => ({ type: 'ranking' as const, sport: 'padel', mode: 'athletes' as const, gender: 'all' as const }));
    const host = await mount('p1', undefined, { ...STORED, body });
    host.querySelector<HTMLButtonElement>('bo-blog-embed-menu .trigger')!.click();
    await settle();
    const items = [...host.querySelectorAll<HTMLButtonElement>('bo-blog-embed-menu .item')].map((b) => [
      b.querySelector('strong')!.textContent!.trim(),
      b.disabled,
    ]);
    expect(items).toEqual([
      ['Torneio ou liga', true],
      ['Produto da loja', true],
      ['Arena', true],
      ['Ranking', true],
      ['Vídeo', false],
    ]);
    expect(host.querySelector('bo-blog-embed-menu .note')!.textContent).toContain('Até 10 blocos nexaGO (torneio, produto, arena, ranking) por post.');
  });

  it('post novo por pauta: query params preenchem o rascunho e ele vai ao salvar', async () => {
    const host = await mount(null, undefined, STORED, {
      categoria: 'torneios',
      esporte: 'beachVolleyball',
      titulo: 'Inscrições abertas: Copa Goiás Beach',
      torneio: 't1',
    });
    expect(host.querySelector<HTMLInputElement>('.title-input')!.value).toBe('Inscrições abertas: Copa Goiás Beach');
    expect(host.querySelector('bo-blog-embed-preview')!.textContent).toContain('Copa Goiás Beach');
    expect(save).not.toHaveBeenCalled();
    type(host.querySelector<HTMLTextAreaElement>('textarea.paragraph')!, 'Vem aí.');
    await settle();
    primary(host).click();
    await settle();
    expect(save.calls.mostRecent().args[0].post).toEqual(
      jasmine.objectContaining({
        category: 'torneios',
        sport: 'beachVolleyball',
        slug: 'inscricoes-abertas-copa-goias-beach',
        body: [
          { type: 'paragraph', text: 'Vem aí.' },
          { type: 'tournament', tournamentId: 't1' },
        ],
      }),
    );
  });
});
