/// Campos da versão premium (v2) de `partners/{partnerId}`, conforme a seção
/// "Versão premium (v2)" de `docs/product/vantagens-nexago-spec.md`. Todos são
/// opcionais na leitura: ausente ou com tipo errado vira o padrão.
library;

import 'package:cloud_firestore/cloud_firestore.dart';

/// Onde mais o benefício aparece além do clube.
enum PartnerPlacement {
  /// Detalhe da pelada (pós-jogo).
  postGame('post_game'),

  /// Dia de torneio (Modo Focus).
  tournamentDay('tournament_day');

  const PartnerPlacement(this.key);

  final String key;

  static PartnerPlacement? fromKey(Object? raw) {
    for (final placement in values) {
      if (placement.key == raw) return placement;
    }
    return null;
  }
}

/// Chips dos termos. A ordem do enum é a ordem dos chips.
enum PartnerTermsTag {
  online('online', 'Online'),
  inStore('in_store', 'Na loja'),
  notCumulative('not_cumulative', 'Não cumulativo'),
  unlimited('unlimited', 'Uso ilimitado'),
  firstOrder('first_order', 'Primeiro pedido'),
  onePerPerson('one_per_person', 'Um por pessoa');

  const PartnerTermsTag(this.key, this.label);

  final String key;
  final String label;

  static PartnerTermsTag? fromKey(Object? raw) {
    for (final tag in values) {
      if (tag.key == raw) return tag;
    }
    return null;
  }
}

/// Uma unidade do parceiro ("Onde usar", "perto de você" e mapa).
class PartnerLocation {
  const PartnerLocation({
    required this.name,
    required this.address,
    required this.latitude,
    required this.longitude,
    this.hours,
  });

  /// `null` quando falta nome, endereço ou coordenada válida.
  static PartnerLocation? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final name = _text(raw['name']);
    final address = _text(raw['address']);
    final lat = raw['lat'];
    final lng = raw['lng'];
    if (name.isEmpty || address.isEmpty || lat is! num || lng is! num) {
      return null;
    }
    final latitude = lat.toDouble();
    final longitude = lng.toDouble();
    if (!latitude.isFinite || latitude.abs() > 90) return null;
    if (!longitude.isFinite || longitude.abs() > 180) return null;
    final hours = _text(raw['hours']);
    return PartnerLocation(
      name: name,
      address: address,
      latitude: latitude,
      longitude: longitude,
      hours: hours.isEmpty ? null : hours,
    );
  }

  final String name;
  final String address;
  final double latitude;
  final double longitude;
  final String? hours;
}

/// Tipo do requisito para usar o benefício.
enum PartnerRequirementType {
  none('none'),
  squad('squad'),
  tournament('tournament'),
  minLevel('min_level');

  const PartnerRequirementType(this.key);

  final String key;
}

/// Quem pode usar: todos, embaixadores do Squad, inscritos de torneios ou a
/// partir de um nível. Tipo desconhecido vira `none` (o backend recusa o que
/// não sabe ler, e o app não inventa bloqueio).
class PartnerRequirement {
  const PartnerRequirement({
    this.type = PartnerRequirementType.none,
    this.tournamentIds = const [],
    this.minLevel,
  });

  static const PartnerRequirement none = PartnerRequirement();

  factory PartnerRequirement.fromMap(Object? raw) {
    if (raw is! Map) return none;
    return switch (raw['type']) {
      'squad' => const PartnerRequirement(type: PartnerRequirementType.squad),
      'tournament' => PartnerRequirement(
        type: PartnerRequirementType.tournament,
        tournamentIds: _texts(raw['tournamentIds']),
      ),
      'min_level' => PartnerRequirement(
        type: PartnerRequirementType.minLevel,
        minLevel: _text(raw['minLevel']).isEmpty
            ? null
            : _text(raw['minLevel']),
      ),
      _ => none,
    };
  }

  final PartnerRequirementType type;

  /// Só `tournament` (1 a 10 ids).
  final List<String> tournamentIds;

  /// Só `min_level`: id da escada de nível (`intermediario_1`…).
  final String? minLevel;

  bool get isNone => type == PartnerRequirementType.none;
}

/// Data do Firestore: `Timestamp`, `DateTime` ou milissegundos.
DateTime? readPartnerDate(Object? value) => switch (value) {
  Timestamp() => value.toDate(),
  DateTime() => value,
  int() => DateTime.fromMillisecondsSinceEpoch(value),
  _ => null,
};

List<T> readPartnerEnumList<T>(Object? value, T? Function(Object?) parse) {
  if (value is! List) return const [];
  final out = <T>[];
  for (final item in value) {
    final parsed = parse(item);
    if (parsed != null && !out.contains(parsed)) out.add(parsed);
  }
  return List.unmodifiable(out);
}

/// Teto de unidades lidas (o backoffice grava no máximo 20).
const int partnerLocationsLimit = 20;

List<PartnerLocation> readPartnerLocations(Object? value) {
  if (value is! List) return const [];
  return List.unmodifiable(
    value
        .map(PartnerLocation.fromMap)
        .whereType<PartnerLocation>()
        .take(partnerLocationsLimit),
  );
}

String _text(Object? value) => value is String ? value.trim() : '';

List<String> _texts(Object? value) {
  if (value is! List) return const [];
  return List.unmodifiable(value.map(_text).where((item) => item.isNotEmpty));
}
