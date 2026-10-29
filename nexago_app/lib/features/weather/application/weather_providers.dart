import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../../arenas/domain/arenas_providers.dart' show arenaByIdProvider;
import '../domain/weather_models.dart';
import '../infrastructure/weather_service.dart';

final weatherServiceProvider = Provider<WeatherService>((ref) {
  return WeatherService(ref.watch(firestoreProvider));
});

/// Número para "Falar com a arena" (A6): o WhatsApp de `arenas/{arenaId}`
/// (`whatsapp`/`whatsApp`/`whatsappNumber`) ou, sem ele, o telefone
/// (`phone`/`phoneNumber`/`telefone`/`mobile`) — a prioridade do
/// [ArenaListItem]. `null` sem nenhum.
final weatherArenaContactPhoneProvider =
    Provider.autoDispose.family<String?, String>((ref, arenaId) {
  final id = arenaId.trim();
  if (id.isEmpty) return null;
  final arena = ref.watch(arenaByIdProvider(id)).valueOrNull;
  for (final raw in [arena?.whatsapp, arena?.phone]) {
    final v = raw?.trim() ?? '';
    if (v.isNotEmpty) return v;
  }
  return null;
});

/// Uid da sessão; vazio deslogado (nenhuma leitura bate nas rules).
final weatherUidProvider = Provider.autoDispose<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

/// Política de chuva da arena (`arenas/{arenaId}.weatherPolicy`).
final weatherPolicyProvider =
    StreamProvider.autoDispose.family<WeatherPolicy, String>((ref, arenaId) {
  return ref.watch(weatherServiceProvider).watchPolicy(arenaId);
});

/// Pedido do atleta para a reserva (`arenaWeatherRequests/{bookingId}`).
final weatherRequestProvider = StreamProvider.autoDispose
    .family<WeatherRequest?, String>((ref, bookingId) {
  if (ref.watch(weatherUidProvider).isEmpty) {
    return Stream<WeatherRequest?>.value(null);
  }
  return ref.watch(weatherServiceProvider).watchRequest(bookingId);
});

/// Todos os créditos de chuva do atleta.
final weatherCreditsProvider =
    StreamProvider.autoDispose<List<WeatherCredit>>((ref) {
  final uid = ref.watch(weatherUidProvider);
  if (uid.isEmpty) return Stream.value(const <WeatherCredit>[]);
  return ref.watch(weatherServiceProvider).watchCredits(uid);
});

/// Saldos por arena; vazio enquanto carrega.
final weatherCreditBalancesProvider =
    Provider.autoDispose<List<WeatherArenaBalance>>((ref) {
  final credits = ref.watch(weatherCreditsProvider).valueOrNull ?? const [];
  return summarizeWeatherCreditsByArena(credits, DateTime.now());
});

/// O atleta já teve algum crédito de chuva (o tile dos ajustes só aparece aí).
final hasWeatherCreditsProvider = Provider.autoDispose<bool>((ref) {
  return (ref.watch(weatherCreditsProvider).valueOrNull ?? const []).isNotEmpty;
});
