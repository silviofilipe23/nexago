import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { DEFAULT_SQUAD_RULES, cloneRules, type SquadRules } from './data/squad-rules';
import { SquadRulesRepository } from './data/squad-rules.repository';
import { PanelNiveisRegrasComponent } from './panel-niveis-regras.component';

type SaveFn = (rules: SquadRules, version: number, restoredFrom: number | null) => Promise<unknown>;

describe('PanelNiveisRegrasComponent', () => {
  let save: jasmine.Spy<SaveFn>;
  let component: PanelNiveisRegrasComponent;

  async function mount(roles: string[] = ['admin']): Promise<HTMLElement> {
    save = jasmine
      .createSpy<SaveFn>('save')
      .and.callFake((rules, version) => Promise.resolve({ rules, version: version + 1, changes: [] }));
    await TestBed.configureTestingModule({
      imports: [PanelNiveisRegrasComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { displayName: signal('Lia Martins'), user: signal(null), roles: signal(roles), isSuperAdmin: signal(false) },
        },
        {
          provide: SquadRulesRepository,
          useValue: {
            load: () => Promise.resolve({ rules: cloneRules(DEFAULT_SQUAD_RULES), version: 1 }),
            versions: () => Promise.resolve([]),
            kitSkus: () => Promise.resolve([]),
            save,
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelNiveisRegrasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }

  async function type(host: HTMLElement, label: string, value: string) {
    const el = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    el.value = value;
    el.dispatchEvent(new Event('input'));
    await settle();
  }

  const headerSave = (host: HTMLElement) =>
    [...host.querySelectorAll<HTMLButtonElement>('.head button')].find((b) => b.textContent!.includes('Salvar'));
  const barSave = (host: HTMLElement) =>
    [...host.querySelectorAll<HTMLButtonElement>('.unsaved button')].find((b) => b.textContent!.includes('Salvar'))!;
  const openDialogs = (host: HTMLElement) => [...host.querySelectorAll('dialog')].filter((d) => d.open);

  it('abre na v1.0 do piloto, com Salvar desabilitado e sem barra de alterações', async () => {
    const host = await mount();
    expect(host.querySelector('.ver')!.textContent).toContain('v1.0 · vale para o piloto');
    expect(headerSave(host)!.disabled).toBeTrue();
    expect(host.querySelector('.unsaved')).toBeNull();
    expect(host.querySelectorAll('bo-tier-pill').length).toBeGreaterThanOrEqual(4);
  });

  it('peso fora de 100 deixa o total vermelho e trava o Salvar', async () => {
    const host = await mount();
    await type(host, 'Peso de Alcance', '15');
    expect(host.querySelector('.unsaved')!.textContent).toContain('Você tem alterações não salvas');
    expect(host.querySelector('.total')!.textContent!.trim()).toBe('Total 105 — ajuste para 100');
    expect(barSave(host).disabled).toBeTrue();
  });

  it('mudança interna salva direto, sem confirmação, e mostra o toast da nova versão', async () => {
    const host = await mount();
    await type(host, 'Janela de atribuição do link, em dias', '45');
    barSave(host).click();
    await settle();

    expect(save).toHaveBeenCalledTimes(1);
    const [rules, version, restoredFrom] = save.calls.mostRecent().args;
    expect(rules.attribution.windowDays).toBe(45);
    expect(version).toBe(1);
    expect(restoredFrom).toBeNull();
    expect(host.querySelector('.toast')!.textContent).toContain('Regras salvas · v2.0');
    expect(host.querySelector('.ver')!.textContent).toContain('v2.0');
    expect(host.querySelector('.unsaved')).toBeNull();
  });

  it('mudança no pacote pede confirmação de que vale para novos contratos', async () => {
    const host = await mount();
    await type(host, 'Custo do kit do Athlete', '70');
    barSave(host).click();
    await settle();

    expect(save).not.toHaveBeenCalled();
    const dialog = openDialogs(host)[0]!;
    expect(dialog.textContent).toContain('Salvar como v2.0?');
    expect(dialog.textContent).toContain('Os contratos já assinados seguem na v1.0.');

    [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Salvar v2.0'))!.click();
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.calls.mostRecent().args[0].tiers.ath.kitCostCents).toBe(70_00);
  });

  it('erro de margem marca o campo, não salva e avisa na barra', async () => {
    const host = await mount();
    await type(host, 'Comissão do Captain', '18');
    expect(host.querySelector('bo-tier-packages-card')!.textContent).toContain(
      'Comissão + desconto passam a margem de 25% por inscrição',
    );
    expect(host.querySelector('input[aria-label="Comissão do Captain"]')!.getAttribute('aria-invalid')).toBe('true');

    barSave(host).click();
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(host.querySelector('.unsaved')!.textContent).toContain('corrija o campo marcado');
  });

  it('a faixa de comissão do Pro aceita "10–15" e mantém o texto enquanto digita', async () => {
    const host = await mount();
    await type(host, 'Comissão do Pro Ambassador', '11–');
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Comissão do Pro Ambassador"]')!;
    expect(input.value).toBe('11–');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    // Piso 10 + desconto 15 = 25: cabe na margem (11–14 passaria).
    await type(host, 'Comissão do Pro Ambassador', '10-14');
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('Descartar volta para a versão vigente', async () => {
    const host = await mount();
    await type(host, 'Peso de Alcance', '15');
    [...host.querySelectorAll<HTMLButtonElement>('.unsaved button')].find((b) => b.textContent!.includes('Descartar'))!.click();
    await settle();
    expect(host.querySelector('.unsaved')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Peso de Alcance"]')!.value).toBe('10');
  });

  it('sair com rascunho sujo pergunta antes', async () => {
    const host = await mount();
    expect(component.canLeave()).toBeTrue();
    await type(host, 'Peso de Alcance', '15');
    const leaving = component.canLeave() as Promise<boolean>;
    await settle();
    const dialog = openDialogs(host)[0]!;
    expect(dialog.textContent).toContain('Sair sem salvar?');
    [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Sair sem salvar'))!.click();
    expect(await leaving).toBeTrue();
  });

  it('as duas regras do programa ficam travadas', async () => {
    const host = await mount();
    const locked = ['Comissão só após pagamento confirmado', 'Cancelar comissão em reembolso ou cancelamento'];
    for (const label of locked) {
      const toggle = host.querySelector<HTMLButtonElement>(`button[role="switch"][aria-label="${label}"]`)!;
      expect(toggle.disabled).withContext(label).toBeTrue();
      expect(toggle.getAttribute('aria-checked')).toBe('true');
    }
  });

  it('sem papel de Admin/Growth a tela fica em modo leitura', async () => {
    const host = await mount([]);
    expect(headerSave(host)).toBeUndefined();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Peso de Alcance"]')!.disabled).toBeTrue();
    expect(component.canLeave()).toBeTrue();
  });
});
