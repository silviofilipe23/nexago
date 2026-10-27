import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import type { AppGuideCategory, AppGuideTopic } from './data/app-guide';
import { AppGuideRepository, type AppGuideState } from './data/app-guide.repository';
import { PanelAppGuideComponent } from './panel-app-guide.component';

function topic(id: string, over: Partial<AppGuideTopic> = {}): AppGuideTopic {
  return {
    id,
    title: `Guia ${id}`,
    summary: 'Uma linha com o que o guia resolve.',
    description: '',
    steps: ['Abra', 'Toque'],
    where: 'Início',
    ctaLabel: 'Abrir',
    destination: 'reservar',
    url: null,
    imageUrl: null,
    icon: null,
    published: true,
    ...over,
  };
}

const LIST: AppGuideCategory[] = [
  { id: 'reservar', title: 'Reservar', topics: [topic('guia-a'), topic('guia-b', { published: false, title: '' })] },
  { id: 'competir', title: 'Competir', topics: [topic('guia-c')] },
];

describe('PanelAppGuideComponent', () => {
  let save: jasmine.Spy<(categories: AppGuideCategory[], version: number) => Promise<AppGuideState>>;
  let component: PanelAppGuideComponent;

  async function mount(state: Partial<AppGuideState> = {}, saveImpl?: () => Promise<AppGuideState>): Promise<HTMLElement> {
    save = jasmine
      .createSpy('save')
      .and.callFake(
        saveImpl ??
          ((categories: AppGuideCategory[], version: number) => Promise.resolve({ categories, version: version + 1, imported: false })),
      );
    await TestBed.configureTestingModule({
      imports: [PanelAppGuideComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        {
          provide: AppGuideRepository,
          useValue: {
            load: () => Promise.resolve({ categories: LIST, version: 7, imported: false, ...state }),
            save,
            uploadImage: jasmine.createSpy('uploadImage'),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelAppGuideComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }
  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }
  const categories = (host: HTMLElement) =>
    [...host.querySelectorAll<HTMLElement>('.cats .cat')].map((c) => [
      c.querySelector('.c-title')!.textContent!.trim(),
      c.querySelector('.c-meta')!.textContent!.trim(),
    ]);
  const topics = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.feat-title')].map((t) => t.textContent!.trim());
  const button = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label)!;
  /** O controle dentro do `bo-field` com esse rótulo. */
  const field = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll('bo-field')]
      .find((f) => f.querySelector('.label')!.textContent!.trim() === label)!
      .querySelector<HTMLInputElement>('input, textarea')!;
  async function type(el: HTMLInputElement, value: string) {
    el.value = value;
    el.dispatchEvent(new Event('input'));
    await settle();
  }
  async function click(el: HTMLElement) {
    el.click();
    await settle();
  }
  const statusLine = (host: HTMLElement) => host.querySelector('.status-line')!.textContent!.trim();
  const saveButton = (host: HTMLElement) => button(host, 'Salvar alterações');

  it('lista as categorias na ordem, com a contagem, e abre a primeira', async () => {
    const host = await mount();
    expect(categories(host)).toEqual([
      ['Reservar', '2 guias · 1 rascunho'],
      ['Competir', '1 guia'],
    ]);
    expect(field(host, 'Nome').value).toBe('Reservar');
    expect(topics(host)).toEqual(['Guia guia-a', 'Sem título']);
    expect(saveButton(host).disabled).toBeTrue();
    expect(statusLine(host)).toBe('Sem alterações. O app mostra o que está salvo.');
  });

  it('não inventa métricas: o app não mede quem leu', async () => {
    const host = await mount();
    expect(host.querySelector('bo-kpi-mini')).toBeNull();
  });

  it('veio do espelho do app: avisa que o primeiro save vira a fonte', async () => {
    const host = await mount({ imported: true, version: 0 });
    expect(host.querySelector('.info')!.textContent).toContain('backoffice passa a ser a fonte');
  });

  it('cria categoria e guia e salva a Central inteira com ids tirados do nome', async () => {
    const host = await mount();
    await type(host.querySelector<HTMLInputElement>('.cat-add input')!, 'Pagamentos');
    await click(button(host, 'Criar'));
    expect(field(host, 'Nome').value).toBe('Pagamentos');

    await click(button(host, 'Adicionar'));
    await type(field(host, 'Título'), 'Pagar com Pix');
    await type(field(host, 'Resumo · lista e busca'), 'Copie o código e pague no banco.');
    await click(host.querySelector<HTMLElement>('button[role="switch"][aria-label="Publicado no app"]')!);
    expect(statusLine(host)).toBe('Alterações não salvas. Vão ao app quando você salvar.');

    await click(saveButton(host));
    expect(save).toHaveBeenCalledTimes(1);
    const [sent, version] = save.calls.mostRecent().args;
    expect(version).toBe(7);
    expect(sent.map((c) => c.id)).toEqual(['reservar', 'competir', 'pagamentos']);
    expect(sent[2]!.topics[0]).toEqual(
      jasmine.objectContaining({ id: 'guia-pagar-com-pix', title: 'Pagar com Pix', destination: null, ctaLabel: '', published: true }),
    );
    expect('key' in sent[2]!.topics[0]!).toBeFalse();
    // As outras categorias vão como estavam.
    expect(sent.slice(0, 2)).toEqual(LIST);
    expect(host.querySelector('.bo-feedback')!.textContent).toContain('Central de ajuda salva');
    expect(field(host, 'Nome').value).toBe('Pagamentos');
  });

  it('renomeia e reordena categorias sem trocar o id', async () => {
    const host = await mount();
    await click(host.querySelectorAll<HTMLElement>('.cats .cat')[1]!);
    await type(field(host, 'Nome'), 'Torneios');
    await click(button(host, 'Subir'));
    expect(categories(host).map(([t]) => t)).toEqual(['Torneios', 'Reservar']);
    await click(saveButton(host));
    const [sent] = save.calls.mostRecent().args;
    expect(sent.map((c) => [c.id, c.title])).toEqual([
      ['competir', 'Torneios'],
      ['reservar', 'Reservar'],
    ]);
  });

  it('excluir categoria com guias pede confirmação e sai no save', async () => {
    const host = await mount();
    await click(button(host, 'Excluir categoria'));
    expect(host.querySelector('bo-confirm-dialog')).not.toBeNull();
    await click([...host.querySelectorAll<HTMLButtonElement>('bo-confirm-dialog button')].find((b) => b.textContent!.trim() === 'Excluir categoria')!);
    expect(categories(host).map(([t]) => t)).toEqual(['Competir']);
    await click(saveButton(host));
    const [sent] = save.calls.mostRecent().args;
    expect(sent.map((c) => c.id)).toEqual(['competir']);
  });

  it('guia publicado incompleto barra o save e diz onde; rascunho incompleto não barra', async () => {
    const host = await mount();
    await click(host.querySelector<HTMLElement>('.feat-main')!);
    await type(field(host, 'Título'), '');
    expect(saveButton(host).disabled).toBeTrue();
    expect(statusLine(host)).toBe('Para salvar: Reservar: 1 guia incompleto.');
    expect(host.querySelector('.cat .c-bad')).not.toBeNull();

    await type(field(host, 'Título'), 'Guia novo');
    await type(field(host, 'Resumo · lista e busca'), 'Outra linha.');
    // O guia-b segue rascunho sem título: não impede.
    expect(saveButton(host).disabled).toBeFalse();
  });

  it('sem botão: o guia publica sem texto de botão', async () => {
    const host = await mount();
    await click(host.querySelector<HTMLElement>('.feat-main')!);
    await type(field(host, 'Texto do botão'), '');
    expect(saveButton(host).disabled).toBeTrue();
    await click(button(host, 'Sem botão'));
    expect(field(host, 'Texto do botão').disabled).toBeTrue();
    expect(saveButton(host).disabled).toBeFalse();
  });

  it('descartar volta ao que está salvo', async () => {
    const host = await mount();
    await type(field(host, 'Nome'), 'Outro nome');
    await click(button(host, 'Descartar'));
    await click([...host.querySelectorAll<HTMLButtonElement>('bo-confirm-dialog button')].find((b) => b.textContent!.trim() === 'Descartar')!);
    expect(field(host, 'Nome').value).toBe('Reservar');
    expect(saveButton(host).disabled).toBeTrue();
  });

  it('sair com alteração pendente pergunta antes; sem alteração sai direto', async () => {
    const host = await mount();
    expect(component.canLeave()).toBeTrue();
    await type(field(host, 'Nome'), 'Reservas');
    const leaving = component.canLeave();
    expect(leaving).toBeInstanceOf(Promise);
    await settle();
    const dialog = [...host.querySelectorAll('dialog')].find((d) => d.textContent!.includes('Sair sem salvar?'))!;
    expect(dialog.open).toBeTrue();
    await click([...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Sair sem salvar')!);
    expect(await leaving).toBeTrue();
  });

  it('outra pessoa salvou no meio: oferece recarregar e mantém o rascunho local', async () => {
    const host = await mount({}, () =>
      Promise.reject({ code: 'functions/failed-precondition', message: 'A Central de ajuda foi alterada por outra pessoa.' }),
    );
    await type(field(host, 'Nome'), 'Reservas');
    await click(saveButton(host));
    expect(host.querySelector('.bo-alert')!.textContent).toContain('alterada por outra pessoa');
    expect(button(host, 'Recarregar')).toBeTruthy();
    expect(field(host, 'Nome').value).toBe('Reservas');
  });
});
