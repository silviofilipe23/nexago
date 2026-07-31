import {
  ChangeDetectionStrategy,
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AcceptInviteComponent } from './accept-invite.component';
import { AuthService } from './auth.service';

const INVITE_ID = 'invite-123';

/** Destino de `router.navigateByUrl('/painel')` (chamado tanto no aceite bem
 *  sucedido quanto em "Ir para o painel"). Sem uma rota real registrada pra
 *  ele, o Router rejeita com NG04002 e a promise não tratada derruba a suíte
 *  inteira — não precisa ser o painel de verdade, só existir. */
@Component({
  selector: 'ar-test-painel-stub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class PanelStubComponent {}

/** Stub de `AuthService` com espiões para os dois pares de métodos que este
 *  componente PRECISA manter separados: `signInForInvite`/`signInWithEmail` e
 *  `createStaffAccount`/`createArenaAccount`. `isAuthenticated` reflete o que
 *  o Firebase real faria — autentica de fato após login/cadastro OK. */
function authStub() {
  const isAuthenticated = signal(false);
  return {
    authReady: signal(false),
    isAuthenticated,
    signInForInvite: jasmine.createSpy('signInForInvite').and.callFake(async () => {
      isAuthenticated.set(true);
    }),
    createStaffAccount: jasmine.createSpy('createStaffAccount').and.callFake(async () => {
      isAuthenticated.set(true);
    }),
    acceptStaffInvite: jasmine.createSpy('acceptStaffInvite').and.resolveTo({ arenaId: 'arena-1' }),
    signOutUser: jasmine.createSpy('signOutUser').and.callFake(async () => {
      isAuthenticated.set(false);
    }),
    // Nunca devem ser chamados por esta tela — é exatamente isso que as
    // armadilhas do brief pedem pra evitar (ver Finding 3 da revisão).
    signInWithEmail: jasmine.createSpy('signInWithEmail'),
    createArenaAccount: jasmine.createSpy('createArenaAccount'),
  };
}

type AuthStub = ReturnType<typeof authStub>;

async function setup(auth: AuthStub): Promise<RouterTestingHarness> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([
        { path: 'convite/:inviteId', component: AcceptInviteComponent },
        { path: 'painel', component: PanelStubComponent },
      ]),
      { provide: AuthService, useValue: auth },
    ],
  });
  return RouterTestingHarness.create(`/convite/${INVITE_ID}`);
}

/** Zoneless + sem zone.js no bundle de teste: nada flush-a promises "sozinho"
 *  (nem `whenStable()`, que só rastreia tarefas registradas no Angular). Dreno
 *  a fila de microtasks manualmente antes de reafirmar `detectChanges()`. */
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

describe('AcceptInviteComponent', () => {
  it('cadastro pelo convite chama createStaffAccount e NUNCA createArenaAccount', async () => {
    const auth = authStub();
    auth.authReady.set(true);
    const harness = await setup(auth);
    await settle(harness);

    const root = harness.routeDebugElement!;
    const tabs = root.queryAll(By.css('.mode-tabs button'));
    tabs[1].nativeElement.click(); // "Criar conta"
    await settle(harness);

    setInputValue(
      root.query(By.css('input[autocomplete="name"]')).nativeElement,
      'Maria Convidada',
    );
    setInputValue(
      root.query(By.css('input[autocomplete="email"]')).nativeElement,
      'maria@example.com',
    );
    setInputValue(
      root.query(By.css('input[autocomplete="new-password"]')).nativeElement,
      'senha1234',
    );
    await settle(harness);

    root.query(By.css('form')).triggerEventHandler('ngSubmit', null);
    await settle(harness);

    expect(auth.createStaffAccount).toHaveBeenCalledWith(
      'maria@example.com',
      'senha1234',
      'Maria Convidada',
    );
    expect(auth.createArenaAccount).not.toHaveBeenCalled();
    expect(auth.acceptStaffInvite).toHaveBeenCalledWith(INVITE_ID);
  });

  it('login pelo convite chama signInForInvite e NUNCA signInWithEmail', async () => {
    const auth = authStub();
    auth.authReady.set(true);
    const harness = await setup(auth);
    await settle(harness);

    const root = harness.routeDebugElement!;
    setInputValue(
      root.query(By.css('input[autocomplete="email"]')).nativeElement,
      'convidado@example.com',
    );
    setInputValue(
      root.query(By.css('input[autocomplete="current-password"]')).nativeElement,
      'senha1234',
    );
    await settle(harness);

    root.query(By.css('form')).triggerEventHandler('ngSubmit', null);
    await settle(harness);

    expect(auth.signInForInvite).toHaveBeenCalledWith('convidado@example.com', 'senha1234');
    expect(auth.signInWithEmail).not.toHaveBeenCalled();
    expect(auth.acceptStaffInvite).toHaveBeenCalledWith(INVITE_ID);
  });

  it('aceite rejeitado deixa a tela com uma mensagem — nunca em branco ou preso num spinner', async () => {
    const auth = authStub();
    const serverError = Object.assign(
      new Error('Este convite não é mais válido ou foi enviado para outro e-mail.'),
      { code: 'functions/failed-precondition' },
    );
    auth.acceptStaffInvite.and.rejectWith(serverError);
    auth.authReady.set(true);
    auth.isAuthenticated.set(true); // já logado -> effect dispara o aceite sozinho
    const harness = await setup(auth);
    await settle(harness);

    expect(auth.acceptStaffInvite).toHaveBeenCalledWith(INVITE_ID);

    const root = harness.routeNativeElement!;
    const alert = root.querySelector('.ar-alert');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain(
      'Este convite não é mais válido ou foi enviado para outro e-mail.',
    );
    expect(root.querySelector('.ar-spinner')).toBeNull();
  });

  it('duas invocações rápidas de accept() resultam em UMA única chamada a acceptStaffInvite', async () => {
    const auth = authStub();
    auth.authReady.set(true);
    const harness = await setup(auth);
    await settle(harness);

    const root = harness.routeDebugElement!;
    setInputValue(
      root.query(By.css('input[autocomplete="email"]')).nativeElement,
      'convidado@example.com',
    );
    setInputValue(
      root.query(By.css('input[autocomplete="current-password"]')).nativeElement,
      'senha1234',
    );
    await settle(harness);

    const form = root.query(By.css('form'));
    // Duplo submit sem aguardar o primeiro terminar — simula o duplo clique
    // que o guard de fase do accept() precisa absorver.
    form.triggerEventHandler('ngSubmit', null);
    form.triggerEventHandler('ngSubmit', null);
    await settle(harness);

    expect(auth.acceptStaffInvite).toHaveBeenCalledTimes(1);
  });

  // Cobertura extra (Finding 1 da revisão): "already-exists" não pode cair no
  // `blocked` genérico — "tentar de novo"/"usar outra conta" não resolvem
  // quem já está na equipe; a saída certa é entrar no painel.
  it('convite já aceito (already-exists): oferece ir direto pro painel, não repetir/trocar de conta', async () => {
    const auth = authStub();
    const alreadyMemberError = Object.assign(
      new Error('Você já faz parte da equipe desta arena.'),
      { code: 'functions/already-exists' },
    );
    auth.acceptStaffInvite.and.rejectWith(alreadyMemberError);
    auth.authReady.set(true);
    auth.isAuthenticated.set(true);
    const harness = await setup(auth);
    await settle(harness);

    const root = harness.routeNativeElement!;
    expect(root.textContent).toContain('Você já faz parte da equipe desta arena.');
    expect(root.textContent).not.toContain('Tentar novamente');
    expect(root.textContent).not.toContain('Usar outra conta');

    const goToPanelButton = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Ir para o painel'),
    );
    expect(goToPanelButton).toBeDefined();

    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    (goToPanelButton as HTMLButtonElement).click();

    expect(navigateSpy).toHaveBeenCalledWith('/painel');
  });

  // Cobertura extra (Finding 2 da revisão): quando o aceite falha logo após
  // criar a conta NESTA tentativa, a mensagem não pode ser só o rótulo bruto
  // do servidor — precisa deixar claro que a conta foi criada com sucesso.
  it('conta criada nesta tentativa + aceite falho: mensagem explica que a conta existe e aponta o e-mail do convite', async () => {
    const auth = authStub();
    const mismatchError = Object.assign(
      new Error('Este convite não é mais válido ou foi enviado para outro e-mail.'),
      { code: 'functions/failed-precondition' },
    );
    auth.acceptStaffInvite.and.rejectWith(mismatchError);
    auth.authReady.set(true);
    const harness = await setup(auth);
    await settle(harness);

    const root = harness.routeDebugElement!;
    const tabs = root.queryAll(By.css('.mode-tabs button'));
    tabs[1].nativeElement.click(); // "Criar conta"
    await settle(harness);

    setInputValue(
      root.query(By.css('input[autocomplete="name"]')).nativeElement,
      'Maria Convidada',
    );
    setInputValue(
      root.query(By.css('input[autocomplete="email"]')).nativeElement,
      'maria@example.com',
    );
    setInputValue(
      root.query(By.css('input[autocomplete="new-password"]')).nativeElement,
      'senha1234',
    );
    await settle(harness);

    root.query(By.css('form')).triggerEventHandler('ngSubmit', null);
    await settle(harness);

    const alert = harness.routeNativeElement!.querySelector('.ar-alert');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('Sua conta foi criada com sucesso');
    expect(alert!.textContent).not.toContain(
      'Este convite não é mais válido ou foi enviado para outro e-mail.',
    );
  });
});
