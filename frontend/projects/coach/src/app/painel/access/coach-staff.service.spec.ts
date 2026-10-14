import { inviteLink, staffErrorMessage } from './coach-staff.service';

describe('inviteLink', () => {
  it('monta o caminho do convite a partir da origem', () => {
    expect(inviteLink('https://treinador.nexago.app', 'abc123')).toBe('https://treinador.nexago.app/convite-equipe/abc123');
  });

  it('não duplica a barra quando a origem termina em /', () => {
    expect(inviteLink('https://treinador.nexago.app/', 'abc123')).toBe('https://treinador.nexago.app/convite-equipe/abc123');
  });
});

describe('staffErrorMessage', () => {
  it('mantém a mensagem do servidor em erros de regra de negócio', () => {
    expect(staffErrorMessage({ code: 'functions/already-exists', message: 'Já é membro.' }, 'x')).toBe('Já é membro.');
  });

  it('usa o fallback para internal, not-found e erros sem código', () => {
    expect(staffErrorMessage({ code: 'functions/internal', message: 'internal' }, 'fb')).toBe('fb');
    expect(staffErrorMessage({ code: 'functions/not-found', message: 'NOT FOUND' }, 'fb')).toBe('fb');
    expect(staffErrorMessage(new Error('Failed to fetch'), 'fb')).toBe('fb');
    expect(staffErrorMessage(null, 'fb')).toBe('fb');
  });
});
