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
  it('sem próxima partida e sem mata-mata pendente na categoria, é "idle" — fim de torneio de verdade', () => {
    expect(nowStateOf(null, null, false)).toBe('idle');
  });

  it('sem próxima partida MAS com mata-mata pendente na categoria, é "pending-knockout" — não "idle"', () => {
    // Caso real: o atleta terminou a fase de grupos e classificou, a chave do mata-mata existe
    // (`teamADescription: "1º do Grupo A"`), mas `teamAId` ainda está vazio até o
    // `winnerAdvance` preencher o slot — `nextMatch()` já é `null` aqui. Dizer "sem mais
    // partidas pendentes" pra esse atleta é falso (Finding 1 da revisão).
    expect(nowStateOf(null, null, true)).toBe('pending-knockout');
  });

  it('sem argumento de mata-mata pendente, o padrão é "idle" — compatível com chamadas antigas de 2 argumentos', () => {
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

  it('chamada de uma partida NOVA não fica escondida pelo reconhecimento de uma partida anterior', () => {
    // Precisa ser `on_court` de propósito: com `queueStatus: null` o ramo "called" já é
    // inalcançável não importa o valor de `acknowledgedMatchId`, e o teste passaria mesmo se
    // `nowStateOf` ignorasse o parâmetro de reconhecimento por completo.
    const m = { id: 'm2', queueStatus: 'on_court', status: 'in progress' };
    expect(nowStateOf(m, 'm1')).toBe('called');
  });
});
