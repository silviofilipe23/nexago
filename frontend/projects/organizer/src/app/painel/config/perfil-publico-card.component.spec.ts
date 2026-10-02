import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { deleteField, type FieldValue } from 'firebase/firestore';
import {
  ORGANIZER_COVER_MAX_BYTES,
  type OrganizerPublicProfilePatch,
  type OrganizerPublicProfileSettings,
} from '../data/organizer-public-profile';
import { OgConfigPerfilPublicoCardComponent } from './perfil-publico-card.component';
import { OrganizerPublicProfileGateway } from './perfil-publico.gateway';

/** Dublê do gateway: registra as chamadas e nunca encosta em canvas/Storage/Firestore. As
 *  promessas (inclusive a recusa) só nascem quando o card chama — recusa criada no setup vira
 *  "Unhandled promise rejection" e derruba o teste. */
class FakeGateway {
  readonly prepared: Blob[] = [];
  readonly uploads: Array<{ uid: string; jpeg: Blob }> = [];
  readonly saves: Array<{ uid: string; patch: OrganizerPublicProfilePatch }> = [];
  readonly preparedJpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
  uploadUrl = 'https://storage.example/capa-nova.jpg';
  saveError: Error | null = null;

  prepareCover(file: Blob): Promise<Blob> {
    this.prepared.push(file);
    return Promise.resolve(this.preparedJpeg);
  }

  uploadCover(uid: string, jpeg: Blob): Promise<string> {
    this.uploads.push({ uid, jpeg });
    return Promise.resolve(this.uploadUrl);
  }

  save(uid: string, patch: OrganizerPublicProfilePatch): Promise<void> {
    this.saves.push({ uid, patch });
    return this.saveError ? Promise.reject(this.saveError) : Promise.resolve();
  }
}

const PHONE = '62999853983';
const EMPTY: OrganizerPublicProfileSettings = { bio: '', coverUrl: null, publicWhatsapp: false };

describe('OgConfigPerfilPublicoCardComponent', () => {
  let fixture: ComponentFixture<OgConfigPerfilPublicoCardComponent>;
  let gateway: FakeGateway;

  beforeEach(async () => {
    gateway = new FakeGateway();
    // O portal roda zoneless: sem este provider o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [OgConfigPerfilPublicoCardComponent],
      providers: [provideZonelessChangeDetection(), { provide: OrganizerPublicProfileGateway, useValue: gateway }],
    }).compileComponents();
    fixture = TestBed.createComponent(OgConfigPerfilPublicoCardComponent);
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** O card encadeia promessas (redimensionar → subir → gravar) que o zoneless não acompanha:
   *  uma volta de macrotarefa esvazia as do dublê, que resolvem na hora. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function mount(profile: Partial<OrganizerPublicProfileSettings>, contactPhone: string): Promise<void> {
    fixture.componentRef.setInput('uid', 'org-1');
    fixture.componentRef.setInput('publicProfile', { ...EMPTY, ...profile });
    fixture.componentRef.setInput('contactPhone', contactPhone);
    fixture.componentRef.setInput('loading', false);
    await settle();
  }

  function button(label: string): HTMLButtonElement {
    const found = [...el().querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label));
    if (!found) throw new Error(`botão "${label}" não encontrado`);
    return found;
  }

  async function click(target: HTMLElement): Promise<void> {
    target.click();
    await settle();
  }

  async function startEdit(): Promise<void> {
    await click(button('Editar'));
  }

  function whatsappRow(): HTMLElement {
    return el().querySelector<HTMLElement>('og-toggle-row')!;
  }

  function textarea(): HTMLTextAreaElement {
    return el().querySelector<HTMLTextAreaElement>('textarea')!;
  }

  async function typeBio(value: string): Promise<void> {
    textarea().value = value;
    textarea().dispatchEvent(new Event('input'));
    await settle();
  }

  async function pickCover(file: File): Promise<void> {
    const input = el().querySelector<HTMLInputElement>('input[type=file]')!;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await settle();
  }

  async function submit(): Promise<void> {
    await click(button('Salvar'));
  }

  function lastPatch(): OrganizerPublicProfilePatch {
    expect(gateway.saves.length).toBe(1);
    return gateway.saves[0]!.patch;
  }

  it('leitura mostra a bio e o link do perfil público em nova aba', async () => {
    await mount({ bio: 'Areia todo fim de semana' }, PHONE);

    expect(el().textContent).toContain('Areia todo fim de semana');
    const link = el().querySelector<HTMLAnchorElement>('a.og-pp-link')!;
    expect(link.textContent).toContain('Ver meu perfil público');
    expect(link.href).toBe('https://atleta.nexago.com.br/organizadores/org-1');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('sem telefone de contato o switch fica desabilitado, com a dica, e o clique não liga', async () => {
    await mount({ publicWhatsapp: true }, '');
    await startEdit();

    const row = whatsappRow();
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.textContent).toContain('Preencha o telefone de contato no card Perfil');
    expect(row.querySelector('.og-toggle')!.classList).not.toContain('on');

    await click(row);
    expect(whatsappRow().querySelector('.og-toggle')!.classList).not.toContain('on');
  });

  it('com telefone de contato o switch liga', async () => {
    await mount({}, PHONE);
    await startEdit();

    expect(whatsappRow().getAttribute('aria-disabled')).toBeNull();
    await click(whatsappRow());
    expect(whatsappRow().querySelector('.og-toggle')!.classList).toContain('on');
  });

  it('contador acompanha a bio, com teto de 280', async () => {
    await mount({ bio: 'Oi' }, PHONE);
    await startEdit();

    expect(textarea().maxLength).toBe(280);
    expect(el().querySelector('.og-pp-counter')!.textContent?.trim()).toBe('2/280');
    await typeBio('Torneios de areia');
    expect(el().querySelector('.og-pp-counter')!.textContent?.trim()).toBe('17/280');
  });

  it('salvar manda só as três chaves pontilhadas, com a bio aparada', async () => {
    await mount({ coverUrl: 'https://storage.example/capa-atual.jpg' }, PHONE);
    await startEdit();
    await typeBio('  Nova bio  ');
    await click(whatsappRow());
    await submit();

    expect(gateway.saves[0]?.uid).toBe('org-1');
    const patch = lastPatch();
    expect(Object.keys(patch).sort()).toEqual([
      'organizerProfile.bio',
      'organizerProfile.coverUrl',
      'organizerProfile.publicWhatsapp',
    ]);
    expect(patch['organizerProfile.bio']).toBe('Nova bio');
    expect(patch['organizerProfile.coverUrl']).toBe('https://storage.example/capa-atual.jpg');
    expect(patch['organizerProfile.publicWhatsapp']).toBeTrue();
    expect(gateway.uploads.length).toBe(0);
    expect(textarea()).toBeNull();
    expect(el().textContent).toContain('Perfil público atualizado.');
  });

  it('remover a capa grava deleteField()', async () => {
    await mount({ coverUrl: 'https://storage.example/capa-atual.jpg' }, PHONE);
    await startEdit();
    await click(button('Remover capa'));
    await submit();

    const cover = lastPatch()['organizerProfile.coverUrl'] as FieldValue;
    expect(typeof cover).not.toBe('string');
    expect(cover.isEqual(deleteField())).toBeTrue();
  });

  it('capa nova é redimensionada na escolha e só sobe no Salvar, com a URL nova no patch', async () => {
    await mount({}, PHONE);
    await startEdit();
    const file = new File([new Uint8Array(2048)], 'capa.png', { type: 'image/png' });
    await pickCover(file);

    expect(gateway.prepared).toEqual([file]);
    expect(gateway.uploads.length).toBe(0);
    expect(el().querySelector<HTMLImageElement>('.og-pp-cover img')!.src).toMatch(/^blob:/);

    await submit();
    expect(gateway.uploads.length).toBe(1);
    expect(gateway.uploads[0]!.uid).toBe('org-1');
    expect(gateway.uploads[0]!.jpeg).toBe(gateway.preparedJpeg);
    expect(lastPatch()['organizerProfile.coverUrl']).toBe('https://storage.example/capa-nova.jpg');
  });

  it('cancelar depois de escolher a capa não sobe nem grava nada', async () => {
    await mount({ coverUrl: 'https://storage.example/capa-atual.jpg' }, PHONE);
    await startEdit();
    await pickCover(new File([new Uint8Array(2048)], 'capa.png', { type: 'image/png' }));
    await click(button('Cancelar'));

    expect(gateway.uploads.length).toBe(0);
    expect(gateway.saves.length).toBe(0);
    expect(el().querySelector<HTMLImageElement>('.og-pp-cover img')!.src).toBe('https://storage.example/capa-atual.jpg');
  });

  it('arquivo acima de 5 MB é recusado antes de redimensionar', async () => {
    await mount({}, PHONE);
    await startEdit();
    await pickCover(new File([new Uint8Array(ORGANIZER_COVER_MAX_BYTES + 1)], 'grande.jpg', { type: 'image/jpeg' }));

    expect(gateway.prepared.length).toBe(0);
    expect(el().textContent).toContain('Imagem muito grande (máximo 5 MB).');
  });

  it('falha ao salvar mostra erro em português e mantém a edição aberta', async () => {
    gateway.saveError = new Error('PERMISSION_DENIED');
    const warn = spyOn(console, 'warn');
    await mount({}, PHONE);
    await startEdit();
    await typeBio('Bio');
    await submit();

    expect(el().textContent).toContain('Não foi possível salvar o perfil público. Tente novamente.');
    expect(textarea()).not.toBeNull();
    // O motivo real (rede, permissão) fica no console para quem for investigar.
    expect(warn).toHaveBeenCalledWith('Perfil público: falha ao salvar', gateway.saveError);
  });
});
