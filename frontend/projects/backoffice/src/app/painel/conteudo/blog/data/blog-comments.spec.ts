import {
  applyModeration,
  blogCommentFromDoc,
  cleanCommentText,
  commentWhen,
  initialsOf,
  onlyQuestions,
  pendingDelta,
  postIdFromPath,
  replyIssue,
  statusAfter,
  type BlogComment,
} from './blog-comments';

const NOW = new Date('2026-11-05T15:00:00Z');

function comment(id: string, over: Partial<BlogComment> = {}): BlogComment {
  return {
    id,
    postId: 'p1',
    uid: 'u1',
    author: { name: 'Ana S.', photoUrl: null },
    text: 'Que post bom',
    kind: 'comment',
    status: 'pending',
    createdAt: NOW,
    reply: null,
    ...over,
  };
}

describe('blog · comentários', () => {
  it('post pelo caminho do doc (collection group)', () => {
    expect(postIdFromPath('blogPosts/p1/blogComments/c1')).toBe('p1');
    expect(postIdFromPath('outra/x/blogComments/c1')).toBeNull();
    expect(postIdFromPath('blogComments/c1')).toBeNull();
  });

  it('lê o doc com padrões seguros', () => {
    const c = blogCommentFromDoc('c1', 'p1', {
      uid: 'u1',
      author: { name: 'Ana S.', photoUrl: 'http://inseguro/x.png' },
      text: 'Como funciona a chave?',
      kind: 'question',
      status: 'approved',
      createdAt: { toDate: () => NOW },
      reply: { text: 'Assim.', by: { uid: 'a', name: 'Marcelo' }, at: { toDate: () => NOW } },
    });
    expect(c).toEqual({
      id: 'c1',
      postId: 'p1',
      uid: 'u1',
      author: { name: 'Ana S.', photoUrl: null },
      text: 'Como funciona a chave?',
      kind: 'question',
      status: 'approved',
      createdAt: NOW,
      reply: { text: 'Assim.', byName: 'Marcelo', at: NOW },
    });
    const bad = blogCommentFromDoc('c2', 'p1', { status: 'x', kind: 'y', reply: { text: '  ' } });
    expect([bad.status, bad.kind, bad.reply, bad.author.name]).toEqual(['pending', 'comment', null, 'Atleta']);
  });

  it('resposta: mesma limpeza e limites do servidor (2..600)', () => {
    expect(cleanCommentText('  Oi   tudo\n\n\n\nbem? ')).toBe('Oi tudo\n\nbem?');
    expect(replyIssue(' a ')).toBe('Escreva a resposta.');
    expect(replyIssue('ok')).toBeNull();
    expect(replyIssue('x'.repeat(601))).toBe('A resposta passa de 600 caracteres.');
  });

  it('status depois da ação: responder aprova; excluir some', () => {
    expect(statusAfter('approve', 'pending')).toBe('approved');
    expect(statusAfter('reply', 'rejected')).toBe('approved');
    expect(statusAfter('reject', 'approved')).toBe('rejected');
    expect(statusAfter('delete', 'pending')).toBeNull();
  });

  it('atualização otimista: sai da aba quem mudou; responder em Aprovados atualiza no lugar', () => {
    const list = [comment('a'), comment('b')];
    expect(applyModeration(list, 'a', 'approve', 'pending', null, NOW).map((c) => c.id)).toEqual(['b']);
    expect(applyModeration(list, 'a', 'delete', 'pending', null, NOW).map((c) => c.id)).toEqual(['b']);
    const approved = [comment('a', { status: 'approved' })];
    const replied = applyModeration(approved, 'a', 'reply', 'approved', { text: '  Valeu!  ', byName: 'Ana Souza' }, NOW);
    expect(replied[0]!.reply).toEqual({ text: 'Valeu!', byName: 'Ana Souza', at: NOW });
  });

  it('selo: só sai de pendente conta', () => {
    expect(pendingDelta('approve', 'pending')).toBe(-1);
    expect(pendingDelta('delete', 'pending')).toBe(-1);
    expect(pendingDelta('reply', 'approved')).toBe(0);
    expect(pendingDelta('approve', 'rejected')).toBe(0);
  });

  it('quando, iniciais e "só dúvidas"', () => {
    expect(commentWhen(new Date(NOW.getTime() - 20_000), NOW)).toBe('agora');
    expect(commentWhen(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe('há 5 min');
    expect(commentWhen(new Date(NOW.getTime() - 3 * 3_600_000), NOW)).toBe('há 3 h');
    expect(commentWhen(new Date(NOW.getTime() - 30 * 3_600_000), NOW)).toBe('ontem');
    expect(commentWhen(new Date('2026-10-28T12:00:00Z'), NOW)).toBe('28 out');
    expect(commentWhen(null, NOW)).toBe('');
    expect(initialsOf('Ana S.')).toBe('AS');
    expect(initialsOf('')).toBe('·');
    expect(onlyQuestions([comment('a'), comment('b', { kind: 'question' })], true).map((c) => c.id)).toEqual(['b']);
  });
});
