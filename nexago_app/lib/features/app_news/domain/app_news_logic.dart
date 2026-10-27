import '../../home_banners/domain/home_banner.dart';
import '../../home_banners/domain/home_banner_logic.dart';
import 'app_news.dart';

/// O que a tela de Novidades mostra: a versão instalada e as anteriores.
class AppNewsView {
  const AppNewsView({required this.current, this.previous = const []});

  final AppNewsRelease current;
  final List<AppNewsRelease> previous;

  /// Funcionalidade pelo id, em qualquer versão.
  AppNewsFeature? feature(String id) {
    for (final release in [current, ...previous]) {
      for (final f in release.features) {
        if (f.id == id) return f;
      }
    }
    return null;
  }

  /// A versão onde a funcionalidade entrou.
  AppNewsRelease? releaseOf(String featureId) {
    for (final release in [current, ...previous]) {
      if (release.features.any((f) => f.id == featureId)) return release;
    }
    return null;
  }
}

/// As versões que este build conhece ([releases] da mais nova para a mais
/// antiga). A atual é a mais nova com build ≤ [installedBuild] e alguma
/// funcionalidade; `null` = nada para mostrar. Funcionalidade com destino
/// indisponível neste app (ex.: Loja desligada) sai, como no banner.
AppNewsView? appNewsForBuild(
  List<AppNewsRelease> releases,
  int installedBuild, {
  bool Function(HomeBannerDestination destination)? destinationAvailable,
}) {
  final available = destinationAvailable ?? (_) => true;
  final known = [
    for (final r in releases)
      if (r.build <= installedBuild)
        r.withFeatures([
          for (final f in r.features)
            if (f.destination == null || available(f.destination!)) f,
        ]),
  ];
  final index = known.indexWhere((r) => r.features.isNotEmpty);
  if (index < 0) return null;
  return AppNewsView(current: known[index], previous: known.sublist(index + 1));
}

/// Quantas funcionalidades da versão o atleta ainda não usou.
int appNewsUnusedCount(AppNewsRelease release, Set<String> used) =>
    release.features.where((f) => !used.contains(f.id)).length;

/// Os stories de uma versão: o que ela marcou para stories e o atleta ainda
/// não usou.
class AppNewsStories {
  const AppNewsStories({required this.release, required this.features});

  final AppNewsRelease release;
  final List<AppNewsFeature> features;
}

/// Os stories que esperam o atleta, ou `null`. Aparecem uma vez por versão
/// ([seenVersion] é a última que ele viu) e só para quem já tinha conta antes
/// da versão sair: quem acabou de instalar não "atualizou" nada.
AppNewsStories? pendingAppNewsStories({
  required AppNewsRelease release,
  required String? seenVersion,
  required Set<String> used,
  required DateTime? accountCreatedAt,
}) {
  if (!release.stories || seenVersion == release.version) return null;
  if (accountCreatedAt == null) return null;
  if (saoPauloDateKey(accountCreatedAt).compareTo(release.date) >= 0) {
    return null;
  }
  final features = [
    for (final f in release.features)
      if (f.inStories && !used.contains(f.id)) f,
  ];
  if (features.isEmpty) return null;
  return AppNewsStories(release: release, features: features);
}

const _monthsShort = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

const _monthsLong = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', //
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

(int, int, int)? _parseDate(String date) {
  final parts = date.split('-');
  if (parts.length != 3) return null;
  final y = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  final d = int.tryParse(parts[2]);
  if (y == null || m == null || d == null || m < 1 || m > 12) return null;
  return (y, m, d);
}

/// "27 out 2026" — o mês sem ponto, como no resto do app.
String appNewsShortDate(String date) {
  final parsed = _parseDate(date);
  if (parsed == null) return date;
  final (y, m, d) = parsed;
  return '$d ${_monthsShort[m - 1]} $y';
}

/// "5 de outubro".
String appNewsLongDate(String date) {
  final parsed = _parseDate(date);
  if (parsed == null) return date;
  final (_, m, d) = parsed;
  return '$d de ${_monthsLong[m - 1]}';
}
