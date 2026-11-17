import { provideZonelessChangeDetection, signal, type Provider, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { addDaysKey, todayKeyLocal } from '../aulas/class.model';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { PersonPhotoService } from '../ui/person-photo.service';
import { ViewportService } from '../ui/viewport.service';
import type { AthleteProfileSummary } from '../bookings/bookings-repository';
import { ATHLETE_PROFILE_RESOLVER } from '../recurring/recurring-athlete-profiles';
import { PanelPhGridComponent } from './panel-ph-grid.component';
import { PanelPhPlanEditorComponent } from './panel-ph-plan-editor.component';
import { PanelPhPlansComponent } from './panel-ph-plans.component';
import { PanelPhSubscribersComponent } from './panel-ph-subscribers.component';
import { PanelPhWaitlistComponent } from './panel-ph-waitlist.component';
import { PhRulesModalComponent } from './ph-rules-modal.component';
import { PhSubscriberDetailComponent } from './ph-subscriber-detail.component';
import { chargeFromRaw, planFromRaw, settingsFromRaw, subscriptionFromRaw, waitlistFromRaw } from './schedule-plan.model';
import { SchedulePlansStore } from './schedule-plans.store';

/** Fumaça das 5 telas com dado de verdade no store (sem Firestore: `arenaId` nulo não liga
 *  listener nenhum). Pega erro de template que o build não pega (`@let`, `[class]`, nulos). */
describe('Planos de horário · telas', () => {
  const today = todayKeyLocal();

  /** Doc da arena visto pelo contexto (`bookingAllocation` liga o "arena define a quadra"). */
  let arenaDoc: Record<string, unknown> | null = null;

  function setup(extraProviders: Provider[] = []): SchedulePlansStore {
    TestBed.configureTestingModule({
      providers: [
        ...extraProviders,
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: () => ({ email: 'dono@arena.com' }), signOutUser: () => Promise.resolve() } },
        {
          provide: ArenaContextService,
          useValue: {
            arenaId: () => null, arenaName: () => 'Arena Beach Club', managedArenas: () => [{ id: 'a' }], isOwner: () => true,
            staffRole: () => null, loading: () => false, notFound: () => false, hasCapability: () => true,
            arenaDocData: () => arenaDoc,
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

  afterEach(() => {
    arenaDoc = null;
    TestBed.resetTestingModule();
  });

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
    // Plano novo nasce de horário livre: sem reposição/feriado (não há horário marcado).
    expect(text).toContain('Como o assinante joga');
    expect(text).toContain('Reserva quando quiser pelo app');
    expect(text).toContain('7x');
    expect(text).not.toContain('Reposição de falta');
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

  it('06 Regras gerais têm a chave da cobrança online com a taxa', () => {
    setup();
    const fixture = TestBed.createComponent(PhRulesModalComponent);
    fixture.componentRef.setInput('settings', settingsFromRaw({ onlineBillingEnabled: true }));
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Cobrança online (Pix ou cartão)');
    expect(text).toContain('6% no Pro, 5% no Elite, mínimo R$ 1,50');
  });

  it('07 Editor diz como cada forma é cobrada conforme a regra', () => {
    const store = setup();
    store.settings.set(settingsFromRaw({ onlineBillingEnabled: true }));
    const text = render(PanelPhPlanEditorComponent);
    expect(text).not.toContain('chega em breve');
    expect(text).toContain('Pix e Cartão: Pix ou cartão por link (online) · Na arena: baixa manual');
  });

  it('10 Arena que define a quadra: editor sem escolha de quadra; anual à vista por ano', () => {
    arenaDoc = { bookingAllocation: { mode: 'capacity', courtIds: ['c1', 'c2'] } };
    setup();
    const fixture = TestBed.createComponent(PanelPhPlanEditorComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="ph-plan-arena-defines-court"]')?.textContent).toContain('as 2 quadras da distribuição');
    expect([...el.querySelectorAll('.sm-chip')].some((b) => b.textContent?.trim() === 'Quadra 1')).toBeFalse();
    expect(el.textContent).toContain('12 meses · à vista');
    expect(el.textContent).toContain('/ano');
  });

  it('11 Mensalidade do anual à vista mostra os meses cobertos', () => {
    const store = setup();
    const fixture = TestBed.createComponent(PhSubscriberDetailComponent);
    fixture.componentRef.setInput('sub', store.subscriptions()[0]!);
    fixture.componentRef.setInput('state', { kind: 'ok', label: 'Em dia', tone: 'green', overdueDays: 0 });
    fixture.detectChanges();
    (fixture.componentInstance as unknown as { charges: { set(v: unknown): void } }).charges.set([
      chargeFromRaw('c1', {
        subscriptionId: 's1', payerName: 'Marina Lopes', amountReais: 2880, period: '2026-11', coversThrough: '2027-10',
        months: 12, kind: 'first', dueDate: addDaysKey(today, 3), status: 'open',
      }),
    ]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toMatch(/Anual à vista · .+ a .+2027/);
  });

  it('08 Mensalidade online mostra o selo, copia o link e avisa na baixa manual', () => {
    const store = setup();
    const fixture = TestBed.createComponent(PhSubscriberDetailComponent);
    fixture.componentRef.setInput('sub', store.subscriptions()[0]!);
    fixture.componentRef.setInput('state', { kind: 'ok', label: 'Em dia', tone: 'green', overdueDays: 0 });
    fixture.detectChanges();
    const period = today.slice(0, 7);
    (fixture.componentInstance as unknown as { charges: { set(v: unknown): void } }).charges.set([
      chargeFromRaw('c1', {
        subscriptionId: 's1', payerName: 'Marina Lopes', amountReais: 120, period, dueDate: addDaysKey(today, 3), status: 'open',
        billingMode: 'asaas', asaas: { groupId: 'g1', state: 'open', invoiceUrl: 'https://asaas.com/i/1' },
      }),
      chargeFromRaw('c2', {
        subscriptionId: 's1', payerIndex: 1, payerName: 'Thaís', amountReais: 120, period, dueDate: addDaysKey(today, 3), status: 'paid',
        billingMode: 'asaas', paidVia: 'asaas', onlineBillingType: 'CREDIT_CARD',
      }),
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Link enviado');
    expect(el.textContent).toContain('Copiar link');
    expect(el.textContent).toContain('Pago online · Cartão');
    expect(el.textContent).not.toContain('Débito automático ligado');
    const pay = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Registrar pagamento'))!;
    pay.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('cancela o link enviado ao atleta');
  });

  it('09 Débito automático: selo ao lado do pagador e aviso na baixa manual', () => {
    const store = setup();
    const fixture = TestBed.createComponent(PhSubscriberDetailComponent);
    fixture.componentRef.setInput('sub', { ...store.subscriptions()[0]!, autopayPayers: ['u1'] });
    fixture.componentRef.setInput('state', { kind: 'ok', label: 'Em dia', tone: 'green', overdueDays: 0 });
    fixture.detectChanges();
    const period = today.slice(0, 7);
    (fixture.componentInstance as unknown as { charges: { set(v: unknown): void } }).charges.set([
      chargeFromRaw('c1', {
        subscriptionId: 's1', payerName: 'Marina Lopes', payerAthleteId: 'u1', amountReais: 120, period, dueDate: addDaysKey(today, 3),
        status: 'open', billingMode: 'asaas', autopay: { state: 'scheduled', scheduledFor: addDaysKey(today, 3) },
      }),
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Débito automático ligado');
    expect(el.textContent).toContain('Débito automático · agendado');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Registrar pagamento'))!.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('O débito automático desta mensalidade será cancelado.');
  });

  describe('Assinantes · avatar do titular', () => {
    const PROFILES: Record<string, AthleteProfileSummary> = {
      'u-ana': { name: 'Ana', photoUrl: 'https://foto/ana-perfil.jpg' },
    };
    /** Perfil em `public_profiles` sem Firestore: Ana resolve, Bruno falha (cai na foto gravada). */
    const resolver = async (id: string): Promise<AthleteProfileSummary> => {
      const profile = PROFILES[id];
      if (!profile) throw new Error('offline');
      return profile;
    };

    function setupHolders(): SchedulePlansStore {
      const store = setup([{ provide: ATHLETE_PROFILE_RESOLVER, useValue: resolver }]);
      const base = { planId: 'p1', planName: 'Fixo Noite', status: 'active', monthlyPriceReais: 240, startDate: '2026-03-01' };
      store.subscriptions.set([
        subscriptionFromRaw('a', { ...base, holderName: 'Ana Souza', holderAthleteId: 'u-ana', holderPhotoUrl: 'https://foto/ana-antiga.jpg' }),
        subscriptionFromRaw('b', { ...base, holderName: 'Bruno Lima', holderAthleteId: 'u-bruno', holderPhotoUrl: 'https://foto/bruno-gravada.jpg' }),
        subscriptionFromRaw('c', { ...base, holderName: 'Carla Dias' }),
      ]);
      store.openCharges.set([]);
      return store;
    }

    async function renderSubscribers() {
      const fixture = TestBed.createComponent(PanelPhSubscribersComponent);
      fixture.detectChanges();
      // A leitura do perfil é uma promessa fora do Angular: espera ela assentar antes de olhar.
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const rows = [...el.querySelectorAll<HTMLElement>('.tr:not(.th)')];
      const detailName = () => el.querySelector('ar-ph-subscriber-detail .name')?.textContent?.trim();
      return { fixture, el, rows, detailName };
    }

    function avatarPhoto(scope: Element): string | null {
      return scope.querySelector('ar-avatar img')?.getAttribute('src') ?? null;
    }

    it('12 foto do perfil do atleta vinculado, foto gravada se o perfil falha, iniciais no avulso', async () => {
      setupHolders();
      const { el, rows } = await renderSubscribers();

      expect(avatarPhoto(rows[0]!)).toBe('https://foto/ana-perfil.jpg');
      expect(avatarPhoto(rows[1]!)).toBe('https://foto/bruno-gravada.jpg');
      expect(avatarPhoto(rows[2]!)).toBeNull();
      expect(rows[2]!.querySelector('ar-avatar')!.textContent!.trim()).toBe('CD');
      // O detalhe (Ana, a primeira) usa a mesma foto do perfil.
      expect(avatarPhoto(el.querySelector('ar-ph-subscriber-detail .head')!)).toBe('https://foto/ana-perfil.jpg');
    });

    it('13 clique no avatar abre a foto ampliada sem trocar o assinante; a linha e o nome selecionam', async () => {
      setupHolders();
      const photos = TestBed.inject(PersonPhotoService);
      const open = spyOn(photos, 'open');
      const { fixture, rows, detailName } = await renderSubscribers();
      expect(detailName()).toBe('Ana Souza');

      // Avatar fora de qualquer <button>: zoomable de verdade.
      const bruno = rows[1]!.querySelector<HTMLElement>('ar-avatar')!;
      expect(bruno.closest('button')).toBeNull();
      bruno.click();
      fixture.detectChanges();
      expect(open).toHaveBeenCalledTimes(1);
      expect(open.calls.mostRecent().args[0].photoUrl).toBe('https://foto/bruno-gravada.jpg');
      expect(detailName()).toBe('Ana Souza');

      rows[1]!.querySelector<HTMLElement>('.mute')!.click();
      fixture.detectChanges();
      expect(detailName()).toBe('Bruno Lima');

      rows[2]!.querySelector<HTMLButtonElement>('button.who-name')!.click();
      fixture.detectChanges();
      expect(detailName()).toBe('Carla Dias');
      expect(open).toHaveBeenCalledTimes(1);
    });
  });
});
