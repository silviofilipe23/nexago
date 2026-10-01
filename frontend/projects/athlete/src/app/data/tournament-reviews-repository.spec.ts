import { TournamentReviewError, tournamentReviewErrorMessage } from './tournament-reviews-repository';

describe('tournamentReviewErrorMessage', () => {
  it('repassa a mensagem do servidor sem o envelope do Firebase', () => {
    expect(tournamentReviewErrorMessage({
      code: 'functions/permission-denied',
      message: 'Firebase: Você não participou deste torneio. (functions/permission-denied).',
    })).toBe('Você não participou deste torneio.');
    expect(tournamentReviewErrorMessage({ code: 'functions/failed-precondition', message: 'A avaliação deste torneio foi encerrada.' }))
      .toBe('A avaliação deste torneio foi encerrada.');
  });

  it('callable não deployada (not-found) vira mensagem legível', () => {
    expect(tournamentReviewErrorMessage({ code: 'functions/not-found', message: 'not-found' }))
      .toBe('A avaliação ainda não está disponível. Tente de novo em instantes.');
  });

  it('sessão expirada e falha desconhecida', () => {
    expect(tournamentReviewErrorMessage({ code: 'functions/unauthenticated', message: 'x' }))
      .toBe('Sua sessão expirou. Entre de novo para avaliar.');
    expect(tournamentReviewErrorMessage(new Error('boom'))).toBe('O serviço não respondeu. Sua avaliação continua aqui.');
  });

  it('TournamentReviewError já vem pronto', () => {
    expect(tournamentReviewErrorMessage(new TournamentReviewError('Pronto.'))).toBe('Pronto.');
  });
});
