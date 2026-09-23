import {
  ChangeDetectionStrategy,
  Component,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SignupComponent } from './signup.component';
import { AuthService } from './auth.service';

/** Destino de `router.navigateByUrl('/painel')` após o cadastro. Sem uma rota
 *  registrada o Router rejeita com NG04002 e a promise não tratada derruba a
 *  suíte — não precisa ser o painel de verdade, só existir. */
@Component({
  selector: 'ar-test-painel-stub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class PanelStubComponent {}

function authStub() {
  return {
    createArenaAccount: jasmine.createSpy('createArenaAccount').and.resolveTo(undefined),
  };
}

async function setup(auth: ReturnType<typeof authStub>): Promise<RouterTestingHarness> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([
        { path: 'cadastro', component: SignupComponent },
        { path: 'painel', component: PanelStubComponent },
      ]),
      { provide: AuthService, useValue: auth },
    ],
  });
  return RouterTestingHarness.create('/cadastro');
}

/** Zoneless e sem zone.js: nada flush-a promises sozinho. */
async function settle(harness: RouterTestingHarness): Promise<void> {
  harness.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
  harness.detectChanges();
}

function setInputValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SignupComponent', () => {
  it('leva nome, cidade/UF e WhatsApp do formulário pro createArenaAccount', async () => {
    const auth = authStub();
    const harness = await setup(auth);
    await settle(harness);

    const root = harness.routeDebugElement!;
    const byPlaceholder = (placeholder: string): HTMLInputElement =>
      root.query(By.css(`input[placeholder="${placeholder}"]`)).nativeElement;

    setInputValue(byPlaceholder('Arena CFC'), 'Arena CFC');
    setInputValue(byPlaceholder('00.000.000/0000-00'), '12.345.678/0001-99');
    setInputValue(byPlaceholder('Florianópolis, SC'), 'Goiânia, GO');
    setInputValue(byPlaceholder('(48) 99999-0000'), '(62) 98888-0000');
    setInputValue(byPlaceholder('contato@suaarena.com.br'), 'contato@arenacfc.com.br');
    setInputValue(byPlaceholder('••••••••'), 'senha1234');
    await settle(harness);

    root.query(By.css('form')).triggerEventHandler('ngSubmit', null);
    await settle(harness);

    expect(auth.createArenaAccount).toHaveBeenCalledWith(
      'contato@arenacfc.com.br',
      'senha1234',
      { name: 'Arena CFC', cityState: 'Goiânia, GO', whatsapp: '(62) 98888-0000' },
    );
  });

  it('formulário inválido não cria conta nenhuma', async () => {
    const auth = authStub();
    const harness = await setup(auth);
    await settle(harness);

    const root = harness.routeDebugElement!;
    setInputValue(
      root.query(By.css('input[placeholder="Arena CFC"]')).nativeElement,
      'Arena CFC',
    );
    await settle(harness);

    root.query(By.css('form')).triggerEventHandler('ngSubmit', null);
    await settle(harness);

    expect(auth.createArenaAccount).not.toHaveBeenCalled();
  });
});
