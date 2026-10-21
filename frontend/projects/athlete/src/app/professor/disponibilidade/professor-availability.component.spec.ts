import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { PartnerInvitesService } from '../../data/partner-invites.service';
import { StaffTournamentsService } from '../../data/staff-tournaments.service';
import { ProfessorLinksService } from '../professor-links.service';
import { ProfessorAvailabilityComponent } from './professor-availability.component';
import {
  availabilityFromDoc,
  currentWeek,
  spInstant,
  type PrivateLesson,
} from './professor-availability.model';
import { ProfessorAvailabilityService } from './professor-availability.service';

/** Particular amanhã às 18h (parede de SP), para cair sempre no futuro. */
function futureLesson(overrides: Partial<PrivateLesson>): PrivateLesson {
  const week = currentWeek(Date.now());
  const today = week.findIndex((d) => d.today);
  const dayKey = new Date(Date.parse(`${week[today]!.dayKey}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const startAt = spInstant(dayKey, 18);
  return {
    id: 'l1',
    athleteName: 'Marina Costa',
    startAt,
    endAt: startAt + 3600_000,
    durationMin: 60,
    pair: false,
    note: '',
    status: 'confirmed',
    reschedule: null,
    ...overrides,
  };
}

function fakeService(doc: Record<string, unknown> | null, lessons: PrivateLesson[]) {
  return {
    loadAvailability: jasmine.createSpy('loadAvailability').and.resolveTo(availabilityFromDoc(doc)),
    loadOwnClasses: jasmine.createSpy('loadOwnClasses').and.resolveTo([]),
    loadBlocks: jasmine.createSpy('loadBlocks').and.resolveTo([]),
    watchLessons: jasmine
      .createSpy('watchLessons')
      .and.callFake((_uid: string, _from: number, onChange: (l: PrivateLesson[]) => void) => {
        onChange(lessons);
        return () => undefined;
      }),
    publish: jasmine.createSpy('publish').and.resolveTo(undefined),
    respondLesson: jasmine.createSpy('respondLesson').and.resolveTo(undefined),
    cancelLesson: jasmine.createSpy('cancelLesson').and.resolveTo(undefined),
    respondReschedule: jasmine.createSpy('respondReschedule').and.resolveTo(undefined),
  };
}

describe('Disponibilidade do professor (tela)', () => {
  let apiKey: string | undefined;
  let service: ReturnType<typeof fakeService>;

  async function open(doc: Record<string, unknown> | null, lessons: PrivateLesson[] = []): Promise<HTMLElement> {
    service = fakeService(doc, lessons);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'professor/disponibilidade', component: ProfessorAvailabilityComponent }]),
        { provide: AuthService, useValue: { user: signal({ uid: 'prof', displayName: 'Carla' }), devEmail: signal(null) } },
        {
          provide: ProfessorLinksService,
          useValue: { links: signal([]), loaded: signal(true), loadError: signal(false), openInviteCount: signal(0) },
        },
        { provide: PartnerInvitesService, useValue: { pending: signal([]), pendingCount: signal(0), markAnswered: () => undefined } },
        { provide: StaffTournamentsService, useValue: { count: signal(0) } },
      ],
    });
    TestBed.overrideComponent(ProfessorAvailabilityComponent, {
      set: { providers: [{ provide: ProfessorAvailabilityService, useValue: service }] },
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/professor/disponibilidade');
    await tick();
    await harness.fixture.whenStable();
    return harness.routeNativeElement as HTMLElement;
  }

  const tick = () => new Promise((resolve) => setTimeout(resolve));

  function buttons(root: ParentNode, label: string): HTMLButtonElement[] {
    return [...root.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent?.trim() === label);
  }

  function cell(host: HTMLElement, row: number, col: number): HTMLButtonElement {
    // 7 células por linha, horas de 6h em diante.
    return host.querySelectorAll<HTMLButtonElement>('.av-cell')[row * 7 + col]!;
  }

  function pointer(el: Element, type: string, init: PointerEventInit = {}) {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', button: 0, ...init }));
  }

  beforeEach(() => {
    apiKey = environment.firebase.apiKey;
    (environment.firebase as { apiKey?: string }).apiKey = '';
  });

  afterEach(() => {
    (environment.firebase as { apiKey?: string }).apiKey = apiKey;
    TestBed.resetTestingModule();
  });

  it('sem doc: grade fechada, padrões nas regras e "Não publicado"', async () => {
    const host = await open(null);
    expect(host.querySelectorAll('.av-cell').length).toBe(16 * 7);
    expect(host.querySelectorAll('.av-cell--open').length).toBe(0);
    expect(host.querySelector('.av-state')?.textContent).toContain('Não publicado');
    const selects = [...host.querySelectorAll('select')].map((s) => s.value);
    expect(selects).toEqual(['60', '4', '12']);
  });

  it('arrastar pinta no modo da primeira célula e publicar manda o payload inteiro', async () => {
    const host = await open({ weekly: { '1': [] }, published: true });
    expect(host.querySelector('.av-state')?.textContent).toContain('Publicado');

    // Seg 6h → 8h (coluna 0, linhas 0..2).
    pointer(cell(host, 0, 0), 'pointerdown');
    pointer(cell(host, 1, 0), 'pointerenter');
    pointer(cell(host, 2, 0), 'pointerenter');
    window.dispatchEvent(new PointerEvent('pointerup'));
    pointer(cell(host, 3, 0), 'pointerenter');
    await tick();
    expect(host.querySelectorAll('.av-cell--open').length).toBe(3);
    expect(host.querySelector('.av-state')?.textContent).toContain('Alterações não publicadas');

    buttons(host, 'Publicar horários')[0]!.click();
    await tick();
    await tick();
    const payload = service.publish.calls.mostRecent().args[0];
    expect(payload.weekly['1']).toEqual([6, 7, 8]);
    expect(host.querySelector('app-nx-banner')?.textContent).toContain('Horários publicados');
    expect(host.querySelector('.av-state')?.textContent).toContain('Publicado');
  });

  it('pedido pendente: Aceitar chama a callable; confirmada pede confirmação para cancelar', async () => {
    const host = await open({ published: true }, [
      futureLesson({ id: 'p1', status: 'pending', athleteName: 'Ana Souza', startAt: futureLesson({}).startAt + 3600_000 }),
      futureLesson({ id: 'c1' }),
    ]);
    expect(host.querySelector('.av-lessons')?.textContent).toContain('Ana Souza');
    buttons(host, 'Aceitar')[0]!.click();
    await tick();
    expect(service.respondLesson).toHaveBeenCalledWith('p1', true);

    buttons(host, 'Cancelar')[0]!.click();
    await tick();
    const dialog = document.querySelector('app-professor-confirm-dialog') as HTMLElement;
    expect(dialog.textContent).toContain('Cancelar a particular com Marina Costa?');
    expect(service.cancelLesson).not.toHaveBeenCalled();
    buttons(dialog, 'Cancelar particular')[0]!.click();
    await tick();
    expect(service.cancelLesson).toHaveBeenCalledWith('c1');
  });

  it('remarcação pedida pelo aluno aparece com Aceitar/Recusar', async () => {
    const base = futureLesson({});
    const host = await open({ published: true }, [
      futureLesson({
        id: 'r1',
        reschedule: { requestedBy: 'aluno', startAt: base.startAt + 7200_000, endAt: base.startAt + 10800_000, status: 'pending' },
      }),
    ]);
    expect(host.textContent).toContain('Pedidos de remarcação');
    const section = host.querySelector('.av-lessons') as HTMLElement;
    buttons(section, 'Recusar')[0]!.click();
    await tick();
    expect(service.respondReschedule).toHaveBeenCalledWith('r1', false);
  });
});
