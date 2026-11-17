import {
  bookingStoryCrew,
  bookingStoryCrewCaption,
  bookingStoryCrewNames,
  bookingStoryDateLabel,
  bookingStoryFileName,
  bookingStoryFrom,
  bookingStoryHeadline,
  bookingStoryInitials,
  bookingStoryMoment,
  bookingStoryPhotoError,
  bookingStoryPill,
  bookingStoryShareable,
  bookingStoryThemeHasImage,
  STORY_PHOTO_MAX_BYTES,
  bookingStoryTimeRange,
  type BookingStoryPerson,
} from './booking-story';

const person = (firstName: string): BookingStoryPerson => ({ firstName, initials: firstName.slice(0, 2), photoUrl: null });

describe('booking-story', () => {
  describe('bookingStoryShareable', () => {
    it('não oferece story para reserva cancelada ou esperando pagamento online', () => {
      for (const status of ['canceled', 'cancelled', 'pending', 'processing', 'pending_payment', ' Canceled ']) {
        expect(bookingStoryShareable(status)).withContext(status).toBeFalse();
      }
    });

    it('oferece para confirmada, concluída e paga na arena', () => {
      for (const status of ['confirmed', 'completed', 'paid', 'onsite']) {
        expect(bookingStoryShareable(status)).withContext(status).toBeTrue();
      }
    });
  });

  it('formata a data do dateKey em dia da semana · dia mês, sem passar por UTC', () => {
    expect(bookingStoryDateLabel('2026-05-22')).toBe('SEX · 22 MAI');
    expect(bookingStoryDateLabel('2026-11-01')).toBe('DOM · 1 NOV');
    expect(bookingStoryDateLabel('lixo')).toBe('lixo');
  });

  it('junta o horário com meia-risca e corta segundos', () => {
    expect(bookingStoryTimeRange('09:00', '10:30')).toBe('09:00–10:30');
    expect(bookingStoryTimeRange('18:00:00', '19:00:00')).toBe('18:00–19:00');
    expect(bookingStoryTimeRange('', '10:30')).toBe('10:30');
  });

  it('tira as iniciais do primeiro e segundo nome', () => {
    expect(bookingStoryInitials('Maria Eduarda Lima')).toBe('ME');
    expect(bookingStoryInitials('ana')).toBe('AN');
    expect(bookingStoryInitials('  ')).toBe('');
  });

  describe('bookingStoryCrew', () => {
    it('usa só o primeiro nome, sem repetir pessoa e sem nome vazio', () => {
      const crew = bookingStoryCrew([
        { key: 'a', name: 'Ana Souza', photoUrl: 'https://x/a.jpg' },
        { key: 'b', name: '  ', photoUrl: null },
        { key: 'a', name: 'Ana Souza', photoUrl: null },
        { key: 'c', name: 'Enzo Lima', photoUrl: ' ' },
      ]);
      expect(crew).toEqual([
        { firstName: 'Ana', initials: 'AS', photoUrl: 'https://x/a.jpg' },
        { firstName: 'Enzo', initials: 'EL', photoUrl: null },
      ]);
    });
  });

  it('lista os nomes da galera como no app', () => {
    expect(bookingStoryCrewNames([])).toBe('');
    expect(bookingStoryCrewNames([person('Ana')])).toBe('Ana');
    expect(bookingStoryCrewNames([person('Ana'), person('Enzo')])).toBe('Ana e Enzo');
    expect(bookingStoryCrewNames(['Ana', 'Enzo', 'Rafa', 'Lia'].map(person))).toBe('Ana, Enzo, Rafa e Lia');
    expect(bookingStoryCrewNames(['Ana', 'Enzo', 'Rafa', 'Lia', 'Bia'].map(person))).toBe('Ana, Enzo, Rafa e +2');
  });

  it('muda a legenda da galera depois do jogo', () => {
    expect(bookingStoryCrewCaption(1, 'upcoming')).toBe('Quem vem jogar?');
    expect(bookingStoryCrewCaption(4, 'live')).toBe('4 na quadra');
    expect(bookingStoryCrewCaption(4, 'done')).toBe('4 jogaram com a gente');
  });

  it('troca título e selo pelo momento do jogo', () => {
    expect(bookingStoryHeadline('upcoming')).toEqual(['Bora', 'jogar.']);
    expect(bookingStoryHeadline('live')).toEqual(['Rolando', 'agora.']);
    expect(bookingStoryHeadline('done')).toEqual(['Teve', 'jogo.']);
    expect(bookingStoryPill('upcoming')).toBe('QUADRA GARANTIDA');
    expect(bookingStoryMoment('live')).toBe('live');
    expect(bookingStoryMoment('done')).toBe('done');
    expect(bookingStoryMoment('upcoming')).toBe('upcoming');
  });

  describe('bookingStoryFrom', () => {
    const booking = {
      courtName: ' Quadra 2 ',
      sportLabel: 'Beach tennis',
      dateKey: '2026-05-22',
      startTime: '09:00',
      endTime: '10:30',
      allocationStatus: null,
    } as const;

    it('monta a arte com quadra, modalidade em caixa alta e data compacta', () => {
      const story = bookingStoryFrom({ booking, arenaName: ' Arena Sol ', moment: 'upcoming', crew: [] });
      expect(story).toEqual({
        moment: 'upcoming',
        arenaName: 'Arena Sol',
        courtName: 'Quadra 2',
        sportLabel: 'BEACH TENNIS',
        timeRange: '09:00–10:30',
        dateLabel: 'SEX · 22 MAI',
        crew: [],
      });
    });

    it('não promete quadra provisória nem modalidade que a reserva não gravou', () => {
      const story = bookingStoryFrom({
        booking: { ...booking, allocationStatus: 'unassigned', sportLabel: null },
        arenaName: 'Arena Sol',
        moment: 'upcoming',
        crew: [],
      });
      expect(story.courtName).toBe('');
      expect(story.sportLabel).toBeNull();
    });
  });

  it('nomeia o PNG com data e hora da reserva', () => {
    expect(bookingStoryFileName({ dateKey: '2026-05-22', startTime: '09:00' })).toBe('story-reserva-2026-05-22-0900.png');
    expect(bookingStoryFileName({ dateKey: '2026-05-22', startTime: '' })).toBe('story-reserva-2026-05-22.png');
  });

  describe('foto própria no fundo', () => {
    it('aceita imagem até o teto e recusa outro tipo ou arquivo grande demais', () => {
      expect(bookingStoryPhotoError({ type: 'image/jpeg', size: 3_000_000 })).toBeNull();
      expect(bookingStoryPhotoError({ type: 'image/png', size: STORY_PHOTO_MAX_BYTES - 1 })).toBeNull();
      expect(bookingStoryPhotoError({ type: 'application/pdf', size: 1000 })).toContain('arquivo de imagem');
      expect(bookingStoryPhotoError({ type: '', size: 1000 })).toContain('arquivo de imagem');
      expect(bookingStoryPhotoError({ type: 'image/jpeg', size: STORY_PHOTO_MAX_BYTES })).toContain('25 MB');
    });

    it('só capa e foto própria são fundos com imagem', () => {
      expect(bookingStoryThemeHasImage('photo')).toBeTrue();
      expect(bookingStoryThemeHasImage('cover')).toBeTrue();
      expect(bookingStoryThemeHasImage('night')).toBeFalse();
    });
  });
});
