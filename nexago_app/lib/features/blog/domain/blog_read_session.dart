/// Uma sessão de leitura do post para as métricas do blog: `blogReads/{autoId}`.
///
/// A rule exige exatamente `postId, uid, category, seconds (int 0..3600),
/// progress (0..1), finished, ctaClicked, at (serverTimestamp)`, só create e só
/// de post publicado. Spec: seção "Métricas" de
/// `docs/superpowers/specs/2026-11-05-blog-fase-1-design.md`.
library;

import 'blog_library.dart';
import 'blog_post.dart';

/// Abaixo disso a abertura foi toque por engano: não grava.
const blogReadMinSeconds = 5;

/// Teto da rule.
const blogReadMaxSeconds = 3600;

/// Conta o tempo ATIVO (o relógio para em [pause] e volta em [resume]), o
/// maior progresso do corpo e o toque na chamada. [close] devolve o que gravar
/// uma vez só: depois dele a sessão não muda nem grava de novo.
class BlogReadSession {
  BlogReadSession({
    required this.postId,
    required this.categoryKey,
    required DateTime Function() clock,
    double startProgress = 0,
  }) : _clock = clock,
       _runningSince = clock(),
       _progress = _clamp(startProgress);

  final String postId;

  /// Id da categoria do post; fora do formato (vazio) não grava.
  final String categoryKey;
  final DateTime Function() _clock;

  Duration _active = Duration.zero;
  DateTime? _runningSince;
  double _progress;
  bool _ctaClicked = false;
  bool _closed = false;

  static double _clamp(double v) => v.isNaN ? 0 : v.clamp(0.0, 1.0);

  bool get isRunning => _runningSince != null;
  bool get isClosed => _closed;

  /// Para o relógio (app em segundo plano, outra tela por cima).
  void pause() {
    final since = _runningSince;
    if (since == null || _closed) return;
    _active += _clock().difference(since);
    _runningSince = null;
  }

  /// Volta a contar.
  void resume() {
    if (_runningSince != null || _closed) return;
    _runningSince = _clock();
  }

  /// Leu até [value] (0..1); vale o maior.
  void reportProgress(double value) {
    if (_closed) return;
    final v = _clamp(value);
    if (v > _progress) _progress = v;
  }

  /// Tocou no botão da chamada do fim do post.
  void markCtaClicked() {
    if (!_closed) _ctaClicked = true;
  }

  Duration get _elapsed {
    final since = _runningSince;
    return since == null ? _active : _active + _clock().difference(since);
  }

  /// Segundos ativos, arredondados e no teto da rule.
  int get seconds {
    final s = (_elapsed.inMilliseconds / 1000).round();
    return s.clamp(0, blogReadMaxSeconds);
  }

  double get progress => _progress;
  bool get finished => _progress >= blogFinishedThreshold;
  bool get ctaClicked => _ctaClicked;

  /// Fecha a sessão. Devolve o payload (sem `at`, que é a hora do servidor)
  /// quando vale gravar: [uid] logado, categoria conhecida (a rule só aceita
  /// as seis) e pelo menos [blogReadMinSeconds]. Segunda chamada: `null`.
  Map<String, Object>? close({required String uid}) {
    if (_closed) return null;
    pause();
    _closed = true;
    if (uid.isEmpty || postId.isEmpty || !isBlogCategoryId(categoryKey)) {
      return null;
    }
    final secs = seconds;
    if (secs < blogReadMinSeconds) return null;
    return {
      'postId': postId,
      'uid': uid,
      'category': categoryKey,
      'seconds': secs,
      'progress': _progress,
      'finished': finished,
      'ctaClicked': _ctaClicked,
    };
  }
}
