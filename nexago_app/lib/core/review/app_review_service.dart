import 'package:shared_preferences/shared_preferences.dart';

/// Pedido de avaliação nativa da loja (in-app review) com cooldown local.
///
/// O SO já limita quantas vezes o diálogo aparece (iOS: 3x/ano por usuário),
/// mas cada `requestReview` consome cota mesmo quando o diálogo não abre —
/// por isso o cooldown próprio, bem mais largo que o intervalo entre
/// inscrições de um atleta ativo.
class AppReviewService {
  AppReviewService({
    required Future<SharedPreferences?> Function() loadPreferences,
    required Future<bool> Function() isReviewAvailable,
    required Future<void> Function() requestReview,
    DateTime Function() now = DateTime.now,
  })  : _loadPreferences = loadPreferences,
        _isReviewAvailable = isReviewAvailable,
        _requestReview = requestReview,
        _now = now;

  final Future<SharedPreferences?> Function() _loadPreferences;
  final Future<bool> Function() _isReviewAvailable;
  final Future<void> Function() _requestReview;
  final DateTime Function() _now;

  static const Duration cooldown = Duration(days: 120);
  static const String lastPromptKey = 'app_review_last_prompt_millis';

  /// Pede a avaliação se o cooldown já passou e a API estiver disponível.
  ///
  /// Retorna se o pedido foi feito. O SO pode decidir não exibir o diálogo e
  /// isso não é observável — "pedido feito" já conta como prompt para o
  /// cooldown. Qualquer falha é silenciosa: avaliação nunca pode quebrar a
  /// tela que a dispara.
  Future<bool> maybeRequestReview() async {
    // Sem preferências não dá pra honrar o cooldown; pedir às cegas
    // queimaria a cota do SO a cada inscrição.
    final prefs = await _loadPreferences();
    if (prefs == null) return false;

    final lastMillis = prefs.getInt(lastPromptKey);
    if (lastMillis != null) {
      final elapsed = _now().difference(
        DateTime.fromMillisecondsSinceEpoch(lastMillis),
      );
      if (elapsed < cooldown) return false;
    }

    try {
      if (!await _isReviewAvailable()) return false;
      await _requestReview();
      await prefs.setInt(lastPromptKey, _now().millisecondsSinceEpoch);
      return true;
    } catch (_) {
      return false;
    }
  }
}
