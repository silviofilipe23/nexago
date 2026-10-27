import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import type { AppNewsFeature, AppNewsRelease } from './data/app-news';
import { AppNewsRepository, type AppNewsState } from './data/app-news.repository';
import { PanelAppNewsComponent } from './panel-app-news.component';

function feature(id: string, over: Partial<AppNewsFeature> = {}): AppNewsFeature {
  return {
    id,
    title: `Func ${id}`,
    summary: 'Uma linha com o benefício.',
    description: '',
    steps: ['Abra', 'Toque'],
    where: 'Início',
    ctaLabel: 'Abrir',
    destination: 'reservar',
    url: null,
    imageUrl: null,
    icon: null,
    stories: true,
    ...over,
  };
}

function release(version: string, build: number, over: Partial<AppNewsRelease> = {}): AppNewsRelease {
  return {
    version,
    build,
    date: '2026-10-01',
    stories: true,
    features: [feature(`f${build}`)],
    improvements: [],
    published: true,
    ...over,
  };
}

const LIST = [
  release('1.0.16', 114, { published: false, date: null, features: [feature('rascunho', { title: '' })] }),
  release('1.0.15', 113, { date: '2099-01-01' }),
  release('1.0.14', 112),
];

describe('PanelAppNewsComponent', () => {
  let save: jasmine.Spy<(releases: AppNewsRelease[], version: number) => Promise<AppNewsState>>;

  async function mount(state: Partial<AppNewsState> = {}, saveImpl?: () => Promise<AppNewsState>): Promise<HTMLElement> {
    save = jasmine
      .createSpy('save')
      .and.callFake(
        saveImpl ??
          ((releases: AppNewsRelease[], version: number) =>
            Promise.resolve({ releases: [...releases].sort((a, b) => b.build - a.build), version: version + 1, imported: false })),
      );
    await TestBed.configureTestingModule({
      imports: [PanelAppNewsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        {
          provide: AppNewsRepository,
          useValue: {
            load: () => Promise.resolve({ releases: LIST, version: 7, imported: false, ...state }),
            save,
            uploadImage: jasmine.createSpy('uploadImage'),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelAppNewsComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }
  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }
  const versions = (host: HTMLElement) =>
    [...host.querySelectorAll<HTMLElement>('.versions .version')].map((v) => [
      v.querySelector('.v-num')!.textContent!.trim(),
      v.querySelector('bo-pill')!.textContent!.trim(),
    ]);
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

  it('lista as versões pelo build, com o status, e abre a mais nova', async () => {
    const host = await mount();
    expect(versions(host)).toEqual([
      ['1.0.16', 'Rascunho'],
      ['1.0.15', 'Agendada'],
      ['1.0.14', 'Publicada'],
    ]);
    expect(field(host, 'Número').value).toBe('1.0.16');
    expect(field(host, 'Build da loja').value).toBe('114');
  });

  it('não inventa métricas: o app não mede quem viu nem quem tocou', async () => {
    const host = await mount();
    expect(host.querySelector('bo-kpi-mini')).toBeNull();
    expect(host.textContent).not.toMatch(/\d+\s*viram/);
  });

  it('rascunho incompleto não publica e diz o que falta', async () => {
    const host = await mount();
    expect(button(host, 'Publicar').disabled).toBeTrue();
    expect(statusLine(host)).toBe('Para publicar: 1 funcionalidade incompleta.');
    expect(host.querySelector('.feat-sub')!.textContent!.trim()).toBe('Falta o título.');
  });

  it('nova versão sugere a seguinte e publica com id da funcionalidade tirado do título', async () => {
    const host = await mount({ releases: LIST.slice(1) });
    await click(button(host, 'Nova versão'));
    expect(field(host, 'Número').value).toBe('1.0.16');
    expect(field(host, 'Build da loja').value).toBe('114');
    expect(statusLine(host)).toBe('Para publicar: Adicione pelo menos uma funcionalidade.');

    await click(button(host, 'Adicionar'));
    await type(field(host, 'Título'), 'Radar ao vivo');
    await type(field(host, 'Texto do botão'), 'Abrir radar');
    await type(field(host, 'Resumo · lista e stories'), 'Quadra livre agora, no mapa.');
    expect(statusLine(host)).toBe('Pronta para publicar.');

    await click(button(host, 'Publicar'));
    expect(save).toHaveBeenCalledTimes(1);
    const [sent, version] = save.calls.mostRecent().args;
    expect(version).toBe(7);
    const published = sent.find((r) => r.version === '1.0.16')!;
    expect(published).toEqual(jasmine.objectContaining({ build: 114, published: true, date: null }));
    expect(published.features[0]).toEqual(
      jasmine.objectContaining({ id: 'radar-ao-vivo', title: 'Radar ao vivo', ctaLabel: 'Abrir radar', destination: 'reservar' }),
    );
    expect('key' in published.features[0]!).toBeFalse();
    // As outras versões vão como estavam.
    expect(sent.filter((r) => r.version !== '1.0.16')).toEqual(LIST.slice(1));
    expect(host.querySelector('.bo-feedback')!.textContent).toContain('Novidades da 1.0.16 publicadas');
  });

  it('número ou build repetido barra o save', async () => {
    const host = await mount();
    await type(field(host, 'Build da loja'), '113');
    expect(statusLine(host)).toContain('O build 113 já é de outra versão.');
    expect(button(host, 'Salvar rascunho').disabled).toBeTrue();
  });

  it('sem botão: a funcionalidade publica sem texto de botão', async () => {
    const host = await mount();
    await click(host.querySelector<HTMLElement>('.feat-main')!);
    await type(field(host, 'Título'), 'Placar ao vivo');
    await click(button(host, 'Sem botão'));
    expect(field(host, 'Texto do botão').disabled).toBeTrue();
    expect(button(host, 'Publicar').disabled).toBeFalse();
  });

  it('trocar de versão com alterações pede para descartar', async () => {
    const host = await mount();
    await type(field(host, 'Número'), '1.0.17');
    await click(host.querySelectorAll<HTMLElement>('.versions .version')[2]!);
    expect(host.querySelector('bo-confirm-dialog')).not.toBeNull();
    expect(field(host, 'Número').value).toBe('1.0.17');
    await click(button(host, 'Descartar'));
    expect(field(host, 'Número').value).toBe('1.0.14');
  });

  it('excluir uma publicada grava a lista sem ela', async () => {
    const host = await mount();
    await click(host.querySelectorAll<HTMLElement>('.versions .version')[2]!);
    await click(button(host, 'Excluir'));
    await click(button(host, 'Excluir versão'));
    const [sent] = save.calls.mostRecent().args;
    expect(sent.map((r) => r.version)).toEqual(['1.0.16', '1.0.15']);
    expect(versions(host).map(([v]) => v)).toEqual(['1.0.16', '1.0.15']);
  });

  it('veio do espelho do app: avisa que o primeiro save vira a fonte', async () => {
    const host = await mount({ imported: true, version: 0 });
    expect(host.querySelector('.info')!.textContent).toContain('backoffice passa a ser a fonte');
  });

  it('outra pessoa salvou no meio: oferece recarregar', async () => {
    const host = await mount({}, () =>
      Promise.reject({ code: 'functions/failed-precondition', message: 'As novidades foram alteradas por outra pessoa.' }),
    );
    await type(field(host, 'Número'), '1.0.17');
    await click(button(host, 'Salvar rascunho'));
    expect(host.querySelector('.bo-alert')!.textContent).toContain('alteradas por outra pessoa');
    expect(button(host, 'Recarregar')).toBeTruthy();
    // O rascunho local fica: nada se perde até a pessoa recarregar.
    expect(field(host, 'Número').value).toBe('1.0.17');
  });
});
