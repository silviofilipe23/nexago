import 'blog_library.dart';
import 'blog_notify_prefs.dart';
import 'blog_post.dart';

/// Leitura do blog e estado de leitura do atleta.
abstract interface class BlogRepository {
  /// Publicados para o app, do mais novo para o mais antigo.
  Stream<List<BlogPost>> watchPublished({required int limit});

  /// O post, ou `null` quando não existe, não está publicado ou saiu do app.
  Stream<BlogPost?> watchPost(String postId);

  /// Publicados entre [ids] (qualquer ordem); os que sumiram ficam de fora.
  Future<List<BlogPost>> fetchByIds(List<String> ids);

  /// `users/{uid}/blogLibrary`, por id do post.
  Stream<Map<String, BlogLibraryEntry>> watchLibrary(String uid);

  /// Grava o doc inteiro (a rule exige todas as chaves).
  Future<void> writeLibraryEntry(String uid, BlogLibraryEntry entry);

  /// O atleta marcou "Ajudou" neste post?
  Stream<bool> watchHelpful(String postId, String uid);

  Future<void> setHelpful(String postId, String uid, {required bool helpful});

  /// `blogNotifyPrefs/{uid}`; doc ausente = todas ligadas.
  Stream<BlogNotifyPrefs> watchNotifyPrefs(String uid);

  /// Grava o doc inteiro (`muted` + `updatedAt` do servidor).
  Future<void> writeNotifyPrefs(String uid, BlogNotifyPrefs prefs);
}
