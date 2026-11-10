import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter, type ParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { PanelAgendaComponent } from './panel-agenda.component';

/** Arena "a arena define a quadra": a Agenda abre na visão por horário; `?visao=quadras` mantém a
 *  grade por quadra (link "Quadras" da visão por horário). */
function setup(mode: 'capacity' | 'court', query: Record<string, string> = {}) {
  const params = new BehaviorSubject<ParamMap>(convertToParamMap(query));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap: params } },
      {
        provide: ArenaContextService,
        useValue: {
          arenaId: () => null,
          loading: () => false,
          notFound: () => false,
          arenaName: () => 'Arena CFC',
          managedArenas: () => [],
          arenaDocData: () => ({ bookingAllocation: { mode, courtIds: ['c1'] } }),
        },
      },
      { provide: ArenaAccessService, useValue: { isOwner: () => true, canRead: () => true, canWrite: () => true } },
      { provide: AuthService, useValue: { user: signal({ email: 'gestor@example.com' }) } },
    ],
  });
  const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  const fixture = TestBed.createComponent(PanelAgendaComponent);
  fixture.detectChanges();
  return { fixture, navigate, params };
}

describe('Agenda numa arena que define a quadra', () => {
  it('abre direto na visão por horário', () => {
    const { navigate } = setup('capacity');
    expect(navigate).toHaveBeenCalledWith(['/painel/agenda/horarios'], { replaceUrl: true });
  });

  it('"Quadras" (?visao=quadras) fica na grade por quadra; voltar sem o parâmetro abre por horário', () => {
    const { fixture, navigate, params } = setup('capacity', { visao: 'quadras' });
    expect(navigate).not.toHaveBeenCalled();
    params.next(convertToParamMap({}));
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/painel/agenda/horarios'], { replaceUrl: true });
  });

  it('arena no modo de sempre continua na grade por quadra', () => {
    const { navigate } = setup('court');
    expect(navigate).not.toHaveBeenCalled();
  });
});
