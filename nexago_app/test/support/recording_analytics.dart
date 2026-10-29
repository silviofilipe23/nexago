import 'package:nexago_app/core/observability/analytics_service.dart';

/// `AnalyticsService` que só grava as chamadas — para conferir qual evento
/// saiu e com que parâmetros, sem Firebase.
class RecordingAnalytics implements AnalyticsService {
  final calls = <Invocation>[];

  /// Chamadas a [member] (ex.: `#logAccountMenuOpened`), na ordem.
  List<Invocation> of(Symbol member) =>
      calls.where((c) => c.memberName == member).toList();

  @override
  dynamic noSuchMethod(Invocation invocation) {
    calls.add(invocation);
    return Future<void>.value();
  }
}
