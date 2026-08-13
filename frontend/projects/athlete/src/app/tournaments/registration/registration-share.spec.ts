import {
  pickRegistrationSharePhrase,
  registrationShareAthleteLine,
  registrationShareDateLabel,
  registrationShareFileName,
  registrationShareFooter,
  registrationShareLocationLine,
  registrationShareSlotLabel,
  registrationShareText,
  registrationSharePhrases,
  registrationShareable,
  shortAthleteName,
  type RegistrationShareData,
} from './registration-share';

describe('registration-share', () => {
  describe('registrationShareable', () => {
    const confirmed = { isPaid: true, partnerPending: false, waitlist: false };

    it('libera a inscrição paga e com o elenco fechado', () => {
      expect(registrationShareable(confirmed)).toBeTrue();
    });

    it('segura enquanto o pagamento não saiu', () => {
      expect(registrationShareable({ ...confirmed, isPaid: false })).toBeFalse();
    });

    it('segura enquanto falta parceiro/atleta no elenco', () => {
      expect(registrationShareable({ ...confirmed, partnerPending: true })).toBeFalse();
    });

    it('segura na lista de espera — lá não existe vaga confirmada pra anunciar', () => {
      expect(registrationShareable({ ...confirmed, waitlist: true })).toBeFalse();
    });
  });

  describe('pickRegistrationSharePhrase', () => {
    it('devolve sempre a mesma frase para a mesma inscrição', () => {
      const first = pickRegistrationSharePhrase('reg-abc-123');
      for (let i = 0; i < 5; i++) {
        expect(pickRegistrationSharePhrase('reg-abc-123')).toEqual(first);
      }
    });

    it('varia entre inscrições diferentes', () => {
      const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const picked = new Set(ids.map((id) => pickRegistrationSharePhrase(id).line1));
      expect(picked.size).toBeGreaterThan(1);
    });

    it('nunca sorteia frase que fala em "dupla" para equipe', () => {
      // Varre um espaço grande de ids: uma frase de dupla num quarteto é mentira impressa.
      for (let i = 0; i < 400; i++) {
        const phrase = pickRegistrationSharePhrase(`equipe-${i}`, { team: true });
        expect(`${phrase.line1} ${phrase.line2}`.toLowerCase()).not.toContain('dupla');
      }
    });

    it('mantém as frases de dupla disponíveis fora das equipes', () => {
      expect(registrationSharePhrases.some((p) => `${p.line1} ${p.line2}`.includes('dupla'))).toBeTrue();
    });
  });

  describe('registrationShareDateLabel', () => {
    it('junta os dias quando o torneio cabe no mesmo mês', () => {
      expect(registrationShareDateLabel(new Date(2026, 4, 18), new Date(2026, 4, 20), null)).toBe('18–20 Mai');
    });

    it('repete o mês quando o torneio vira o mês', () => {
      expect(registrationShareDateLabel(new Date(2026, 4, 30), new Date(2026, 5, 2), null)).toBe('30 Mai – 2 Jun');
    });

    it('usa o rótulo do torneio em dia único', () => {
      expect(registrationShareDateLabel(new Date(2026, 9, 24), new Date(2026, 9, 24), 'Sáb, 24 de outubro')).toBe('Sáb, 24 de outubro');
    });

    it('formata o dia único quando não há rótulo', () => {
      expect(registrationShareDateLabel(new Date(2026, 9, 24), null, null)).toBe('24 Out');
    });

    it('cai no rótulo quando não há data', () => {
      expect(registrationShareDateLabel(null, null, 'A confirmar')).toBe('A confirmar');
      expect(registrationShareDateLabel(null, null, null)).toBe('');
    });
  });

  describe('registrationShareSlotLabel', () => {
    it('mostra vaga e capacidade', () => {
      expect(registrationShareSlotLabel(6, 8)).toBe('VAGA #6/8');
    });

    it('omite a capacidade quando a categoria é ilimitada', () => {
      expect(registrationShareSlotLabel(6, 0)).toBe('VAGA #6');
    });

    it('não inventa número quando a contagem não chegou', () => {
      expect(registrationShareSlotLabel(null, 8)).toBe('VAGA —');
      expect(registrationShareSlotLabel(0, 8)).toBe('VAGA —');
    });
  });

  describe('registrationShareFooter', () => {
    it('carimba mês e ano do torneio', () => {
      expect(registrationShareFooter(new Date(2026, 4, 18))).toBe('NEXAGO.APP · MAI 2026');
    });

    it('cai só na marca sem data', () => {
      expect(registrationShareFooter(null)).toBe('NEXAGO.APP');
    });
  });

  describe('registrationShareLocationLine', () => {
    it('junta arena e cidade', () => {
      expect(registrationShareLocationLine('Arena Beach GYN', 'Goiânia, GO')).toBe('Arena Beach GYN · Goiânia, GO');
    });

    it('não deixa separador solto quando falta uma das partes', () => {
      expect(registrationShareLocationLine('Arena Beach GYN', '')).toBe('Arena Beach GYN');
      expect(registrationShareLocationLine(null, 'Goiânia, GO')).toBe('Goiânia, GO');
      expect(registrationShareLocationLine(null, null)).toBe('');
    });
  });

  describe('registrationShareAthleteLine', () => {
    it('separa os nomes por ponto médio', () => {
      expect(registrationShareAthleteLine(['Silvio Dionizio', 'Marcelo Antunes'])).toBe('Silvio Dionizio · Marcelo Antunes');
    });

    it('descarta nomes vazios', () => {
      expect(registrationShareAthleteLine(['Silvio', '  ', 'Rafa'])).toBe('Silvio · Rafa');
      expect(registrationShareAthleteLine([])).toBe('—');
    });
  });

  describe('shortAthleteName', () => {
    it('mantém o primeiro nome e reduz o resto à inicial', () => {
      expect(shortAthleteName('Maria Fernanda Albuquerque')).toBe('Maria A.');
      expect(shortAthleteName('Silvio Dionizio')).toBe('Silvio D.');
    });

    it('devolve nome único inteiro', () => {
      expect(shortAthleteName('Silvio')).toBe('Silvio');
    });

    it('não quebra com nome vazio', () => {
      expect(shortAthleteName('   ')).toBe('Atleta');
    });
  });

  describe('registrationShareText', () => {
    const base: RegistrationShareData = {
      headline: { line1: 'A areia', line2: 'vai ferver.' },
      slotLabel: 'VAGA #6/8',
      tournamentName: 'Copa Verão',
      dateLabel: '18–20 Mai',
      categoryName: 'Mista C',
      locationLine: 'Arena Beach GYN · Goiânia, GO',
      footerLabel: 'NEXAGO.APP · MAI 2026',
      athletes: [{ name: 'Silvio', photo: null }, { name: 'Marcelo', photo: null }],
      teamName: null,
    };

    it('fala no plural para dupla', () => {
      expect(registrationShareText(base)).toBe('Estamos confirmados no Copa Verão — Mista C. Nos vemos na quadra! 🏐');
    });

    it('usa o nome da equipe quando existe', () => {
      expect(registrationShareText({ ...base, teamName: 'Bloco na Rede' })).toBe('A Bloco na Rede está confirmada no Copa Verão — Mista C. Nos vemos na quadra! 🏐');
    });
  });

  describe('registrationShareFileName', () => {
    it('gera slug sem acento nem espaço', () => {
      expect(registrationShareFileName('Copa Verão de Beach Tennis')).toBe('nexago-inscricao-copa-verao-de-beach-tennis.png');
    });

    it('tem nome utilizável quando o torneio não tem nome', () => {
      expect(registrationShareFileName('')).toBe('nexago-inscricao-torneio.png');
    });
  });
});
