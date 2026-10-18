import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../../auth/auth.service';
import { DEFAULT_PLANS, DEFAULT_RULES, DEFAULT_SPONSORS, clone, type PlanEntry } from '../data/tournament-plans';
import { TournamentPlansRepository, type SavePlanResult } from '../data/tournament-plans.repository';
import { PlanEditorComponent } from './plan-editor.component';

type SaveInput = Parameters<TournamentPlansRepository['savePlan']>[0];

function entries(): PlanEntry[] {
  return DEFAULT_PLANS.map((d) => ({
    id: d.id,
    order: d.order,
    version: 1,
    current: clone(d.plan),
    next: null,
    draft: null,
    updatedAt: null,
    updatedBy: null,
  }));
}

describe('PlanEditorComponent', () => {
  let savePlan: jasmine.Spy<(input: SaveInput) => Promise<SavePlanResult>>;

  async function mount(id = 'plano-2', roles: string[] = ['admin']): Promise<HTMLElement> {
    savePlan = jasmine.createSpy('savePlan').and.callFake((input: SaveInput) =>
      Promise.resolve({
        planId: input.planId ?? 'novo-id',
        version: input.action === 'publish' ? input.version + 1 : input.version,
        current: input.action === 'publish' && !input.effectiveFrom ? input.plan! : clone(DEFAULT_PLANS[1]!.plan),
        next: input.effectiveFrom ? { plan: input.plan!, version: input.version + 1, effectiveFrom: input.effectiveFrom } : null,
        draft: input.action === 'draft' ? input.plan! : null,
      }),
    );
    await TestBed.configureTestingModule({
      imports: [PlanEditorComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { displayName: signal('Lia Martins'), user: signal(null), roles: signal(roles), isSuperAdmin: signal(false) },
        },
        {
          provide: TournamentPlansRepository,
          useValue: {
            plans: () => Promise.resolve(entries()),
            rules: () => Promise.resolve({ value: clone(DEFAULT_RULES), version: 1 }),
            sponsors: () => Promise.resolve({ value: clone(DEFAULT_SPONSORS), version: 1 }),
            savePlan,
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlanEditorComponent);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r));
      await TestBed.inject(ApplicationRef).whenStable();
    }
  }

  async function type(host: HTMLElement, label: string, value: string) {
    const el = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    el.value = value;
    el.dispatchEvent(new Event('input'));
    await settle();
  }

  const button = (host: HTMLElement, text: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === text)!;

  it('abre o Plano 2 sem alterações e com Publicar desabilitado', async () => {
    const host = await mount();
    expect(host.querySelector('h1')!.textContent).toContain('Plano 2');
    expect(host.querySelector('.sub')!.textContent).toContain('Ativo · v1 · sem alterações');
    expect(button(host, 'Publicar alterações').disabled).toBeTrue();
  });

  it('mudar o preço recalcula a margem e publica a v2 agora', async () => {
    const host = await mount();
    await type(host, 'Preço por evento', '2600');
    expect(host.querySelector('.sub')!.textContent).toContain('1 alteração não publicada');
    // 2600 − (500 + 2×500) = 1100 → 42%
    expect(host.querySelector('.margin strong')!.textContent).toContain('42%');

    button(host, 'Publicar alterações').click();
    await settle();
    const dialog = [...host.querySelectorAll('dialog')].find((d) => d.open)!;
    expect(dialog.textContent).toContain('v1 → v2');
    expect(dialog.textContent!.replace(/\u00a0/g, ' ')).toContain('R$ 2.600');

    button(host, 'Publicar agora').click();
    await settle();
    expect(savePlan).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ planId: 'plano-2', action: 'publish', version: 1, effectiveFrom: null }),
    );
    expect(savePlan.calls.mostRecent().args[0].plan!.priceCents).toBe(2600_00);
    expect(host.querySelector('.bo-feedback')!.textContent).toContain('v2 publicada');
  });

  it('agendar manda a data escolhida', async () => {
    const host = await mount();
    await type(host, 'Preço por evento', '2600');
    button(host, 'Publicar alterações').click();
    await settle();
    button(host, 'Agendar').click();
    await settle();
    const date = host.querySelector<HTMLInputElement>('dialog[open] input[type="date"]')!;
    date.value = '2099-01-01';
    date.dispatchEvent(new Event('input'));
    await settle();
    [...host.querySelectorAll<HTMLButtonElement>('dialog[open] .actions button')].at(-1)!.click();
    await settle();
    expect(savePlan.calls.mostRecent().args[0].effectiveFrom).toBe('2099-01-01');
  });

  it('salvar rascunho não publica', async () => {
    const host = await mount();
    await type(host, 'Hora extra', '150');
    button(host, 'Salvar rascunho').click();
    await settle();
    expect(savePlan).toHaveBeenCalledOnceWith(jasmine.objectContaining({ action: 'draft', version: 1 }));
    expect(host.querySelector('.sub')!.textContent).toContain('rascunho salvo');
  });

  it('sem papel de admin fica só leitura', async () => {
    const host = await mount('plano-2', []);
    expect(button(host, 'Publicar alterações')).toBeUndefined();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Preço por evento"]')!.disabled).toBeTrue();
  });

  it('id desconhecido mostra "não encontrado"', async () => {
    const host = await mount('nao-existe');
    expect(host.textContent).toContain('Plano não encontrado');
  });
});
