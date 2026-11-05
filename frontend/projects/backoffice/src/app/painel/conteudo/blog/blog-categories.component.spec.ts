import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { BlogCategoriesComponent } from './blog-categories.component';
import { BlogPostsRepository } from './data/blog-posts.repository';
import { categoryFromDoc, type BlogCategoryDef, type SaveBlogCategoryInput } from './data/blog-taxonomy';
import { BlogTaxonomyRepository } from './data/blog-taxonomy.repository';

describe('BlogCategoriesComponent', () => {
  let docs: BlogCategoryDef[];
  let saveCategory: jasmine.Spy<(input: SaveBlogCategoryInput) => Promise<{ id: string }>>;

  async function mount(): Promise<HTMLElement> {
    docs = [categoryFromDoc('saude', { label: 'Saúde', color: '#3DD9C1', colorLight: '#0F6E60', order: 6, active: true })!];
    saveCategory = jasmine.createSpy('saveCategory').and.callFake((input: SaveBlogCategoryInput) => Promise.resolve({ id: input.id ?? 'nova' }));
    await TestBed.configureTestingModule({
      imports: [BlogCategoriesComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        {
          provide: BlogTaxonomyRepository,
          useValue: { categoryDocs: () => Promise.resolve(docs), authors: () => Promise.resolve([]), saveCategory },
        },
        {
          provide: BlogPostsRepository,
          useValue: {
            list: () =>
              Promise.resolve([
                { category: 'treino', author: {} },
                { category: 'treino', author: {} },
              ]),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(BlogCategoriesComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }
  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }
  const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.row')];
  const button = (el: Element, label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label)!;

  it('lista efetiva na ordem, com nº de posts e situação', async () => {
    const host = await mount();
    expect(rows(host).map((r) => r.querySelector('.name')!.textContent!.trim())).toEqual([
      'Torneios',
      'Treino',
      'Regras',
      'Arenas',
      'Guia do app',
      'Loja',
      'Saúde',
    ]);
    expect(rows(host)[1]!.querySelector('.meta')!.textContent).toContain('treino · 2 posts · de origem');
    expect(rows(host)[6]!.querySelector('.meta')!.textContent).toContain('saude · 0 posts');
  });

  it('subir grava a ordem nova das duas que trocaram', async () => {
    const host = await mount();
    rows(host)[1]!.querySelector<HTMLButtonElement>('button[aria-label="Subir Treino"]')!.click();
    await settle();
    expect(saveCategory.calls.allArgs().map(([i]) => [i.id, i.order])).toEqual([
      ['treino', 0],
      ['torneios', 1],
    ]);
  });

  it('nova categoria: nome e par pronto vão ao servidor com a ordem depois da última', async () => {
    const host = await mount();
    button(host, 'Nova categoria').click();
    await settle();
    const form = host.querySelector('bo-blog-category-form')!;
    const input = form.querySelector<HTMLInputElement>('input')!;
    input.value = 'Nutrição';
    input.dispatchEvent(new Event('input'));
    form.querySelector<HTMLButtonElement>('.swatch[aria-label="Rosa"]')!.click();
    await settle();
    button(form, 'Criar categoria').click();
    await settle();
    expect(saveCategory).toHaveBeenCalledWith({ id: null, label: 'Nutrição', color: '#FF7AB6', colorLight: '#A3195B', order: 7, active: true });
  });

  it('desativar categoria com posts pede confirmação antes de salvar', async () => {
    const host = await mount();
    button(rows(host)[1]!, 'Editar').click();
    await settle();
    const form = host.querySelector('bo-blog-category-form')!;
    form.querySelector<HTMLButtonElement>('bo-toggle button')!.click();
    await settle();
    button(form, 'Salvar').click();
    await settle();
    expect(saveCategory).not.toHaveBeenCalled();
    expect(host.querySelector('dialog[open]')!.textContent).toContain('2 posts estão em “Treino”');
    const confirm = [...host.querySelectorAll<HTMLButtonElement>('dialog .actions button')].find((b) => b.textContent!.trim() === 'Desativar')!;
    confirm.click();
    await settle();
    expect(saveCategory).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'treino', active: false, order: 1 }));
  });
});
