import '../../../../core/deep_link/app_domains.dart';
import 'sand_rank_catalog.dart';

/// Texto padrão de compartilhamento de um degrau do Sand Rank — reaproveitado
/// pela tela da trilha (elo atual) e pela celebração de promoção (degrau
/// recém-alcançado), para manter a mesma copy nos dois lugares.
String sandRankShareText(SandRankStep step) {
  final label = sandRankLabel(step);
  return 'Cheguei ao elo $label no nexaGO! 🏐🔥 '
      'Bora pra areia comigo: ${AppShareLinks.appDownload}';
}
