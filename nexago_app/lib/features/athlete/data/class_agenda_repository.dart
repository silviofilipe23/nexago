import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../domain/agenda/class_agenda_entry.dart';
import '../domain/agenda/class_charge_entry.dart';

/// Aulas da arena na agenda do atleta, pelas callables `getMyClassAgenda` e
/// `getMyClassCharges` (as coleções de aula são só da equipe da arena — o
/// atleta não lê direto).
class ClassAgendaRepository {
  ClassAgendaRepository({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  /// Intervalo padrão do servidor: 30 dias para trás, 35 para a frente.
  Future<List<ClassAgendaEntry>> fetchMyClasses() async {
    final result = await _functions
        .httpsCallable('getMyClassAgenda')
        .call<Object?>(const <String, Object?>{});
    final raw = result.data;
    final items = raw is Map ? raw['items'] : null;
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map(
          (m) => ClassAgendaEntry.fromMap(
            m.map((k, v) => MapEntry(k.toString(), v)),
          ),
        )
        .toList();
  }

  /// Mensalidades em aberto, da que vence primeiro.
  Future<List<ClassChargeEntry>> fetchMyCharges() async {
    final result = await _functions
        .httpsCallable('getMyClassCharges')
        .call<Object?>(const <String, Object?>{});
    final raw = result.data;
    final items = raw is Map ? raw['items'] : null;
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map(
          (m) => ClassChargeEntry.fromMap(
            m.map((k, v) => MapEntry(k.toString(), v)),
          ),
        )
        .toList();
  }
}

final classAgendaRepositoryProvider = Provider<ClassAgendaRepository>(
  (ref) => ClassAgendaRepository(),
);
