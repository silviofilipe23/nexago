/// Comentários e dúvidas dos posts: `blogPosts/{postId}/blogComments/{id}`.
///
/// Moderação ANTES de aparecer: tudo nasce `pending`. O atleta logado lê os
/// `approved` e os PRÓPRIOS em qualquer status; escrita só pela callable
/// `postBlogComment` (`functions/src/blog-comments.ts`); o atleta apaga o
/// próprio. Nome e foto são o retrato do perfil público gravado pelo servidor.
library;

import 'blog_logic.dart';
import 'blog_post.dart';

const blogCommentMinLength = 2;
const blogCommentMaxLength = 600;

/// A partir daqui o composer mostra o contador.
const blogCommentCounterFrom = 500;

enum BlogCommentKind {
  comment('comment'),
  question('question');

  const BlogCommentKind(this.key);
  final String key;
}

enum BlogCommentStatus {
  pending('pending'),
  approved('approved'),
  rejected('rejected');

  const BlogCommentStatus(this.key);
  final String key;
}

/// Resposta da equipe nexaGO.
class BlogCommentReply {
  const BlogCommentReply({required this.text, this.at});

  final String text;
  final DateTime? at;
}

class BlogComment {
  const BlogComment({
    required this.id,
    required this.uid,
    required this.authorName,
    required this.text,
    required this.status,
    this.authorPhotoUrl,
    this.kind = BlogCommentKind.comment,
    this.createdAt,
    this.reply,
  });

  final String id;
  final String uid;
  final String authorName;
  final String? authorPhotoUrl;
  final String text;
  final BlogCommentKind kind;
  final BlogCommentStatus status;
  final DateTime? createdAt;
  final BlogCommentReply? reply;

  bool get isQuestion => kind == BlogCommentKind.question;

  /// `null` sem texto ou com status que este build não conhece. Tipo
  /// desconhecido vira comentário; sem nome, "Atleta".
  static BlogComment? fromMap(String id, Map<String, dynamic>? map) {
    if (map == null || id.isEmpty) return null;
    String text(Object? v) => v is String ? v.trim() : '';
    final body = text(map['text']);
    final status = BlogCommentStatus.values
        .where((s) => s.key == map['status'])
        .firstOrNull;
    if (body.isEmpty || status == null) return null;
    final author = map['author'];
    final name = author is Map ? text(author['name']) : '';
    final photo = author is Map ? text(author['photoUrl']) : '';
    final rawReply = map['reply'];
    final replyText = rawReply is Map ? text(rawReply['text']) : '';
    return BlogComment(
      id: id,
      uid: text(map['uid']),
      authorName: name.isEmpty ? 'Atleta' : name,
      authorPhotoUrl: photo.startsWith('https://') ? photo : null,
      text: body,
      kind: map['kind'] == BlogCommentKind.question.key
          ? BlogCommentKind.question
          : BlogCommentKind.comment,
      status: status,
      createdAt: blogDate(map['createdAt']),
      reply: replyText.isEmpty
          ? null
          : BlogCommentReply(
              text: replyText,
              at: rawReply is Map ? blogDate(rawReply['at']) : null,
            ),
    );
  }
}

int _newestFirst(BlogComment a, BlogComment b) {
  final da = a.createdAt;
  final db = b.createdAt;
  if (da == null && db == null) return a.id.compareTo(b.id);
  // Sem hora (gravação pendente) = acabou de chegar: vai para cima.
  if (da == null) return -1;
  if (db == null) return 1;
  return db.compareTo(da);
}

/// A lista da seção: os PRÓPRIOS pendentes/recusados no topo (só o autor os
/// vê) e depois os aprovados — os próprios aprovados entram uma vez só, na
/// ordem dos aprovados. Mais novo primeiro em cada bloco.
List<BlogComment> mergeBlogComments({
  required List<BlogComment> own,
  required List<BlogComment> approved,
}) {
  final top = own.where((c) => c.status != BlogCommentStatus.approved).toList()
    ..sort(_newestFirst);
  final seen = {for (final c in top) c.id};
  final rest = <BlogComment>[
    for (final c in approved)
      if (c.status == BlogCommentStatus.approved && seen.add(c.id)) c,
  ]..sort(_newestFirst);
  return [...top, ...rest];
}

/// O texto que vale enviar: sem espaço nas pontas, 2..600.
bool blogCommentTextValid(String text) {
  final t = text.trim();
  return t.length >= blogCommentMinLength && t.length <= blogCommentMaxLength;
}

/// "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", "há 2 semanas",
/// "12 out" (mais de um mês).
String blogCommentAgo(DateTime? at, DateTime now) {
  if (at == null) return 'agora';
  final diff = now.difference(at);
  if (diff.inMinutes < 1) return 'agora';
  if (diff.inMinutes < 60) return 'há ${diff.inMinutes} min';
  if (diff.inHours < 24) return 'há ${diff.inHours} h';
  final days = diff.inDays;
  if (days == 1) return 'ontem';
  if (days < 7) return 'há $days dias';
  if (days < 30) {
    final weeks = days ~/ 7;
    return weeks == 1 ? 'há 1 semana' : 'há $weeks semanas';
  }
  return blogShortDate(at, now);
}
