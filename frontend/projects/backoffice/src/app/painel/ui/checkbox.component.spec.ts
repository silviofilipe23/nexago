import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CheckboxComponent, type CheckboxToggle } from './checkbox.component';

@Component({
  imports: [CheckboxComponent],
  template: `
    <bo-checkbox
      [checked]="checked()"
      [indeterminate]="indeterminate()"
      [disabled]="disabled()"
      [reason]="reason()"
      ariaLabel="Selecionar Bola NexaGO"
      (checkedChange)="last = $event"
    />
  `,
})
class HostComponent {
  readonly checked = signal(false);
  readonly indeterminate = signal(false);
  readonly disabled = signal(false);
  readonly reason = signal('');
  last: CheckboxToggle | null = null;
}

describe('CheckboxComponent', () => {
  async function mount() {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return {
      fixture,
      host: fixture.componentInstance,
      input: fixture.nativeElement.querySelector('input') as HTMLInputElement,
      box: fixture.nativeElement.querySelector('.box') as HTMLElement,
    };
  }

  it('nasce desmarcado, sem estado visual de marcado nem de parcial', async () => {
    const { input, box } = await mount();
    expect(input.checked).toBeFalse();
    expect(input.indeterminate).toBeFalse();
    expect(box.classList).not.toContain('on');
    expect(box.classList).not.toContain('partial');
  });

  it('marcado liga o input e o estado visual', async () => {
    const { fixture, host, input, box } = await mount();
    host.checked.set(true);
    fixture.detectChanges();
    expect(input.checked).toBeTrue();
    expect(box.classList).toContain('on');
  });

  it('parcial usa a propriedade indeterminate, que é o que o leitor de tela anuncia', async () => {
    const { fixture, host, input, box } = await mount();
    host.indeterminate.set(true);
    fixture.detectChanges();
    expect(input.indeterminate).toBeTrue();
    expect(box.classList).toContain('partial');
  });

  it('desabilitado bloqueia o input e mostra o motivo como tooltip', async () => {
    const { fixture, host, input } = await mount();
    host.disabled.set(true);
    host.reason.set('Pedido cancelado');
    fixture.detectChanges();
    expect(input.disabled).toBeTrue();
    expect(input.title).toBe('Pedido cancelado');
  });

  it('leva o aria-label para o input', async () => {
    const { input } = await mount();
    expect(input.getAttribute('aria-label')).toBe('Selecionar Bola NexaGO');
  });

  it('emite o novo estado no clique', async () => {
    const { fixture, host, input } = await mount();
    input.click();
    fixture.detectChanges();
    expect(host.last).toEqual({ checked: true, shift: false });
  });

  it('informa quando o clique veio com Shift, para a seleção por intervalo', async () => {
    const { fixture, host, input } = await mount();
    input.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    fixture.detectChanges();
    expect(host.last).toEqual({ checked: true, shift: true });
  });
});
