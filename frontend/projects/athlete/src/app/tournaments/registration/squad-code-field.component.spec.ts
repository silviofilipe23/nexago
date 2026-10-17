import { ApplicationRef, Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SquadCodeFieldComponent } from './squad-code-field.component';

@Component({
  imports: [SquadCodeFieldComponent],
  template: `<app-squad-code-field [(code)]="code" [serverError]="serverError()" />`,
})
class HostComponent {
  readonly code = signal('');
  readonly serverError = signal<string | null>(null);
}

describe('SquadCodeFieldComponent', () => {
  async function mount() {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await settle();
    return { host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  async function settle() {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('fica recolhido até o atleta pedir', async () => {
    const { el } = await mount();
    expect(el.querySelector('input')).toBeNull();
    (el.querySelector('button') as HTMLButtonElement).click();
    await settle();
    expect(el.querySelector('input#squad-code')).not.toBeNull();
  });

  it('formato inválido avisa sem ir ao servidor', async () => {
    const { el, host } = await mount();
    (el.querySelector('button') as HTMLButtonElement).click();
    await settle();
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'jo-1';
    input.dispatchEvent(new Event('input'));
    await settle();
    (el.querySelector('button.apply') as HTMLButtonElement).click();
    await settle();
    expect(el.textContent).toContain('O código tem de 3 a 20 letras ou números');
    expect(host.code()).toBe('');
  });

  it('código aplicado que a cobrança recusou volta para o campo com a mensagem', async () => {
    const { el, host } = await mount();
    host.code.set('JOAO10');
    await settle();
    expect(el.textContent).toContain('JOAO10');

    host.serverError.set('Você não pode usar seu próprio código.');
    await settle();
    expect(host.code()).toBe('');
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('JOAO10');
    expect(el.textContent).toContain('Você não pode usar seu próprio código.');
  });
});
