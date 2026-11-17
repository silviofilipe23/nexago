import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TournamentsRepository, type TournamentRow } from '../../torneios/data/tournaments.repository';
import { TournamentPickerComponent } from './tournament-picker.component';

describe('TournamentPickerComponent · nome dos escolhidos', () => {
  let release: (rows: TournamentRow[]) => void = () => undefined;

  async function render(ids: string[]) {
    TestBed.configureTestingModule({
      imports: [TournamentPickerComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: TournamentsRepository,
          useValue: {
            byIds: () => new Promise<TournamentRow[]>((resolve) => (release = resolve)),
            listTournaments: () => Promise.resolve({ rows: [] }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(TournamentPickerComponent);
    fixture.componentRef.setInput('ids', ids);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  const chips = (el: HTMLElement) =>
    [...el.querySelectorAll('.chip')].map((c) => ({
      text: c.firstChild?.textContent?.trim() ?? '',
      label: c.querySelector('button')?.getAttribute('aria-label'),
    }));

  it('sem o nome ainda, o chip mostra o id (texto e aria-label)', async () => {
    const f = await render(['t1']);
    expect(chips(f.nativeElement)).toEqual([{ text: 't1', label: 'Tirar t1' }]);
  });

  it('com o nome resolvido, mostra o nome; id inexistente avisa', async () => {
    const f = await render(['t1', 't2']);
    release([{ id: 't1', name: 'Goiânia Open' } as TournamentRow]);
    await f.whenStable();
    f.detectChanges();
    await f.whenStable();
    expect(chips(f.nativeElement)).toEqual([
      { text: 'Goiânia Open', label: 'Tirar Goiânia Open' },
      { text: 't2 (não encontrado)', label: 'Tirar t2 (não encontrado)' },
    ]);
  });
});
