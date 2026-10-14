import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { SquadContextService } from '../ui/squad-context.service';
import { PanelNovoTreinoComponent } from './panel-novo-treino.component';
import { TrainingsService, type Training } from './trainings.service';

const existing = (over: Partial<Training> = {}): Training => ({
  id: 'x1',
  squadId: 's1',
  title: 'Aula A',
  date: '2099-01-10',
  startTime: '19:00',
  endTime: '20:00',
  location: '',
  materials: '',
  exercises: [],
  status: 'agendado',
  attendance: {},
  seriesId: null,
  ...over,
});

type Form = { patchValue(v: Record<string, string>): void };

function setup(trainings: Training[], routeId: string | null = null) {
  const list = signal(trainings);
  TestBed.configureTestingModule({
    imports: [PanelNovoTreinoComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: TrainingsService, useValue: { trainings: list, ready: signal(true) } },
      { provide: AuthService, useValue: { user: signal(null), displayName: signal(null) } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}), queryParamMap: convertToParamMap({}) } },
      },
    ],
  });
  TestBed.inject(SquadContextService).setSquads([{ id: 's1', name: 'Sub-15', initials: 'S' }]);
  const fixture = TestBed.createComponent(PanelNovoTreinoComponent);
  fixture.detectChanges();
  const fill = (values: Record<string, string>) => {
    (fixture.componentInstance as unknown as { form: Form }).form.patchValue(values);
    fixture.detectChanges();
  };
  return { el: fixture.nativeElement as HTMLElement, fill };
}

describe('PanelNovoTreinoComponent — avisos', () => {
  it('criar treino em data passada avisa, sem bloquear', () => {
    const { el, fill } = setup([]);
    fill({ date: '2020-01-01', startTime: '19:00' });
    expect(el.textContent).toContain('Essa data já passou.');
  });

  it('data futura não avisa', () => {
    const { el, fill } = setup([]);
    fill({ date: '2099-01-01', startTime: '19:00' });
    expect(el.textContent).not.toContain('já passou');
  });

  it('avisa conflito de horário com treino existente', () => {
    const { el, fill } = setup([existing()]);
    fill({ date: '2099-01-10', startTime: '19:30', endTime: '20:30' });
    expect(el.textContent).toContain('Conflita com «Aula A» (19:00–20:00).');
  });

  it('horário livre no mesmo dia não avisa conflito', () => {
    const { el, fill } = setup([existing()]);
    fill({ date: '2099-01-10', startTime: '20:00', endTime: '21:00' });
    expect(el.textContent).not.toContain('Conflita');
  });

  it('na edição, data passada não avisa e o próprio treino não conflita consigo', () => {
    const { el, fill } = setup([existing({ date: '2020-01-01', id: 'x1' })], 'x1');
    fill({ date: '2020-01-01', startTime: '19:00', endTime: '20:00' });
    expect(el.textContent).not.toContain('já passou');
    expect(el.textContent).not.toContain('Conflita');
  });
});
