import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { BlogBadgesService } from '../../data/blog-badges.service';
import { BlogCommentsComponent } from './blog-comments.component';
import type { BlogComment, BlogCommentStatus } from './data/blog-comments';
import { BlogCommentsRepository } from './data/blog-comments.repository';
import { BlogPostsRepository } from './data/blog-posts.repository';

const NOW = new Date();

function comment(id: string, over: Partial<BlogComment> = {}): BlogComment {
  return {
    id,
    postId: 'p1',
    uid: 'u1',
    author: { name: 'Ana S.', photoUrl: null },
    text: `Comentário ${id}`,
    kind: 'comment',
    status: 'pending',
    createdAt: NOW,
    reply: null,
    ...over,
  };
}

describe('BlogCommentsComponent', () => {
  let page: jasmine.Spy;
  let moderate: jasmine.Spy;
  let badges: { pendingComments: ReturnType<typeof signal<number | null>>; refresh: jasmine.Spy; adjust: (d: number) => void };

  async function mount(
    list: BlogComment[] = [comment('a', { kind: 'question' }), comment('b')],
    query: Record<string, string> = {},
    moderateImpl: () => Promise<void> = () => Promise.resolve(),
  ): Promise<HTMLElement> {
    page = jasmine.createSpy('page').and.callFake((status: BlogCommentStatus) =>
      Promise.resolve({ comments: list.filter((c) => c.status === status), cursor: null, hasMore: false }),
    );
    moderate = jasmine.createSpy('moderate').and.callFake(moderateImpl);
    const pending = signal<number | null>(list.filter((c) => c.status === 'pending').length);
    badges = {
      pendingComments: pending,
      refresh: jasmine.createSpy('refresh').and.resolveTo(),
      adjust: (d: number) => pending.update((n) => (n ?? 0) + d),
    };
    await TestBed.configureTestingModule({
      imports: [BlogCommentsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: BlogCommentsRepository, useValue: { page, moderate, pendingCount: () => Promise.resolve(0) } },
        { provide: BlogPostsRepository, useValue: { list: () => Promise.resolve([{ id: 'p1', title: 'Chegou a Toalha' }]) } },
        { provide: BlogBadgesService, useValue: badges },
      ],
    }).compileComponents();
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(BlogCommentsComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }
  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }
  const items = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.item')];
  const button = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label)!;

  it('pendentes por padrão: autor, link do post, selo Dúvida e o filtro "Só dúvidas"', async () => {
    const host = await mount();
    expect(page).toHaveBeenCalledWith('pending', null, null);
    expect(badges.refresh).toHaveBeenCalled();
    expect(items(host).length).toBe(2);
    const first = items(host)[0]!;
    expect(first.querySelector('.post-link')!.textContent!.trim()).toBe('Chegou a Toalha');
    expect(first.querySelector('.post-link')!.getAttribute('href')).toBe('/painel/conteudo/blog/p1');
    expect(first.querySelector('bo-pill')!.textContent!.trim()).toBe('Dúvida');
    host.querySelector<HTMLButtonElement>('.bo-chip')!.click();
    await settle();
    expect(items(host).map((i) => i.querySelector('.text')!.textContent!.trim())).toEqual(['Comentário a']);
  });

  it('aprovar sai da lista na hora, baixa o selo e chama a callable', async () => {
    const host = await mount();
    button(items(host)[1]!, 'Aprovar').click();
    await settle();
    expect(moderate).toHaveBeenCalledWith({ postId: 'p1', commentId: 'b', action: 'approve' });
    expect(items(host).length).toBe(1);
    expect(badges.pendingComments()).toBe(1);
  });

  it('erro desfaz e mostra a mensagem; "NOT FOUND" cru = função não publicada', async () => {
    const host = await mount(undefined, {}, () => Promise.reject({ code: 'functions/not-found', message: 'NOT FOUND' }));
    button(items(host)[0]!, 'Recusar').click();
    await settle();
    expect(items(host).length).toBe(2);
    expect(badges.pendingComments()).toBe(2);
    expect(host.querySelector('.bo-alert')!.textContent).toContain('Função ainda não publicada no servidor.');
  });

  it('responder: limite, aviso do push e responder aprova', async () => {
    const host = await mount();
    button(items(host)[0]!, 'Responder').click();
    await settle();
    const form = host.querySelector<HTMLElement>('.reply-form')!;
    expect(form.textContent).toContain('a primeira resposta avisa o atleta por push');
    expect(button(form, 'Enviar resposta').disabled).toBeTrue();
    const area = form.querySelector<HTMLTextAreaElement>('textarea')!;
    area.value = 'É assim que funciona.';
    area.dispatchEvent(new Event('input'));
    await settle();
    button(form, 'Enviar resposta').click();
    await settle();
    expect(moderate).toHaveBeenCalledWith({ postId: 'p1', commentId: 'a', action: 'reply', reply: 'É assim que funciona.' });
    expect(items(host).length).toBe(1);
  });

  it('aprovados filtrados pelo post: editar resposta; excluir pede confirmação', async () => {
    const host = await mount([comment('a', { status: 'approved', reply: { text: 'Antiga', byName: 'Marcelo', at: NOW } })], {
      aba: 'approved',
      post: 'p1',
    });
    expect(page).toHaveBeenCalledWith('approved', null, 'p1');
    expect(host.querySelector('.post-filter')!.textContent).toContain('Chegou a Toalha');
    expect(host.querySelector('.reply')!.textContent).toContain('Antiga');
    button(items(host)[0]!, 'Editar resposta').click();
    await settle();
    expect(host.querySelector('.reply-form')!.textContent).not.toContain('push');
    button(host.querySelector('.reply-form')!, 'Cancelar').click();
    await settle();

    button(items(host)[0]!, 'Excluir').click();
    await settle();
    expect(moderate).not.toHaveBeenCalled();
    const confirm = [...host.querySelectorAll<HTMLButtonElement>('dialog .actions button')].find((b) => b.textContent!.trim() === 'Excluir')!;
    confirm.click();
    await settle();
    expect(moderate).toHaveBeenCalledWith({ postId: 'p1', commentId: 'a', action: 'delete' });
    expect(items(host).length).toBe(0);
  });
});
