import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import type { BlogPost } from './data/blog-post';
import { BlogPostsRepository } from './data/blog-posts.repository';
import { PanelBlogComponent } from './panel-blog.component';

function post(id: string, over: Partial<BlogPost> = {}): BlogPost {
  return {
    id,
    title: `Post ${id}`,
    subtitle: '',
    slug: id,
    seoDescription: '',
    coverUrl: null,
    category: 'torneios',
    sport: 'all',
    tags: [],
    author: { name: 'Ana Souza', role: '' },
    body: [],
    cta: null,
    channels: { app: true, site: true },
    featured: false,
    push: { enabled: false, city: null, sport: 'all' },
    pushSentAt: null,
    pushResult: null,
    status: 'published',
    publishAt: new Date('2026-10-28T12:00:00Z'),
    readMinutes: 1,
    readCount: 0,
    helpfulCount: 0,
    updatedAt: null,
    version: 1,
    ...over,
  };
}

const POSTS = [
  post('a', { title: 'Liga nexaGO', readCount: 2140, helpfulCount: 12, cta: { label: 'Inscrição', destination: 'torneios', url: null } }),
  post('b', { title: 'Chegou a Toalha', category: 'loja', status: 'scheduled', publishAt: new Date('2099-11-12T12:00:00Z') }),
  post('c', { title: 'Regras do KOTC', category: 'regras', status: 'draft', publishAt: null }),
];

describe('PanelBlogComponent', () => {
  async function mount(list: () => Promise<BlogPost[]> = () => Promise.resolve(POSTS)): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [PanelBlogComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        { provide: BlogPostsRepository, useValue: { list } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelBlogComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }
  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }
  const texts = (host: HTMLElement, selector: string) =>
    [...host.querySelectorAll(selector)].map((e) => e.textContent!.replace(/\s+/g, ' ').trim());

  it('mostra só números reais e a tabela com autor e chamada', async () => {
    const host = await mount();
    expect(texts(host, 'bo-kpi-mini .label')).toEqual([
      'Posts publicados',
      'Agendados',
      'Leituras · todos os posts',
      '“Ajudou” · todos os posts',
    ]);
    expect(texts(host, 'bo-kpi-mini .value')).toEqual(['1', '1', '2.140', '12']);
    expect(texts(host, '.tabs button')).toEqual(['Todos 3', 'Publicados 1', 'Agendados 1', 'Em revisão 0', 'Rascunhos 1']);
    expect(texts(host, 'tbody .title')).toEqual(['Chegou a Toalha', 'Liga nexaGO', 'Regras do KOTC']);
    expect(texts(host, 'tbody .meta')).toContain('Ana Souza · chamada: Inscrição');
    expect(host.querySelector('a.title')!.getAttribute('href')).toBe('/painel/conteudo/blog/b');
  });

  it('aba e busca filtram; fila mostra agendado e rascunho sem data', async () => {
    const host = await mount();
    (host.querySelectorAll<HTMLButtonElement>('.tabs button')[4]!).click();
    await settle();
    expect(texts(host, 'tbody .title')).toEqual(['Regras do KOTC']);

    (host.querySelectorAll<HTMLButtonElement>('.tabs button')[0]!).click();
    const search = host.querySelector<HTMLInputElement>('.search input')!;
    search.value = 'toalha';
    search.dispatchEvent(new Event('input'));
    await settle();
    expect(texts(host, 'tbody .title')).toEqual(['Chegou a Toalha']);

    expect(texts(host, '.q-meta')).toEqual(['09:00 · app e site', 'rascunho sem data']);
  });

  it('erro de leitura vira mensagem com tentar de novo', async () => {
    const host = await mount(() => Promise.reject({ code: 'permission-denied', message: '' }));
    expect(host.querySelector('.bo-alert')!.textContent).toContain('Não foi possível carregar os posts.');
    expect(texts(host, 'button.retry')).toEqual(['Tentar de novo']);
  });
});
