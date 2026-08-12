import { nowStateOf } from './focus-now.component';

/**
 * `nowStateOf` é a precedência do bloco principal do Agora, extraída como função pura (sem
 * `TestBed`) justamente para isolar o ponto mais frágil da seção: `callMatchToCourt` grava
 * `queueStatus: 'on_court'` E `status: 'in progress'` na MESMA escrita, então uma partida
 * "chamada" já nasce com `status` de "em quadra" — sem a ordem certa o alerta vermelho ou nunca
 * some (se "chamado" nunca perder pra "ao vivo" depois do reconhecimento) ou nunca aparece (se
 * "ao vivo" for checado antes de "chamado").
 */
describe('nowStateOf', () => {
  it('sem próxima partida, é "idle"', () => {
    expect(nowStateOf(null, null)).toBe('idle');
  });

  it('queueStatus on_court e sem reconhecimento ainda, é "called" — mesmo com status já em progresso', () => {
    const m = { id: 'm1', queueStatus: 'on_court', status: 'in progress' };
    expect(nowStateOf(m, null)).toBe('called');
  });

  it('depois do reconhecimento da MESMA partida, a chamada some e vira "live"', () => {
    const m = { id: 'm1', queueStatus: 'on_court', status: 'in progress' };
    expect(nowStateOf(m, 'm1')).toBe('live');
  });

  it('reconhecimento de OUTRA partida não silencia a chamada atual', () => {
    const m = { id: 'm1', queueStatus: 'on_court', status: 'in progress' };
    expect(nowStateOf(m, 'm2')).toBe('called');
  });

  it('em quadra sem chamada pendente (queueStatus já avançou), é "live"', () => {
    const m = { id: 'm1', queueStatus: 'in_progress', status: 'in progress' };
    expect(nowStateOf(m, null)).toBe('live');
  });

  it('agendada e ainda não chamada, é "next"', () => {
    const m = { id: 'm1', queueStatus: null, status: 'Scheduled' };
    expect(nowStateOf(m, null)).toBe('next');
  });

  it('chamada de uma partida anterior não vaza pra próxima partida agendada', () => {
    const m = { id: 'm2', queueStatus: null, status: 'Scheduled' };
    expect(nowStateOf(m, 'm1')).toBe('next');
  });
});
