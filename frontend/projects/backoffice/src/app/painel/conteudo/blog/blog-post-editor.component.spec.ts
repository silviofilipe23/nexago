import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { BlogPostEditorComponent } from './blog-post-editor.component';
import type { BlogPost, SaveBlogPostInput, SaveBlogPostResult } from './data/blog-post';
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

  async function mount(id: string | null, saveImpl?: (input: SaveBlogPostInput) => Promise<SaveBlogPostResult>): Promise<HTMLElement> {
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
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } },
        {
          provide: BlogPostsRepository,
          useValue: { get: () => Promise.resolve(id === 'p1' ? STORED : null), save, delete: jasmine.createSpy('delete'), uploadImage: jasmine.createSpy('uploadImage') },
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
});
