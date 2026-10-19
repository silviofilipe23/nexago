import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import type { CampaignBanner } from './data/campaign';
import { CampaignsRepository, type CampaignsState } from './data/campaigns.repository';
import { PanelCampanhasComponent } from './panel-campanhas.component';

function banner(id: string, over: Partial<CampaignBanner> = {}): CampaignBanner {
  return {
    id,
    kicker: '',
    title: `Campanha ${id}`,
    subtitle: '',
    imageUrl: null,
    primary: { label: 'Ver coleção', collectionId: 'verao-2026' },
    secondary: null,
    startDate: null,
    endDate: null,
    active: true,
    ...over,
  };
}

const LIST = [
  banner('a'),
  banner('pausada', { active: false }),
  banner('b'),
  banner('velha', { endDate: '2020-01-31' }),
  banner('futura', { startDate: '2099-01-01' }),
  banner('c'),
  banner('d'),
];

/** Foto de verdade (PNG do canvas) com os pixels pedidos, e o data URL dela como "URL do Storage". */
async function photo(width: number, height: number): Promise<{ file: File; url: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  return { file: new File([blob], 'foto.png', { type: 'image/png' }), url: canvas.toDataURL('image/png') };
}

describe('PanelCampanhasComponent', () => {
  let save: jasmine.Spy<(banners: CampaignBanner[], version: number) => Promise<CampaignsState>>;
  let uploadImage: jasmine.Spy<(file: File, onProgress: (percent: number) => void) => Promise<string>>;

  async function mount(list = LIST): Promise<HTMLElement> {
    save = jasmine
      .createSpy('save')
      .and.callFake((banners: CampaignBanner[], version: number) => Promise.resolve({ banners, version: version + 1 }));
    uploadImage = jasmine.createSpy('uploadImage');
    await TestBed.configureTestingModule({
      imports: [PanelCampanhasComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        {
          provide: CampaignsRepository,
          useValue: { load: () => Promise.resolve({ banners: list, version: 4 }), save, uploadImage },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelCampanhasComponent);
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
  /** A leitura dos pixels (`createImageBitmap`) leva mais de um tique. */
  async function until(done: () => boolean) {
    for (let i = 0; i < 50 && !done(); i++) {
      await settle();
    }
  }
  function pick(host: HTMLElement, file: File) {
    const input = host.querySelector<HTMLInputElement>('bo-campaign-panel input[type="file"]')!;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }
  async function openNew(): Promise<HTMLElement> {
    const host = await mount();
    (host.querySelector('bo-page-header .bo-mini-btn-primary') as HTMLButtonElement).click();
    await settle();
    return host;
  }
  const hints = (host: HTMLElement) => [...host.querySelectorAll('bo-campaign-panel .photo-field .hint')].map((h) => h.textContent!.trim());
  function type(host: HTMLElement, selector: string, value: string) {
    const el = host.querySelector<HTMLInputElement>(selector)!;
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }

  it('lista na ordem da vitrine com o status de cada uma: 3 no ar, o 4º na fila', async () => {
    const host = await mount();
    expect(rows(host).map((r) => r.querySelector('.name')!.textContent!.trim())).toEqual(LIST.map((b) => b.title));
    expect(statuses(host)).toEqual(['No ar', 'Pausada', 'No ar', 'Encerrada', 'Agendada', 'No ar', 'Na fila']);
    expect(host.querySelector('bo-campaign-preview')).not.toBeNull();
  });

  it('descer grava a lista inteira na nova ordem com a versão lida', async () => {
    const host = await mount();
    (rows(host)[0]!.querySelector('[aria-label="Descer Campanha a"]') as HTMLButtonElement).click();
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    const [sent, version] = save.calls.mostRecent().args;
    expect(sent.map((b) => b.id)).toEqual(['pausada', 'a', 'b', 'velha', 'futura', 'c', 'd']);
    expect(version).toBe(4);
    expect(host.querySelector('.bo-feedback')!.textContent).toContain('Ordem salva');
  });

  it('pausar pelo toggle; se o servidor recusar, desfaz e mostra o erro', async () => {
    const host = await mount();
    save.and.rejectWith({ code: 'functions/invalid-argument', message: 'Dados inválidos.' });
    (rows(host)[0]!.querySelector('bo-toggle button') as HTMLButtonElement).click();
    await settle();
    expect(save.calls.mostRecent().args[0][0]!.active).toBeFalse();
    expect(statuses(host)[0]).toBe('No ar');
    expect(host.querySelector('.bo-alert')!.textContent).toContain('Dados inválidos.');
  });

  it('versão velha (outra pessoa salvou) oferece recarregar', async () => {
    const host = await mount();
    save.and.rejectWith({ code: 'functions/failed-precondition', message: 'As campanhas foram alteradas por outra pessoa.' });
    (rows(host)[2]!.querySelector('[aria-label="Subir Campanha b"]') as HTMLButtonElement).click();
    await settle();
    const alert = host.querySelector('.bo-alert')!;
    expect(alert.textContent).toContain('alteradas por outra pessoa');
    expect(alert.querySelector('button')!.textContent!.trim()).toBe('Recarregar');
  });

  it('nova campanha entra em 1º, com id a partir do título; a prévia segue a digitação', async () => {
    const host = await mount();
    (host.querySelector('bo-page-header .bo-mini-btn-primary') as HTMLButtonElement).click();
    await settle();
    type(host, 'bo-campaign-panel .counted input', 'Black Friday da areia');
    await settle();
    expect(host.querySelector('bo-campaign-preview .title')!.textContent!.trim()).toBe('Black Friday da areia');
    expect(host.querySelector('bo-campaign-panel .count')!.textContent!.replace(/\s/g, '')).toBe('21/50');

    (host.querySelector('bo-campaign-panel .foot .bo-mini-btn-primary') as HTMLButtonElement).click();
    await settle();
    const [sent] = save.calls.mostRecent().args;
    expect(sent.length).toBe(LIST.length + 1);
    expect(sent[0]).toEqual(jasmine.objectContaining({ id: 'black-friday-da-areia', title: 'Black Friday da areia', active: true }));
    expect(host.querySelector('bo-campaign-panel')).toBeNull();
  });

  it('título vazio não chega ao servidor', async () => {
    const host = await mount();
    (host.querySelector('bo-page-header .bo-mini-btn-primary') as HTMLButtonElement).click();
    await settle();
    (host.querySelector('bo-campaign-panel .foot .bo-mini-btn-primary') as HTMLButtonElement).click();
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(host.querySelector('bo-campaign-panel')!.textContent).toContain('Dê um título à campanha.');
  });

  it('campo da foto mostra o tamanho recomendado e a moldura 2:1', async () => {
    const host = await openNew();
    expect(host.querySelector('bo-campaign-panel .photo-size')!.textContent!.trim()).toBe('1600 × 800 px');
    expect(hints(host)[0]).toBe('Recomendado: 1600×800 px (2:1) · JPG, PNG ou WebP até 10 MB · mínimo 1200×600');
    const box = host.querySelector<HTMLElement>('bo-campaign-panel .photo')!.getBoundingClientRect();
    expect(box.width / box.height).toBeCloseTo(2, 1);
  });

  it('foto abaixo do mínimo não sobe', async () => {
    const host = await openNew();
    pick(host, (await photo(800, 400)).file);
    await until(() => hints(host).some((h) => h.includes('mínimo é')));
    expect(uploadImage).not.toHaveBeenCalled();
    expect(host.querySelector('bo-campaign-panel .hint.err')!.textContent).toContain(
      'A foto tem 800×400 px; o mínimo é 1200×600 (recomendado 1600×800).',
    );
  });

  it('foto fora de 2:1 sobe, mas avisa do recorte', async () => {
    const host = await openNew();
    const { file, url } = await photo(1600, 600);
    uploadImage.and.resolveTo(url);
    pick(host, file);
    await until(() => host.querySelector('bo-campaign-panel .hint.warn') !== null);
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(host.querySelector('bo-campaign-panel .hint.warn')!.textContent).toContain('1600×600 px (2,67:1)');
    expect(host.querySelector('bo-campaign-panel .hint.err')).toBeNull();
  });

  it('foto no tamanho recomendado sobe sem aviso e mostra os pixels', async () => {
    const host = await openNew();
    const { file, url } = await photo(1600, 800);
    uploadImage.and.resolveTo(url);
    pick(host, file);
    await until(() => hints(host).some((h) => h.startsWith('Foto atual')));
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(hints(host)[1]).toBe('Foto atual: 1600×800 px.');
    expect(host.querySelector('bo-campaign-panel .hint.warn')).toBeNull();
    expect(host.querySelector('bo-campaign-panel .photo img')!.getAttribute('src')).toBe(url);
  });

  it('sem campanha: estado vazio e prévia avisa que o bloco some', async () => {
    const host = await mount([]);
    expect(host.querySelector('.empty')!.textContent).toContain('Nenhuma campanha ainda');
    expect(host.querySelector('.empty-preview')!.textContent).toContain('Nenhuma campanha no ar hoje');
  });
});
