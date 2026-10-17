/// Arena de retirada da Loja (app) — lógica pura.
///
/// Ordem (`docs/business-rules/loja-vitrine.md`): escolhida pelo atleta (se
/// ainda for ponto ativo) → a mais frequente nas reservas ativas dos últimos
/// 60 dias que seja ponto de retirada (empate: a mais recente) → a mais
/// próxima pela localização já concedida → nenhuma.
library;

import '../../../core/location/geo_distance.dart';
import 'store_models.dart';

/// Janela das reservas que contam para "a mais frequente".
const int kStorePickupBookingWindowDays = 60;

/// Reserva reduzida ao que a escolha da arena precisa.
class StoreBookingVisit {
  const StoreBookingVisit({
    required this.arenaId,
    required this.dateKey,
    this.status = 'active',
  });

  final String arenaId;

  /// `YYYY-MM-DD` da reserva (data civil da arena).
  final String dateKey;
  final String status;
}

enum StorePickupSource { chosen, frequent, nearest, none }

class StorePickupChoice {
  const StorePickupChoice(this.arena, this.source);

  static const StorePickupChoice none =
      StorePickupChoice(null, StorePickupSource.none);

  final StorePickupArena? arena;
  final StorePickupSource source;
}

const Set<String> _inactiveBookingStatuses = {
  'expired',
  'rejected',
  'refunded',
  'failed',
};

/// Cancelada, expirada ou recusada não indica onde o atleta joga.
bool storeBookingIsActive(String status) {
  final s = status.trim().toLowerCase();
  if (s.contains('cancel')) return false;
  return !_inactiveBookingStatuses.contains(s);
}

/// `YYYY-MM-DD` de [days] dias antes de [dayKey]; `null` se a chave é inválida.
String? _shiftDayKey(String dayKey, int days) {
  final parts = dayKey.split('-');
  if (parts.length != 3) return null;
  final y = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  final d = int.tryParse(parts[2]);
  if (y == null || m == null || d == null) return null;
  final date = DateTime.utc(y, m, d).subtract(Duration(days: days));
  return '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';
}

/// Resolve a arena de retirada. [todayKey] é a data civil de hoje
/// (`YYYY-MM-DD`); [userLatitude]/[userLongitude] só chegam com a permissão já
/// concedida (a Loja nunca pede).
StorePickupChoice resolveStorePickupArena({
  required List<StorePickupArena> arenas,
  String? chosenArenaId,
  List<StoreBookingVisit> visits = const [],
  required String todayKey,
  double? userLatitude,
  double? userLongitude,
}) {
  if (arenas.isEmpty) return StorePickupChoice.none;
  final byId = {for (final a in arenas) a.arenaId: a};

  // 1. Escolhida, se ainda for ponto ativo.
  final chosen = byId[chosenArenaId?.trim() ?? ''];
  if (chosen != null) {
    return StorePickupChoice(chosen, StorePickupSource.chosen);
  }

  // 2. Mais frequente nas reservas ativas desde 60 dias atrás (as futuras
  //    contam: reserva marcada é onde o atleta vai estar). Empate: a mais
  //    recente.
  final cutoff = _shiftDayKey(todayKey, kStorePickupBookingWindowDays);
  if (cutoff != null) {
    final counts = <String, int>{};
    final latest = <String, String>{};
    for (final v in visits) {
      if (!byId.containsKey(v.arenaId)) continue;
      if (!storeBookingIsActive(v.status)) continue;
      if (v.dateKey.length < 10) continue;
      final day = v.dateKey.substring(0, 10);
      if (day.compareTo(cutoff) < 0) continue;
      counts[v.arenaId] = (counts[v.arenaId] ?? 0) + 1;
      final prev = latest[v.arenaId];
      if (prev == null || day.compareTo(prev) > 0) latest[v.arenaId] = day;
    }
    String? best;
    for (final id in counts.keys) {
      if (best == null) {
        best = id;
        continue;
      }
      final byCount = counts[id]!.compareTo(counts[best]!);
      if (byCount > 0 ||
          (byCount == 0 && latest[id]!.compareTo(latest[best]!) > 0)) {
        best = id;
      }
    }
    if (best != null) {
      return StorePickupChoice(byId[best], StorePickupSource.frequent);
    }
  }

  // 3. Mais próxima pela localização já concedida.
  final nearest = sortStorePickupArenasByDistance(
    arenas,
    latitude: userLatitude,
    longitude: userLongitude,
  ).firstOrNull;
  if (nearest != null && nearest.distanceKm != null) {
    return StorePickupChoice(nearest.arena, StorePickupSource.nearest);
  }

  // 4. Nenhuma.
  return StorePickupChoice.none;
}

class StorePickupArenaDistance {
  const StorePickupArenaDistance(this.arena, this.distanceKm);

  final StorePickupArena arena;

  /// `null` sem coordenadas (do atleta ou da arena).
  final double? distanceKm;
}

/// Lista da folha "Trocar": mais perto primeiro; sem coordenadas, no fim, na
/// ordem que vieram (o servidor já manda por nome).
List<StorePickupArenaDistance> sortStorePickupArenasByDistance(
  List<StorePickupArena> arenas, {
  double? latitude,
  double? longitude,
}) {
  final hasUser = latitude != null &&
      longitude != null &&
      latitude.isFinite &&
      longitude.isFinite;
  final out = [
    for (final a in arenas)
      StorePickupArenaDistance(
        a,
        hasUser && a.hasCoordinates
            ? haversineDistanceKm(
                lat1: latitude,
                lon1: longitude,
                lat2: a.latitude!,
                lon2: a.longitude!,
              )
            : null,
      ),
  ];
  final indexed = out.asMap().entries.toList()
    ..sort((x, y) {
      final dx = x.value.distanceKm;
      final dy = y.value.distanceKm;
      if (dx == null && dy == null) return x.key.compareTo(y.key);
      if (dx == null) return 1;
      if (dy == null) return -1;
      final byDistance = dx.compareTo(dy);
      return byDistance != 0 ? byDistance : x.key.compareTo(y.key);
    });
  return [for (final e in indexed) e.value];
}

/// `0,8 km` → "800 m"; `2,34` → "2,3 km"; `12,6` → "13 km".
String formatStoreDistance(double km) {
  if (km < 1) {
    final meters = (km * 1000 / 10).round() * 10;
    return '${meters < 10 ? 10 : meters} m';
  }
  if (km < 10) return '${km.toStringAsFixed(1).replaceAll('.', ',')} km';
  return '${km.round()} km';
}
