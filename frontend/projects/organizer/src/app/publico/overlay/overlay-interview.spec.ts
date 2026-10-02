import { interviewWithDefaults, type BroadcastInterview } from '../../painel/data/broadcast-control';
import {
  INTERVIEW_EXIT_MS,
  INTERVIEW_SWAP_MS,
  InterviewStageDriver,
  STAGE_EMPTY,
  podiumToneOf,
  stageSettled,
  stageToward,
} from './overlay-interview';

function tarja(key: string, over: Partial<BroadcastInterview> = {}): BroadcastInterview {
  return interviewWithDefaults({
    name: key,
    photoUrl: null,
    partnerName: null,
    categoryName: null,
    durationSec: null,
    shownAt: 1,
    key,
    ...over,
  });
}

describe('stageToward', () => {
  it('nada no ar e nada pedido: fica como está', () => {
    expect(stageToward(STAGE_EMPTY, null)).toEqual({ stage: STAGE_EMPTY, settleInMs: null });
  });

  it('tarja nova entra na hora', () => {
    const a = tarja('a');
    expect(stageToward(STAGE_EMPTY, a)).toEqual({ stage: { shown: a, phase: 'in' }, settleInMs: null });
  });

  it('mesmo entrevistado com dados novos atualiza no lugar, sem animação', () => {
    const a = tarja('a');
    const a2 = tarja('a', { showCampaign: false });
    expect(stageToward({ shown: a, phase: 'in' }, a2)).toEqual({ stage: { shown: a2, phase: 'in' }, settleInMs: null });
  });

  it('outro entrevistado: o atual sai e a troca espera 520 ms', () => {
    const a = tarja('a');
    expect(stageToward({ shown: a, phase: 'in' }, tarja('b'))).toEqual({
      stage: { shown: a, phase: 'swap' },
      settleInMs: INTERVIEW_SWAP_MS,
    });
    expect(INTERVIEW_SWAP_MS).toBe(520);
  });

  it('tirar do ar: sai inteiro e só desmonta depois da saída escalonada', () => {
    const a = tarja('a');
    expect(stageToward({ shown: a, phase: 'in' }, null)).toEqual({
      stage: { shown: a, phase: 'out' },
      settleInMs: INTERVIEW_EXIT_MS,
    });
  });
});

describe('stageSettled', () => {
  it('fim da troca: entra quem foi pedido por último', () => {
    const b = tarja('b');
    expect(stageSettled({ shown: tarja('a'), phase: 'swap' }, b)).toEqual({ stage: { shown: b, phase: 'in' }, settleInMs: null });
  });

  it('fim da saída: desmonta', () => {
    expect(stageSettled({ shown: tarja('a'), phase: 'out' }, null)).toEqual({ stage: STAGE_EMPTY, settleInMs: null });
  });

  it('tirada do ar no meio da troca: ainda falta o bug e a marca saírem', () => {
    const a = tarja('a');
    expect(stageSettled({ shown: a, phase: 'swap' }, null)).toEqual({
      stage: { shown: a, phase: 'out' },
      settleInMs: INTERVIEW_EXIT_MS,
    });
  });
});

describe('InterviewStageDriver', () => {
  let driver: InterviewStageDriver;

  beforeEach(() => {
    jasmine.clock().install();
    driver = new InterviewStageDriver();
  });

  afterEach(() => {
    driver.destroy();
    jasmine.clock().uninstall();
  });

  it('troca: o atual fica 520 ms saindo e só então o próximo entra', () => {
    driver.push(tarja('a'));
    driver.push(tarja('b'));
    expect(driver.stage().shown?.key).toBe('a');
    expect(driver.stage().phase).toBe('swap');
    jasmine.clock().tick(INTERVIEW_SWAP_MS - 1);
    expect(driver.stage().shown?.key).toBe('a');
    jasmine.clock().tick(1);
    expect(driver.stage()).toEqual({ shown: jasmine.objectContaining({ key: 'b' }), phase: 'in' });
  });

  it('pedidos em rajada durante a troca: entra o último', () => {
    driver.push(tarja('a'));
    driver.push(tarja('b'));
    driver.push(tarja('c'));
    jasmine.clock().tick(INTERVIEW_SWAP_MS);
    expect(driver.stage().shown?.key).toBe('c');
  });

  it('tirar do ar desmonta depois da saída', () => {
    driver.push(tarja('a'));
    driver.push(null);
    expect(driver.stage().phase).toBe('out');
    jasmine.clock().tick(INTERVIEW_EXIT_MS);
    expect(driver.stage()).toEqual(STAGE_EMPTY);
  });

  it('voltar o mesmo entrevistado no meio da saída: ele reentra', () => {
    driver.push(tarja('a'));
    driver.push(null);
    driver.push(tarja('a'));
    jasmine.clock().tick(INTERVIEW_EXIT_MS);
    expect(driver.stage()).toEqual({ shown: jasmine.objectContaining({ key: 'a' }), phase: 'in' });
  });

  it('destroy cancela a transição pendente', () => {
    driver.push(tarja('a'));
    driver.push(null);
    driver.destroy();
    jasmine.clock().tick(INTERVIEW_EXIT_MS);
    expect(driver.stage().phase).toBe('out');
  });
});

describe('podiumToneOf', () => {
  it('1–3 do ranking pintam o card; o resto fica laranja', () => {
    expect(podiumToneOf(1)).toBe('ouro');
    expect(podiumToneOf(2)).toBe('prata');
    expect(podiumToneOf(3)).toBe('bronze');
    expect(podiumToneOf(4)).toBeNull();
    expect(podiumToneOf(null)).toBeNull();
  });
});
