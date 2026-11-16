import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ClubRepository } from './data/club.repository';
import type { PrivateCouponWrite } from './data/club.repository';
import {
  emptyPartnerForm,
  formFromPartner,
  partnerFromDoc,
  partnerPayload,
  partnerPrivateFromDoc,
  type Partner,
  type PartnerPayload,
  type PartnerPrivate,
} from './data/partner';
import { PartnerEditorComponent } from './partner-editor.component';

const FAST: Partner = partnerFromDoc('fast-acai', {
  ...partnerPayload({
    ...emptyPartnerForm(),
    name: 'Fast Açaí',
    benefitHighlight: '10% OFF',
    benefitTitle: '10% de desconto em todo pedido',
    ctaLabel: 'Pedir com 10% off',
    link: 'https://fast.example',
    couponMode: 'fixed',
    couponCode: 'NEXAGO10',
    brandColor: '#5E1E7A',
    audience: 'all',
    priority: '50',
    active: true,
  }),
});

describe('PartnerEditorComponent', () => {
  let create: jasmine.Spy<(id: string, payload: PartnerPayload) => Promise<void>>;
  let update: jasmine.Spy<(id: string, payload: PartnerPayload, priv?: PrivateCouponWrite) => Promise<void>>;
  let notify: jasmine.Spy;
  let navigate: jasmine.Spy;
  let fixture: { componentInstance: PartnerEditorComponent };

  async function mount(id: string, priv: PartnerPrivate = partnerPrivateFromDoc(undefined)): Promise<HTMLElement> {
    create = jasmine.createSpy('createPartner').and.resolveTo();
    update = jasmine.createSpy('updatePartner').and.resolveTo();
    notify = jasmine.createSpy('notifyPartner').and.callFake((_id: string, _kind: string, dryRun: boolean) =>
      Promise.resolve(dryRun ? { recipients: 12, sent: 0 } : { recipients: 12, sent: 11 }),
    );
    await TestBed.configureTestingModule({
      imports: [PartnerEditorComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
        {
          provide: ClubRepository,
          useValue: {
            partners: () => Promise.resolve([FAST]),
            partner: (pid: string) => Promise.resolve(pid === FAST.id ? FAST : null),
            createPartner: create,
            updatePartner: update,
            deletePartner: jasmine.createSpy('deletePartner').and.resolveTo(),
            uploadLogo: jasmine.createSpy('uploadLogo'),
            uploadCover: jasmine.createSpy('uploadCover'),
            partnerPrivate: () => Promise.resolve(priv),
            notifyPartner: notify,
          },
        },
      ],
    }).compileComponents();
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const f = TestBed.createComponent(PartnerEditorComponent);
    fixture = f;
    f.detectChanges();
    await settle();
    return f.nativeElement as HTMLElement;
  }

  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }

  /** Campo pelo rótulo do `bo-field`. */
  function field(host: HTMLElement, label: string): HTMLInputElement | HTMLTextAreaElement {
    const f = [...host.querySelectorAll('bo-field')].find((el) => el.querySelector('.label')!.textContent!.trim() === label)!;
    return f.querySelector('input, textarea') as HTMLInputElement;
  }

  function type(host: HTMLElement, label: string, value: string) {
    const el = field(host, label);
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }

  const saveButton = (host: HTMLElement) =>
    [...host.querySelectorAll<HTMLButtonElement>('bo-page-header button')].find((b) => /Criar parceiro|Salvar/.test(b.textContent!))!;

  it('novo: não grava com campo obrigatório vazio e mostra os erros', async () => {
    const host = await mount('novo');
    saveButton(host).click();
    await settle();
    expect(create).not.toHaveBeenCalled();
    const errors = [...host.querySelectorAll('.err')].map((e) => e.textContent!.trim());
    expect(errors).toContain('Informe o nome do parceiro.');
    expect(errors).toContain('Descreva o benefício.');
    expect(host.querySelector('.bo-alert')!.textContent).toContain('Confira os campos destacados.');
  });

  it('novo: cria com o slug único do nome e troca a URL para o id', async () => {
    const host = await mount('novo');
    type(host, 'Nome', 'Fast Açaí');
    type(host, 'Benefício', '15% em todo pedido');
    type(host, 'Texto do botão', 'Pedir');
    await settle();
    expect(host.textContent).toContain('Id no app: fast-acai-2');
    expect(host.querySelector('bo-partner-preview')!.textContent).toContain('Fast Açaí');

    saveButton(host).click();
    await settle();
    expect(create).toHaveBeenCalledTimes(1);
    const [id, payload] = create.calls.mostRecent().args;
    expect(id).toBe('fast-acai-2');
    expect(payload.name).toBe('Fast Açaí');
    expect(payload.active).toBeFalse();
    expect(payload.audience).toBe('testers');
    expect(navigate).toHaveBeenCalledWith(['/painel/clube/parceiros', 'fast-acai-2'], { replaceUrl: true });
    expect(fixture.componentInstance.canLeave()).toBeTrue();
  });

  it('editar: carrega o parceiro, grava o doc inteiro e pergunta antes de sair com alteração', async () => {
    const host = await mount('fast-acai');
    expect((field(host, 'Nome') as HTMLInputElement).value).toBe('Fast Açaí');
    expect(host.textContent).toContain('Id fast-acai');
    expect(fixture.componentInstance.canLeave()).toBeTrue();

    type(host, 'Selo curto', '15% OFF');
    await settle();
    expect(fixture.componentInstance.canLeave()).toEqual(jasmine.any(Promise));
    fixture.componentInstance['resolveLeave'](false);

    saveButton(host).click();
    await settle();
    expect(update).toHaveBeenCalledTimes(1);
    const [id, payload] = update.calls.mostRecent().args;
    expect(id).toBe('fast-acai');
    expect(payload).toEqual({ ...partnerPayload(formFromPartner(FAST)), benefitHighlight: '15% OFF' });
    // 21 campos da v1 + 10 da versão premium (allowlist da rule, sem autoria).
    expect(Object.keys(payload).length).toBe(31);
    expect(payload.link).toBe('https://fast.example');
    expect(payload.couponCode).toBe('NEXAGO10');
    expect(create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.canLeave()).toBeTrue();
  });

  const buttonByText = (host: Element, text: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === text)!;

  it('requisito: o cupom fixo sai do doc público e vai para o privado no mesmo lote', async () => {
    const host = await mount('fast-acai');
    buttonByText(host.querySelector('bo-partner-premium-fields')!, 'Squad').click();
    await settle();
    expect(host.querySelector('bo-partner-preview')!.textContent).toContain('Exclusivo para embaixadores do Squad');

    saveButton(host).click();
    await settle();
    const [, payload, priv] = update.calls.mostRecent().args;
    expect(payload.requirement).toEqual({ type: 'squad' });
    expect(payload.couponCode).toBeNull();
    expect(priv).toEqual({ couponCode: 'NEXAGO10' });
  });

  it('sem requisito, um cupom que sobrou no privado é limpo no mesmo lote', async () => {
    const host = await mount('fast-acai', { couponCode: 'SQUAD20', notifiedNewAt: null, notifiedEndingAt: null });
    // FAST não tem requisito: o form usa o cupom público.
    expect((field(host, 'Código fixo') as HTMLInputElement).value).toBe('NEXAGO10');
    type(host, 'Selo curto', '20% OFF');
    await settle();
    saveButton(host).click();
    await settle();
    expect(update.calls.mostRecent().args[2]).toEqual({ couponCode: null });
  });

  it('aviso já enviado aparece com a data e o botão fica desligado', async () => {
    const host = await mount('fast-acai', { couponCode: null, notifiedNewAt: new Date(2026, 10, 10, 9, 0), notifiedEndingAt: null });
    const notifyBox = host.querySelector('bo-partner-notify')!;
    expect(notifyBox.textContent).toContain('Enviado em 10/11/2026');
    expect(notifyBox.querySelectorAll<HTMLButtonElement>('.row button')[0]!.disabled).toBeTrue();
  });

  it('avisar atletas: conta antes (dryRun), confirma com o número e envia', async () => {
    const host = await mount('fast-acai');
    const avisar = host.querySelectorAll<HTMLButtonElement>('bo-partner-notify .row button');
    expect(avisar[1]!.disabled).toBeTrue(); // "Oferta acabando" sem data de fim
    avisar[0]!.click();
    await settle();
    expect(notify).toHaveBeenCalledWith('fast-acai', 'new', true);
    expect(host.querySelector('bo-partner-notify bo-confirm-dialog')!.textContent).toContain('Vai para 12 pessoas');

    buttonByText(host, 'Enviar push').click();
    await settle();
    expect(notify).toHaveBeenCalledWith('fast-acai', 'new', false);
    expect(host.querySelector('bo-partner-notify')!.textContent).toContain('enviado para 11 de 12 pessoas');
    expect(avisar[0]!.disabled).toBeTrue();
  });

  it('avisar fica desligado com alteração não salva', async () => {
    const host = await mount('fast-acai');
    type(host, 'Selo curto', '15% OFF');
    await settle();
    const avisar = host.querySelectorAll<HTMLButtonElement>('bo-partner-notify .row button');
    expect(avisar[0]!.disabled).toBeTrue();
    expect(host.querySelector('bo-partner-notify')!.textContent).toContain('Salve as alterações');
  });

  it('id que não existe mostra "Parceiro não encontrado"', async () => {
    const host = await mount('sumiu');
    expect(host.textContent).toContain('Parceiro não encontrado');
    expect(saveButton(host).disabled).toBeTrue();
  });
});
