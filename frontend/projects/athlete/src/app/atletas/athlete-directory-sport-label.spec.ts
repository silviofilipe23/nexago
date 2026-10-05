import { ARENA_SPORT_CHIP_OPTIONS } from '@nexago/arena-discovery';
import { SPORT_SHORT_LABEL } from './athlete-directory.component';

/** Todo chip de esporte oferecido no diretório tem rótulo em português — senão a lista mostra o
 *  código cru ("12 atletas · footvolley"). */
describe('diretório de atletas · rótulo curto do esporte', () => {
  it('cobre todos os chips (inclusive Futevôlei)', () => {
    for (const { chip } of ARENA_SPORT_CHIP_OPTIONS) {
      if (chip === 'all') continue;
      expect(SPORT_SHORT_LABEL[chip]).withContext(chip).toBeTruthy();
    }
    expect(SPORT_SHORT_LABEL['footvolley']).toBe('Futevôlei');
  });
});
