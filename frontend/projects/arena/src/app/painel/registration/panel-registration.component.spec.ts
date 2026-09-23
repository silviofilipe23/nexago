import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { ArenaRegistrationGateway } from './arena-registration.gateway';
import { PanelRegistrationComponent } from './panel-registration.component';

type Fixture = ComponentFixture<PanelRegistrationComponent>;

function gatewayStub() {
  return {
    loadCompany: jasmine.createSpy('loadCompany').and.resolveTo({
      cpfCnpj: '11222333000181',
      razaoSocial: 'Arena Parceira Ltda',
      nomeFantasia: '',
      inscricaoMunicipal: '',
    }),
    lookupCep: jasmine.createSpy('lookupCep').and.resolveTo({
      cep: '88010000',
      logradouro: 'Rua Felipe Schmidt',
      bairro: 'Centro',
      city: 'Florianópolis',
      state: 'SC',
    }),
    geocode: jasmine.createSpy('geocode').and.resolveTo({ latitude: -27.5954, longitude: -48.548 }),
    saveCompany: jasmine.createSpy('saveCompany').and.resolveTo(undefined),
    saveAddress: jasmine.createSpy('saveAddress').and.resolveTo(undefined),
  };
}

function contextStub(arenaDoc: Record<string, unknown> = {}) {
  return {
    arenaId: () => 'arena-parceira',
    loading: () => false,
    notFound: () => false,
    arenaName: () => 'Arena Parceira',
    arenaDocData: () => arenaDoc,
    managedArenas: () => [],
  };
}

async function setup(options: {
  gateway?: ReturnType<typeof gatewayStub>;
  isOwner?: boolean;
  arenaDoc?: Record<string, unknown>;
} = {}): Promise<{ fixture: Fixture; gateway: ReturnType<typeof gatewayStub> }> {
  const gateway = options.gateway ?? gatewayStub();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ArenaContextService, useValue: contextStub(options.arenaDoc) },
      { provide: ArenaAccessService, useValue: { isOwner: signal(options.isOwner ?? true), canWrite: () => true, canRead: () => true } },
      { provide: AuthService, useValue: { user: signal({ email: 'dono@example.com' }) } },
      { provide: ArenaRegistrationGateway, useValue: gateway },
    ],
  });
  const fixture = TestBed.createComponent(PanelRegistrationComponent);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, gateway };
}

/** Zoneless: nada flush-a promise sozinho. */
async function settle(fixture: Fixture): Promise<void> {
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
  fixture.detectChanges();
}

function field(fixture: Fixture, name: string): HTMLInputElement {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input).withContext(`campo ${name} precisa existir na tela`).not.toBeNull();
  return input!;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function saveButton(fixture: Fixture): HTMLButtonElement {
  const host = fixture.nativeElement as HTMLElement;
  const button = Array.from(host.querySelectorAll('button')).find((b) => /Salvar/.test(b.textContent ?? ''));
  expect(button).withContext('a tela precisa de um botão de salvar').toBeDefined();
  return button as HTMLButtonElement;
}

async function fillValidAddress(fixture: Fixture): Promise<void> {
  type(field(fixture, 'cep'), '88010-000');
  await settle(fixture);
  type(field(fixture, 'numero'), '120');
  await settle(fixture);
}

describe('PanelRegistrationComponent', () => {
  it('carrega o cadastro da arena ao abrir', async () => {
    const { fixture, gateway } = await setup();

    expect(gateway.loadCompany).toHaveBeenCalledWith('arena-parceira');
    expect(field(fixture, 'razaoSocial').value).toBe('Arena Parceira Ltda');
  });

  it('CEP completo preenche rua, bairro, cidade e UF', async () => {
    const { fixture, gateway } = await setup();

    type(field(fixture, 'cep'), '88010-000');
    await settle(fixture);

    expect(gateway.lookupCep).toHaveBeenCalledWith('88010-000');
    expect(field(fixture, 'logradouro').value).toBe('Rua Felipe Schmidt');
    expect(field(fixture, 'bairro').value).toBe('Centro');
    expect(field(fixture, 'city').value).toBe('Florianópolis');
    expect(field(fixture, 'state').value).toBe('SC');
  });

  it('CEP incompleto não consulta nada', async () => {
    const { fixture, gateway } = await setup();

    type(field(fixture, 'cep'), '8801');
    await settle(fixture);

    expect(gateway.lookupCep).not.toHaveBeenCalled();
  });

  it('salvar grava empresa e endereço com a coordenada do geocoding', async () => {
    const { fixture, gateway } = await setup();
    await fillValidAddress(fixture);

    saveButton(fixture).click();
    await settle(fixture);

    expect(gateway.geocode).toHaveBeenCalled();
    // Documento vai formatado: quem normaliza para gravar é `buildArenaCompanyUpdate`.
    expect(gateway.saveCompany).toHaveBeenCalledWith('arena-parceira', {
      cpfCnpj: '11.222.333/0001-81',
      razaoSocial: 'Arena Parceira Ltda',
      nomeFantasia: '',
      inscricaoMunicipal: '',
    });
    expect(gateway.saveAddress).toHaveBeenCalledWith(
      'arena-parceira',
      { cep: '88010-000', logradouro: 'Rua Felipe Schmidt', numero: '120', complemento: '', bairro: 'Centro' },
      'Florianópolis',
      'SC',
      { latitude: -27.5954, longitude: -48.548 },
    );
  });

  it('geocoding sem resultado não impede o cadastro', async () => {
    const gateway = gatewayStub();
    gateway.geocode.and.resolveTo(null);
    const { fixture } = await setup({ gateway });
    await fillValidAddress(fixture);

    saveButton(fixture).click();
    await settle(fixture);

    expect(gateway.saveAddress).toHaveBeenCalled();
    expect(gateway.saveAddress.calls.mostRecent().args[4]).toBeNull();
  });

  it('endereço incompleto não grava nada e explica o que falta', async () => {
    const { fixture, gateway } = await setup();
    type(field(fixture, 'cep'), '88010-000');
    await settle(fixture);

    saveButton(fixture).click();
    await settle(fixture);

    expect(gateway.saveAddress).not.toHaveBeenCalled();
    expect(gateway.saveCompany).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Informe o número.');
  });

  it('staff nem tenta ler o cadastro da empresa: a rule nega e viraria erro na tela', async () => {
    const { gateway } = await setup({ isOwner: false });

    expect(gateway.loadCompany).not.toHaveBeenCalled();
  });

  it('quem não é dono não edita os dados da empresa, mas edita o endereço', async () => {
    const { fixture } = await setup({ isOwner: false });

    expect(field(fixture, 'razaoSocial').disabled).toBe(true);
    expect(field(fixture, 'cpfCnpj').disabled).toBe(true);
    expect(field(fixture, 'logradouro').disabled).toBe(false);
  });

  it('quem não é dono salva só o endereço', async () => {
    const { fixture, gateway } = await setup({ isOwner: false });
    await fillValidAddress(fixture);

    saveButton(fixture).click();
    await settle(fixture);

    expect(gateway.saveAddress).toHaveBeenCalled();
    expect(gateway.saveCompany).not.toHaveBeenCalled();
  });

  it('arena antiga mostra o endereço em texto livre como referência', async () => {
    const { fixture } = await setup({
      arenaDoc: { address: 'Rua das Gaivotas, 120 - Ingleses', city: 'Florianópolis', state: 'SC' },
    });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Rua das Gaivotas, 120 - Ingleses');
  });
});
