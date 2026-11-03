import { provideZonelessChangeDetection, signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { addDaysKey, todayKeyLocal } from '../aulas/class.model';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { ViewportService } from '../ui/viewport.service';
import { PanelPhGridComponent } from './panel-ph-grid.component';
import { PanelPhPlanEditorComponent } from './panel-ph-plan-editor.component';
import { PanelPhPlansComponent } from './panel-ph-plans.component';
import { PanelPhSubscribersComponent } from './panel-ph-subscribers.component';
import { PanelPhWaitlistComponent } from './panel-ph-waitlist.component';
import { chargeFromRaw, planFromRaw, settingsFromRaw, subscriptionFromRaw, waitlistFromRaw } from './schedule-plan.model';
import { SchedulePlansStore } from './schedule-plans.store';

/** Fumaça das 5 telas com dado de verdade no store (sem Firestore: `arenaId` nulo não liga
 *  listener nenhum). Pega erro de template que o build não pega (`@let`, `[class]`, nulos). */
describe('Planos de horário · telas', () => {
  const today = todayKeyLocal();

  function setup(): SchedulePlansStore {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: () => ({ email: 'dono@arena.com' }), signOutUser: () => Promise.resolve() } },
        {
          provide: ArenaContextService,
          useValue: {
            arenaId: () => null, arenaName: () => 'Arena Beach Club', managedArenas: () => [{ id: 'a' }], isOwner: () => true,
            staffRole: () => null, loading: () => false, notFound: () => false, hasCapability: () => true,
          },
        },
        { provide: ArenaAccessService, useValue: { isOwner: () => true, canRead: () => true, canWrite: () => true, ready: () => true } },
        { provide: ViewportService, useValue: { isCompact: signal(false), isPhone: signal(false) } },
      ],
    });
    const store = TestBed.inject(SchedulePlansStore);
    store.plans.set([
      planFromRaw('p1', {
        name: 'Fixo Noite', status: 'active', capacity: 48, monthlyPriceReais: 240, referenceHourlyReais: 70, courtIds: ['c1', 'c2'],
        courtNames: ['Quadra 1', 'Quadra 2'], windows: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: '18:00', endTime: '23:00' })),
      }),
      planFromRaw('p2', { name: 'Almoço', status: 'draft', capacity: 12, monthlyPriceReais: 280, courtIds: ['c2'], courtNames: ['Quadra 2'] }),
    ]);
    store.settings.set(settingsFromRaw(undefined));
    store.courts.set([
      { id: 'c1', name: 'Quadra 1', types: [], typeLabels: [], status: 'active', basePricePerHourReais: 70 },
      { id: 'c2', name: 'Quadra 2', types: [], typeLabels: [], status: 'active', basePricePerHourReais: 70 },
    ]);
    store.subscriptions.set([
      subscriptionFromRaw('s1', {
        holderName: 'Marina Lopes', planId: 'p1', planName: 'Fixo Noite', status: 'active', monthlyPriceReais: 240, startDate: '2026-03-01',
        members: [{ name: 'Marina Lopes', role: 'holder', shareReais: 120 }, { name: 'Thaís', role: 'member', shareReais: 120 }],
        slots: [{ weekday: 2, startTime: '19:00', endTime: '20:00', courtId: 'c1', courtName: 'Quadra 1', seriesId: 'r1' }],
      }),
      subscriptionFromRaw('s2', {
        holderName: 'Enzo Ribeiro', planId: 'p1', planName: 'Fixo Noite', status: 'active', monthlyPriceReais: 240, endsOn: addDaysKey(today, 20),
        slots: [{ weekday: 4, startTime: '19:00', endTime: '20:00', courtId: 'c2', courtName: 'Quadra 2', seriesId: 'r2' }],
      }),
    ]);
    store.openCharges.set([
      chargeFromRaw('s2_x_0', { subscriptionId: 's2', payerName: 'Enzo Ribeiro', amountReais: 240, dueDate: addDaysKey(today, -2), status: 'open' }),
      chargeFromRaw('s1_x_0', { subscriptionId: 's1', payerName: 'Marina Lopes', amountReais: 120, dueDate: addDaysKey(today, 2), status: 'open' }),
    ]);
    store.waitlist.set([
      waitlistFromRaw('w1', { planId: 'p1', planName: 'Fixo Noite', name: 'Lucas Prado', weekdays: [4], startTime: '19:00', status: 'waiting', playersCount: 4 }),
    ]);
    store.loading.set(false);
    return store;
  }

  function render<T>(component: Type<T>): string {
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  afterEach(() => TestBed.resetTestingModule());

  it('01 Planos mostra cards, números e o que precisa do gestor', () => {
    setup();
    const text = render(PanelPhPlansComponent);
    expect(text).toContain('Fixo Noite');
    expect(text).toContain('Rascunho');
    expect(text).toContain('−14% vs avulso');
    expect(text).toContain('1 assinante em atraso');
    expect(text).toContain('Vaga abrindo na Qui 19:00');
  });

  it('02 Editor abre um plano novo com a grade de janela', () => {
    setup();
    const text = render(PanelPhPlanEditorComponent);
    expect(text).toContain('Janela permitida');
    expect(text).toContain('Reposição de falta');
    expect(text).toContain('Publicar plano');
  });

  it('03 Grade lista as quadras do horário selecionado', () => {
    setup();
    const text = render(PanelPhGridComponent);
    expect(text).toContain('Limite para planos');
    expect(text).toContain('Onde sobra espaço');
    expect(text).toContain('Quadra 1');
  });

  it('04 Assinantes filtra e abre o detalhe do primeiro', () => {
    setup();
    const text = render(PanelPhSubscribersComponent);
    expect(text).toContain('Atrasados · 1');
    expect(text).toContain('Saindo · 0');
    expect(text).toContain('Rateio');
    expect(text).toContain('Trocar horário');
  });

  it('05 Lista de espera agrupa por horário e mostra a vaga que abre', () => {
    setup();
    const text = render(PanelPhWaitlistComponent);
    expect(text).toContain('Qui · 19:00');
    expect(text).toContain('Lucas Prado');
    expect(text).toContain('Vaga abre');
    expect(text).toContain('Oferecer ao 1º');
  });
});
