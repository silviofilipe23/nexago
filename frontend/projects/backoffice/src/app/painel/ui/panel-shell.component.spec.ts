import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { PanelShellComponent } from './panel-shell.component';

describe('PanelShellComponent', () => {
  async function mount(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [PanelShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelShellComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const labels = (host: HTMLElement, selector: string) =>
    [...host.querySelectorAll(selector)].map((e) => e.textContent!.trim());

  it('renderiza os itens com rota como link', async () => {
    const host = await mount();
    const links = labels(host, 'a.nav-item');
    expect(links).toContain('Início');
    expect(links).toContain('Financeiro');
  });

  it('renderiza item sem rota como "Em breve" e não navegável', async () => {
    const host = await mount();
    const soon = [...host.querySelectorAll('.nav-item.disabled')].map((e) => e.textContent!.trim());
    expect(soon.some((t) => t.startsWith('Moderação'))).toBeTrue();
    expect(host.querySelector('a.nav-item[href*="moderacao"]')).toBeNull();
  });
});
