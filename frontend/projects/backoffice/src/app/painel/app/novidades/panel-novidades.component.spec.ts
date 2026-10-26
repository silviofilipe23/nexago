import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import type { HomeBanner, HomeBannerStats } from './data/home-banner';
import { HomeBannersRepository, type HomeBannersState } from './data/home-banners.repository';
import { PanelNovidadesComponent } from './panel-novidades.component';

function banner(id: string, over: Partial<HomeBanner> = {}): HomeBanner {
  return {
    id,
    format: 'carousel',
    title: `Banner ${id}`,
    description: 'Uma linha com o benefício.',
    ctaLabel: 'Abrir',
    imageUrl: null,
    destination: 'reservar',
    url: null,
    audience: 'all',
    startDate: null,
    endDate: null,
    hideAfterClick: true,
    dismissible: true,
    published: true,
    active: true,
    ...over,
  };
}

const LIST = [
  banner('a'),
  banner('pausado', { active: false }),
  banner('rascunho', { published: false }),
  banner('velho', { endDate: '2020-01-31' }),
  banner('futuro', { startDate: '2099-01-01' }),
  banner('b', { format: 'compact' }),
];

const STATS = new Map<string, HomeBannerStats>([
  ['a', { seen: 1000, clicked: 80, dismissed: 50 }],
  ['b', { seen: 1000, clicked: 20, dismissed: 150 }],
  ['velho', { seen: 9000, clicked: 900, dismissed: 0 }],
]);

describe('PanelNovidadesComponent', () => {
  let save: jasmine.Spy<(banners: HomeBanner[], version: number) => Promise<HomeBannersState>>;

  async function mount(list = LIST): Promise<HTMLElement> {
    save = jasmine
      .createSpy('save')
      .and.callFake((banners: HomeBanner[], version: number) => Promise.resolve({ banners, version: version + 1 }));
    await TestBed.configureTestingModule({
      imports: [PanelNovidadesComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        {
          provide: HomeBannersRepository,
          useValue: {
            load: () => Promise.resolve({ banners: list, version: 7 }),
            loadStats: () => Promise.resolve(STATS),
            save,
            uploadImage: jasmine.createSpy('uploadImage'),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelNovidadesComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }
  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }
  const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.list .row')];
  const statuses = (host: HTMLElement) => rows(host).map((r) => r.querySelector('bo-pill')!.textContent!.trim());
  const kpis = (host: HTMLElement) => [...host.querySelectorAll('bo-kpi-mini .value')].map((v) => v.textContent!.trim());
  function type(host: HTMLElement, index: number, value: string) {
    const el = host.querySelectorAll<HTMLInputElement>('bo-home-banner-drawer .counted input')[index]!;
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }
  /** Abre o ⋯ da linha e devolve o item do menu pelo texto. */
  async function menuItem(host: HTMLElement, row: number, label: string): Promise<HTMLButtonElement> {
    (rows(host)[row]!.querySelector('.more') as HTMLButtonElement).click();
    await settle();
    return [...host.querySelectorAll<HTMLButtonElement>('.menu button')].find((b) => b.textContent!.trim() === label)!;
  }
  const footButton = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('bo-home-banner-drawer .foot button')].find((b) => b.textContent!.trim() === label)!;

  it('lista na ordem do carrossel com o status de cada um', async () => {
    const host = await mount();
    expect(rows(host).map((r) => r.querySelector('.name')!.textContent!.trim())).toEqual(LIST.map((b) => b.title));
    expect(statuses(host)).toEqual(['No ar', 'Pausado', 'Rascunho', 'Encerrado', 'Agendado', 'No ar']);
    expect(host.querySelector('bo-page-header')!.textContent).toContain('2 no ar');
  });

  it('KPIs somam só os banners no ar', async () => {
    const host = await mount();
    expect(kpis(host)).toEqual(['2', '2.000', '5,0%', '10,0%']);
  });

  it('prévia mostra o carrossel no ar; o compacto só entra sem carrossel', async () => {
    const host = await mount();
    expect(host.querySelector('.side bo-home-banner-preview .title')!.textContent!.trim()).toBe('Banner a');
    expect(host.querySelector('.side bo-home-banner-preview .compact')).toBeNull();
  });

  it('filtro por status esconde os outros e trava a reordenação', async () => {
    const host = await mount();
    const tab = [...host.querySelectorAll<HTMLButtonElement>('.filters button')].find((b) => b.textContent!.includes('Rascunhos'))!;
    tab.click();
    await settle();
    expect(rows(host).length).toBe(1);
    expect((await menuItem(host, 0, 'Descer no carrossel')).disabled).toBeTrue();
  });

  it('subir pelo menu grava a lista na nova ordem', async () => {
    const host = await mount();
    (await menuItem(host, 1, 'Subir no carrossel')).click();
    await settle();
    expect(save.calls.mostRecent().args[0].map((b) => b.id)).toEqual(['pausado', 'a', 'rascunho', 'velho', 'futuro', 'b']);
    expect(host.querySelector('.bo-feedback')!.textContent).toContain('Ordem salva');
  });

  it('pausar pelo toggle grava a lista inteira com a versão lida; rascunho não tem toggle', async () => {
    const host = await mount();
    expect((rows(host)[2]!.querySelector('bo-toggle button') as HTMLButtonElement).disabled).toBeTrue();
    (rows(host)[0]!.querySelector('bo-toggle button') as HTMLButtonElement).click();
    await settle();
    const [sent, version] = save.calls.mostRecent().args;
    expect(sent[0]!.active).toBeFalse();
    expect(version).toBe(7);
    expect(statuses(host)[0]).toBe('Pausado');
  });

  it('versão velha (outra pessoa salvou) desfaz e oferece recarregar', async () => {
    const host = await mount();
    save.and.rejectWith({ code: 'functions/failed-precondition', message: 'Os banners foram alterados por outra pessoa.' });
    (await menuItem(host, 1, 'Subir no carrossel')).click();
    await settle();
    expect(rows(host)[0]!.querySelector('.name')!.textContent!.trim()).toBe('Banner a');
    expect(host.querySelector('.bo-alert button')!.textContent!.trim()).toBe('Recarregar');
  });

  it('novo banner publicado entra em 1º, com id do título; a prévia segue a digitação', async () => {
    const host = await mount();
    (host.querySelector('bo-page-header .bo-mini-btn-primary') as HTMLButtonElement).click();
    await settle();
    type(host, 0, 'Reserva com Pix');
    type(host, 1, 'Pague a quadra em 1 toque.');
    type(host, 2, 'Reservar');
    await settle();
    expect(host.querySelector('bo-home-banner-drawer bo-home-banner-preview .title')!.textContent!.trim()).toBe('Reserva com Pix');
    expect(host.querySelector('bo-home-banner-drawer .count')!.textContent!.replace(/\s/g, '')).toBe('15/22');

    footButton(host, 'Publicar').click();
    await settle();
    const [sent] = save.calls.mostRecent().args;
    expect(sent.length).toBe(LIST.length + 1);
    expect(sent[0]).toEqual(
      jasmine.objectContaining({ id: 'reserva-com-pix', title: 'Reserva com Pix', published: true, active: true, ctaLabel: 'Reservar' }),
    );
    expect(host.querySelector('bo-home-banner-drawer')).toBeNull();
    expect(host.querySelector('.bo-feedback')!.textContent).toContain('publicado na Home');
  });

  it('publicar incompleto não chega ao servidor; rascunho incompleto chega', async () => {
    const host = await mount();
    (host.querySelector('bo-page-header .bo-mini-btn-primary') as HTMLButtonElement).click();
    await settle();
    footButton(host, 'Publicar').click();
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(host.querySelector('bo-home-banner-drawer')!.textContent).toContain('Dê um título à novidade.');

    footButton(host, 'Salvar rascunho').click();
    await settle();
    expect(save.calls.mostRecent().args[0][0]).toEqual(jasmine.objectContaining({ id: 'novidade', published: false }));
  });

  it('editar publicado mantém publicado e a pausa como estava', async () => {
    const host = await mount();
    (rows(host)[1]!.querySelector('.info') as HTMLButtonElement).click();
    await settle();
    type(host, 0, 'Pausado editado');
    footButton(host, 'Salvar').click();
    await settle();
    expect(save.calls.mostRecent().args[0][1]).toEqual(
      jasmine.objectContaining({ id: 'pausado', title: 'Pausado editado', published: true, active: false }),
    );
  });

  it('sem banner: estado vazio e a prévia avisa que o bloco some', async () => {
    const host = await mount([]);
    expect(host.querySelector('.empty')!.textContent).toContain('Nenhum banner ainda');
    expect(host.querySelector('.phone-empty')!.textContent).toContain('o bloco não aparece na Home');
  });
});
