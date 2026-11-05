import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/blog/domain/blog_comment.dart';
import 'package:nexago_app/features/blog/domain/blog_post.dart';

BlogComment _c(
  String id, {
  String uid = 'outro',
  BlogCommentStatus status = BlogCommentStatus.approved,
  DateTime? at,
}) => BlogComment(
  id: id,
  uid: uid,
  authorName: 'Ana S.',
  text: 'Texto $id',
  status: status,
  createdAt: at,
);

void main() {
  group('BlogComment.fromMap', () {
    test('lê autor, tipo, status, data e a resposta da equipe', () {
      final c = BlogComment.fromMap('c1', {
        'uid': 'u1',
        'author': {'name': 'Ray', 'photoUrl': 'https://img/r.jpg'},
        'text': '  Como funciona o desempate?  ',
        'kind': 'question',
        'status': 'approved',
        'createdAt': Timestamp.fromDate(DateTime(2026, 11, 5, 9)),
        'moderatedAt': null,
        'moderatedBy': null,
        'reply': {
          'text': 'Pelo saldo de pontos.',
          'by': {'uid': 'a', 'name': 'Equipe'},
          'at': Timestamp.fromDate(DateTime(2026, 11, 5, 10)),
        },
      })!;
      expect(c.uid, 'u1');
      expect(c.authorName, 'Ray');
      expect(c.authorPhotoUrl, 'https://img/r.jpg');
      expect(c.text, 'Como funciona o desempate?');
      expect(c.isQuestion, isTrue);
      expect(c.status, BlogCommentStatus.approved);
      expect(c.createdAt, DateTime(2026, 11, 5, 9));
      expect(c.reply!.text, 'Pelo saldo de pontos.');
    });

    test('tolerante: sem nome = "Atleta", foto não https some, tipo novo = '
        'comentário, sem resposta = null', () {
      final c = BlogComment.fromMap('c1', {
        'author': {'name': '', 'photoUrl': 'http://x'},
        'text': 'Boa!',
        'kind': 'poll',
        'status': 'pending',
        'reply': null,
      })!;
      expect(c.authorName, 'Atleta');
      expect(c.authorPhotoUrl, isNull);
      expect(c.kind, BlogCommentKind.comment);
      expect(c.reply, isNull);
    });

    test('sem texto ou com status desconhecido fica de fora', () {
      expect(
        BlogComment.fromMap('c', {'text': ' ', 'status': 'approved'}),
        isNull,
      );
      expect(
        BlogComment.fromMap('c', {'text': 'Oi', 'status': 'spam'}),
        isNull,
      );
      expect(BlogComment.fromMap('c', null), isNull);
    });
  });

  test('commentCount do post (ausente = 0)', () {
    expect(BlogPost.fromMap('p', {'title': 'T'})!.commentCount, 0);
    expect(
      BlogPost.fromMap('p', {'title': 'T', 'commentCount': 7})!.commentCount,
      7,
    );
  });

  group('mesclagem próprios + aprovados', () {
    test(
      'próprios pendentes/recusados no topo; aprovado próprio uma vez só',
      () {
        final own = [
          _c(
            'p1',
            uid: 'me',
            status: BlogCommentStatus.pending,
            at: DateTime(2026, 11, 5, 8),
          ),
          _c(
            'r1',
            uid: 'me',
            status: BlogCommentStatus.rejected,
            at: DateTime(2026, 11, 5, 9),
          ),
          _c('a-me', uid: 'me', at: DateTime(2026, 11, 4)),
        ];
        final approved = [
          _c('a2', at: DateTime(2026, 11, 5)),
          _c('a-me', uid: 'me', at: DateTime(2026, 11, 4)),
          _c('a1', at: DateTime(2026, 11, 3)),
        ];
        final merged = mergeBlogComments(own: own, approved: approved);
        expect(merged.map((c) => c.id), ['r1', 'p1', 'a2', 'a-me', 'a1']);
      },
    );

    test('recém-enviado sem hora (pendente) vai para o topo', () {
      final merged = mergeBlogComments(
        own: [
          _c(
            'velho',
            uid: 'me',
            status: BlogCommentStatus.pending,
            at: DateTime(2026, 11, 1),
          ),
          _c('novo', uid: 'me', status: BlogCommentStatus.pending),
        ],
        approved: const [],
      );
      expect(merged.map((c) => c.id), ['novo', 'velho']);
    });
  });

  test('texto válido: 2..600 sem contar as pontas', () {
    expect(blogCommentTextValid(' a '), isFalse);
    expect(blogCommentTextValid('ok'), isTrue);
    expect(blogCommentTextValid('x' * 600), isTrue);
    expect(blogCommentTextValid('x' * 601), isFalse);
  });

  test('tempo relativo', () {
    final now = DateTime(2026, 11, 5, 12);
    expect(blogCommentAgo(null, now), 'agora');
    expect(blogCommentAgo(DateTime(2026, 11, 5, 11, 50), now), 'há 10 min');
    expect(blogCommentAgo(DateTime(2026, 11, 5, 9), now), 'há 3 h');
    expect(blogCommentAgo(DateTime(2026, 11, 4, 9), now), 'ontem');
    expect(blogCommentAgo(DateTime(2026, 11, 1, 9), now), 'há 4 dias');
    expect(blogCommentAgo(DateTime(2026, 10, 20), now), 'há 2 semanas');
    expect(blogCommentAgo(DateTime(2026, 9, 12), now), '12 set');
  });
}
