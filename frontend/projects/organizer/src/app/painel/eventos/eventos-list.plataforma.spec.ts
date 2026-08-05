import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { EventosListComponent } from './eventos-list.component';

/** A aba Plataforma é o acesso do super admin aos torneios de todos os organizadores.
 *  Organizador comum não pode nem ver a aba.
 *
 *  `user()` devolve null de propósito: o construtor do componente sai cedo nesse caso,
 *  então o teste não toca no Firestore. */
function fakeAuth(isSuperAdmin: boolean): Partial<AuthService> {
  return {
    user: signal(null).asReadonly() as unknown as AuthService['user'],
    isSuperAdmin: signal(isSuperAdmin).asReadonly() as unknown as AuthService['isSuperAdmin'],
  };
}

async function tabsFor(isSuperAdmin: boolean): Promise<string[]> {
  TestBed.resetTestingModule();
  // O portal roda zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de
  // teste não carrega zone.js — sem isso o TestBed falha com NG0908.
  await TestBed.configureTestingModule({
    imports: [EventosListComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: fakeAuth(isSuperAdmin) },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(EventosListComponent);
  fixture.detectChanges();
  return Array.from(fixture.nativeElement.querySelectorAll('.og-chart-tabs button')).map((b) =>
    (b as HTMLButtonElement).textContent!.trim(),
  );
}

describe('EventosListComponent — aba Plataforma', () => {
  it('não mostra a aba para organizador comum', async () => {
    expect(await tabsFor(false)).toEqual(['todos', 'ativos', 'encerrados']);
  });

  it('mostra a aba para super admin, depois das abas próprias', async () => {
    expect(await tabsFor(true)).toEqual(['todos', 'ativos', 'encerrados', 'plataforma']);
  });

  it('abre em "todos" — a lista pesada da plataforma nunca carrega sozinha', async () => {
    await tabsFor(true);
    const fixture = TestBed.createComponent(EventosListComponent);
    fixture.detectChanges();
    const active = fixture.nativeElement.querySelector('.og-chart-tabs button.active') as HTMLButtonElement;
    expect(active.textContent!.trim()).toBe('todos');
  });
});
