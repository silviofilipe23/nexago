import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { BlogCalendarComponent } from './blog-calendar.component';
import type { BlogPost } from './data/blog-post';
import { BlogPostsRepository } from './data/blog-posts.repository';

function post(id: string, over: Partial<BlogPost>): BlogPost {
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
    author: { name: 'Ana', role: '' },
    body: [],
    cta: null,
    channels: { app: true, site: true },
    featured: false,
    push: { enabled: false, city: null, sport: 'all' },
    pushSentAt: null,
    pushResult: null,
    status: 'draft',
    publishAt: null,
    readMinutes: 1,
    readCount: 0,
    helpfulCount: 0,
    updatedAt: null,
    version: 1,
    ...over,
  };
}

const POSTS = [
  post('ag', { title: 'Chegou a Toalha', status: 'scheduled', publishAt: new Date('2026-11-12T12:00:00Z') }),
  post('pub', { title: 'Liga nexaGO', status: 'published', publishAt: new Date('2026-11-03T13:00:00Z') }),
  post('sem', { title: 'Guia da dupla', status: 'draft' }),
];

describe('BlogCalendarComponent', () => {
  let navigate: jasmine.Spy;

  async function mount(mes: string | null): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [BlogCalendarComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(mes ? { mes } : {}) } } },
        { provide: BlogPostsRepository, useValue: { list: () => Promise.resolve(POSTS) } },
      ],
    }).compileComponents();
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(BlogCalendarComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }
  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('mês da URL: chips nos dias (agendado com hora) e a faixa sem data', async () => {
    const host = await mount('2026-11');
    expect(host.querySelector('.toolbar h2')!.textContent!.trim()).toBe('Novembro 2026');
    const cell = (n: number) =>
      [...host.querySelectorAll<HTMLElement>('.grid .cell:not(.out)')].find((c) => c.querySelector('.num')!.textContent!.trim() === String(n))!;
    const chip = cell(12).querySelector<HTMLAnchorElement>('.chip')!;
    expect(chip.classList).toContain('st-scheduled');
    expect([chip.querySelector('.time')!.textContent!.trim(), chip.querySelector('.t')!.textContent!.trim()]).toEqual(['09:00', 'Chegou a Toalha']);
    expect(chip.getAttribute('href')).toBe('/painel/conteudo/blog/ag');
    expect(cell(3).querySelector('.chip')!.classList).toContain('st-published');
    expect(host.querySelector('.undated .chip .t')!.textContent!.trim()).toBe('Guia da dupla');
  });

  it('navegar de mês troca a grade e grava ?mes= na URL', async () => {
    const host = await mount('2026-11');
    host.querySelector<HTMLButtonElement>('button[aria-label="Próximo mês"]')!.click();
    await settle();
    expect(host.querySelector('.toolbar h2')!.textContent!.trim()).toBe('Dezembro 2026');
    expect(host.querySelectorAll('.grid .cell:not(.out) .chip').length).toBe(0);
    expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { mes: '2026-12' }, replaceUrl: true }));
  });
});
