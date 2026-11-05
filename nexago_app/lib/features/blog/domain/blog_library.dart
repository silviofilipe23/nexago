/// Estado de leitura do atleta: `users/{uid}/blogLibrary/{postId}`.
///
/// A rule exige o doc com exatamente estas chaves (todas presentes, `null`
/// quando vazias) e `updatedAt == request.time` — por isso toda gravação manda
/// o doc inteiro ([toWriteMap] + `updatedAt` do servidor no repositório).
/// O gatilho conta um leitor no post quando `readStartedAt` aparece.
library;

import 'blog_post.dart';

/// "Chegou ao fim": a partir daqui o post vai para "Lidos".
const double blogFinishedThreshold = 0.95;

class BlogLibraryEntry {
  const BlogLibraryEntry({
    required this.postId,
    this.saved = false,
    this.savedAt,
    this.progress = 0,
    this.readStartedAt,
    this.finishedAt,
    this.updatedAt,
  });

  final String postId;
  final bool saved;
  final DateTime? savedAt;

  /// 0..1, a maior posição lida.
  final double progress;
  final DateTime? readStartedAt;
  final DateTime? finishedAt;

  /// Hora do servidor; `null` enquanto a gravação está pendente.
  final DateTime? updatedAt;

  /// "Continue lendo" / "Pela metade".
  bool get isInProgress =>
      readStartedAt != null && finishedAt == null && progress > 0;

  /// "Lidos".
  bool get isFinished => finishedAt != null;

  /// Entra na tela de Salvos e lendo.
  bool get isRelevant => saved || isInProgress || isFinished;

  static BlogLibraryEntry fromMap(String postId, Map<String, dynamic>? map) {
    final m = map ?? const <String, dynamic>{};
    final rawProgress = m['progress'];
    final progress = rawProgress is num ? rawProgress.toDouble() : 0.0;
    return BlogLibraryEntry(
      postId: postId,
      saved: m['saved'] == true,
      savedAt: blogDate(m['savedAt']),
      progress: progress.isNaN ? 0 : progress.clamp(0.0, 1.0),
      readStartedAt: blogDate(m['readStartedAt']),
      finishedAt: blogDate(m['finishedAt']),
      updatedAt: blogDate(m['updatedAt']),
    );
  }

  /// Todos os campos que o app grava, menos `updatedAt` (hora do servidor).
  Map<String, Object?> toWriteMap() => {
    'saved': saved,
    'savedAt': saved ? savedAt : null,
    'progress': progress,
    'readStartedAt': readStartedAt,
    'finishedAt': finishedAt,
  };

  BlogLibraryEntry withSaved(bool value, DateTime now) => BlogLibraryEntry(
    postId: postId,
    saved: value,
    savedAt: value ? (savedAt ?? now) : null,
    progress: progress,
    readStartedAt: readStartedAt,
    finishedAt: finishedAt,
    updatedAt: updatedAt,
  );

  /// Abriu o post: marca o início da leitura uma vez só.
  BlogLibraryEntry withOpened(DateTime now) => BlogLibraryEntry(
    postId: postId,
    saved: saved,
    savedAt: savedAt,
    progress: progress,
    readStartedAt: readStartedAt ?? now,
    finishedAt: finishedAt,
    updatedAt: updatedAt,
  );

  /// Progresso só aumenta; perto do fim marca o fim uma vez só.
  BlogLibraryEntry withProgress(double value, DateTime now) {
    final next = value.isNaN ? progress : value.clamp(0.0, 1.0);
    final best = next > progress ? next : progress;
    return BlogLibraryEntry(
      postId: postId,
      saved: saved,
      savedAt: savedAt,
      progress: best,
      readStartedAt: readStartedAt ?? now,
      finishedAt: finishedAt ?? (best >= blogFinishedThreshold ? now : null),
      updatedAt: updatedAt,
    );
  }
}
