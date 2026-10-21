import { Timestamp, type DocumentSnapshot } from 'firebase/firestore';
import type { ArenaProfessorLink } from './arena-professor.model';
import {
  arenaChannelConversationId,
  arenaChannelFromDoc,
  arenaProfessorNoticeFromDoc,
  channelMessageFromDoc,
  channelState,
  channelStateNote,
  composerText,
  groupMessagesByDay,
  messageDayLabel,
  messageTimeLabel,
  noticeAudienceCount,
  noticeDraftError,
  noticeInput,
  noticeReadLabel,
  noticeRecipientOptions,
  noticeSentLabel,
  showSenderName,
  unreadBadge,
  unreadByLinkId,
  unreadFor,
  type ArenaChannel,
  type ChannelMessage,
  type NoticeDraft,
} from './arena-professor-channel.model';

// 21 out 2026, 15:00 local — os rótulos usam o calendário local, como a tela.
const NOW = new Date(2026, 9, 21, 15, 0).getTime();

function fakeDoc(id: string, data: Record<string, unknown> | undefined): DocumentSnapshot {
  return { id, data: () => data } as unknown as DocumentSnapshot;
}

function msg(id: string, senderUid: string, at: Date | null, text = 'oi'): ChannelMessage {
  return { id, senderUid, senderName: senderUid, text, createdAt: at, auto: false };
}

function channel(overrides: Partial<ArenaChannel> = {}): ArenaChannel {
  return {
    id: 'a_a1_p1',
    arenaId: 'a1',
    professorUid: 'p1',
    linkId: 'a1_p1',
    memberIds: ['p1', 'owner'],
    memberNames: {},
    closed: false,
    lastAt: null,
    lastMessage: null,
    unread: {},
    ...overrides,
  };
}

function link(uid: string, name: string, status: ArenaProfessorLink['status']): ArenaProfessorLink {
  return { professorUserId: uid, professorName: name, professorPhotoUrl: null, status } as ArenaProfessorLink;
}

function draft(overrides: Partial<NoticeDraft> = {}): NoticeDraft {
  return { kind: 'aviso', title: 'Quadra 2', body: 'Manutenção sábado', audience: 'all', picked: [], ...overrides };
}

describe('arena-professor-channel.model', () => {
  describe('canal', () => {
    it('id do canal espelha o servidor', () => {
      expect(arenaChannelConversationId('a1', 'p1')).toBe('a_a1_p1');
    });

    it('parse do canal: só kind arena, não lidas numéricas, linkId de fallback', () => {
      expect(arenaChannelFromDoc(fakeDoc('d_x', { kind: 'direct' }))).toBeNull();
      expect(arenaChannelFromDoc(fakeDoc('a', undefined))).toBeNull();
      const c = arenaChannelFromDoc(
        fakeDoc('a_a1_p1', {
          kind: 'arena',
          arenaId: 'a1',
          professorUid: 'p1',
          memberIds: ['p1', 'owner', 3],
          memberNames: { owner: 'Ana · gestão', bad: 1 },
          unread: { owner: 2, p1: 'x' },
          lastAt: Timestamp.fromDate(new Date(NOW)),
          lastMessage: { text: 'Oi', senderUid: 'p1', senderName: 'Thiago' },
          closed: true,
        }),
      )!;
      expect(c.linkId).toBe('a1_p1');
      expect(c.memberIds).toEqual(['p1', 'owner']);
      expect(c.memberNames).toEqual({ owner: 'Ana · gestão' });
      expect(c.unread).toEqual({ owner: 2 });
      expect(c.closed).toBeTrue();
      expect(c.lastMessage?.senderName).toBe('Thiago');
      expect(c.lastAt?.getTime()).toBe(NOW);
    });

    it('parse da mensagem descarta texto vazio e marca resposta automática', () => {
      expect(channelMessageFromDoc(fakeDoc('m0', { text: '  ' }))).toBeNull();
      const m = channelMessageFromDoc(fakeDoc('m1', { senderUid: 'p1', senderName: 'Thiago', text: ' oi ', auto: true }))!;
      expect(m.text).toBe('oi');
      expect(m.auto).toBeTrue();
      expect(m.createdAt).toBeNull();
      expect(messageTimeLabel(m)).toBe('enviando…');
    });

    it('estado: sem perfil, vínculo inativo, fechado e aberto', () => {
      expect(channelState({ canWrite: false, linkStatus: 'ACTIVE', channel: channel() })).toBe('no-access');
      expect(channelState({ canWrite: true, linkStatus: 'ENDED', channel: null })).toBe('inactive');
      expect(channelState({ canWrite: true, linkStatus: 'ENDED', channel: channel() })).toBe('closed');
      expect(channelState({ canWrite: true, linkStatus: 'ACTIVE', channel: channel({ closed: true }) })).toBe('closed');
      expect(channelState({ canWrite: true, linkStatus: 'ACTIVE', channel: null })).toBe('open');
    });

    it('nota do estado cita a suspensão e some quando aberto', () => {
      expect(channelStateNote('open', 'ACTIVE', 'Thiago Mendes')).toBeNull();
      expect(channelStateNote('inactive', 'SUSPENDED', 'Thiago Mendes')).toContain('suspenso');
      expect(channelStateNote('inactive', 'PENDING', 'Thiago Mendes')).toContain('Thiago');
      expect(channelStateNote('closed', 'ENDED', 'Thiago')).toContain('encerrado');
      expect(channelStateNote('no-access', 'ACTIVE', 'Thiago')).toContain('Perfil');
    });

    it('não lidas por vínculo, só de quem está olhando', () => {
      const list = [
        channel({ linkId: 'a1_p1', unread: { owner: 3, p1: 0 } }),
        channel({ linkId: 'a1_p2', unread: { owner: 0 } }),
        channel({ linkId: 'a1_p3', unread: { other: 5 } }),
      ];
      expect(unreadByLinkId(list, 'owner')).toEqual({ a1_p1: 3 });
      expect(unreadByLinkId(list, null)).toEqual({});
      expect(unreadFor(list[0]!, 'owner')).toBe(3);
      expect(unreadFor(null, 'owner')).toBe(0);
      expect(unreadBadge(4)).toBe('4');
      expect(unreadBadge(12)).toBe('9+');
    });

    it('agrupa por dia em ordem cronológica, pendente por último', () => {
      const yesterday = new Date(2026, 9, 20, 18, 5);
      const today = new Date(2026, 9, 21, 9, 30);
      const old = new Date(2026, 9, 2, 8, 0);
      const groups = groupMessagesByDay([msg('c', 'p1', null), msg('b', 'p1', today), msg('a', 'owner', yesterday), msg('z', 'p1', old)], NOW);
      expect(groups.map((g) => g.label)).toEqual(['02 out', 'Ontem', 'Hoje']);
      expect(groups[2]!.messages.map((m) => m.id)).toEqual(['b', 'c']);
      expect(messageDayLabel(new Date(2025, 0, 3), NOW)).toBe('03 jan 2025');
    });

    it('nome do remetente só quando muda e nunca nas minhas', () => {
      const list = [msg('1', 'p1', null), msg('2', 'p1', null), msg('3', 'staff', null), msg('4', 'me', null)];
      expect(showSenderName(list, 0, 'me')).toBeTrue();
      expect(showSenderName(list, 1, 'me')).toBeFalse();
      expect(showSenderName(list, 2, 'me')).toBeTrue();
      expect(showSenderName(list, 3, 'me')).toBeFalse();
    });

    it('composer: corta espaços, recusa vazio e longo demais', () => {
      expect(composerText('  oi  ')).toBe('oi');
      expect(composerText('   ')).toBeNull();
      expect(composerText('x'.repeat(2001))).toBeNull();
    });
  });

  describe('comunicados', () => {
    it('parse com fallback de tipo e contagens', () => {
      const n = arenaProfessorNoticeFromDoc(
        fakeDoc('n1', { arenaId: 'a1', kind: 'xx', title: 'T', body: 'B', recipientIds: ['p1', 'p2'], sentAt: Timestamp.fromDate(new Date(2026, 9, 21, 14, 5)) }),
      );
      expect(n.kind).toBe('aviso');
      expect(n.recipientCount).toBe(2);
      expect(n.readCount).toBe(0);
      expect(n.authorName).toBe('Gestão');
      expect(noticeSentLabel(n, NOW)).toBe('21 out · 14:05');
      expect(noticeSentLabel({ sentAt: null }, NOW)).toBe('enviando…');
    });

    it('lidos X de Y nunca passa do total', () => {
      expect(noticeReadLabel({ readCount: 2, recipientCount: 5 })).toBe('lidos 2 de 5');
      expect(noticeReadLabel({ readCount: 9, recipientCount: 5 })).toBe('lidos 5 de 5');
    });

    it('destinatários: só ATIVOS, sem repetir, por nome', () => {
      const opts = noticeRecipientOptions([
        link('p2', 'Zeca', 'ACTIVE'),
        link('p1', 'Ana', 'ACTIVE'),
        link('p3', 'Bia', 'SUSPENDED'),
        link('p1', 'Ana', 'ACTIVE'),
      ]);
      expect(opts.map((o) => o.uid)).toEqual(['p1', 'p2']);
    });

    it('validação do rascunho segue o servidor', () => {
      expect(noticeDraftError(draft(), 2)).toBeNull();
      expect(noticeDraftError(draft({ title: ' ' }), 2)).toContain('título');
      expect(noticeDraftError(draft({ title: 'x'.repeat(81) }), 2)).toContain('80');
      expect(noticeDraftError(draft({ body: '' }), 2)).toContain('mensagem');
      expect(noticeDraftError(draft({ body: 'x'.repeat(2001) }), 2)).toContain('2000');
      expect(noticeDraftError(draft(), 0)).toContain('Nenhum professor');
      expect(noticeDraftError(draft({ audience: 'pick' }), 2)).toContain('ao menos um');
    });

    it('payload: sem professorUids para todos; únicos ao escolher', () => {
      expect(noticeInput('a1', draft({ title: ' T ', body: ' B ' }))).toEqual({ arenaId: 'a1', kind: 'aviso', title: 'T', body: 'B' });
      expect(noticeInput('a1', draft({ audience: 'pick', picked: ['p1', 'p1', 'p2'] })).professorUids).toEqual(['p1', 'p2']);
      expect(noticeAudienceCount({ audience: 'all', picked: ['p1'] }, 4)).toBe(4);
      expect(noticeAudienceCount({ audience: 'pick', picked: ['p1', 'p1'] }, 4)).toBe(1);
    });
  });
});
