import 'package:cloud_firestore/cloud_firestore.dart';

/// Perfil público do organizador — spec
/// `docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md`.
///
/// `organizerPublicProfiles/{uid}` é gravado só por Cloud Function; o app só lê. Os números
/// (`stats`) não dependem do relógio: mudam quando um torneio do organizador muda.

/// Local frequente dos eventos ("Onde acontece").
class OrganizerVenue {
  const OrganizerVenue({
    required this.name,
    required this.count,
    this.arenaId,
    this.city,
  });

  final String name;
  final String? arenaId;
  final String? city;
  final int count;
}

/// `stats` do perfil público. Ausente ou malformado vira tudo zero.
class OrganizerPublicStats {
  const OrganizerPublicStats({
    this.listedEvents = 0,
    this.eventsCompleted = 0,
    this.openEvents = 0,
    this.athletes = 0,
    this.organizerSince,
    this.sports = const [],
    this.venues = const [],
  });

  final int listedEvents;
  final int eventsCompleted;
  final int openEvents;
  final int athletes;

  /// Menor `startAt` entre os eventos listados — não é a data do cadastro.
  final DateTime? organizerSince;

  /// Códigos de `tournaments.sport`, do mais frequente ao menos frequente.
  final List<String> sports;
  final List<OrganizerVenue> venues;

  static OrganizerPublicStats fromMap(Object? raw) {
    if (raw is! Map) return const OrganizerPublicStats();
    return OrganizerPublicStats(
      listedEvents: _countOf(raw['listedEvents']),
      eventsCompleted: _countOf(raw['eventsCompleted']),
      openEvents: _countOf(raw['openEvents']),
      athletes: _countOf(raw['athletes']),
      organizerSince: _dateOf(raw['organizerSince']),
      sports: [
        if (raw['sports'] is List)
          for (final sport in raw['sports'] as List)
            if (_textOf(sport).isNotEmpty) _textOf(sport),
      ],
      venues: [
        if (raw['venues'] is List)
          for (final venue in raw['venues'] as List)
            if (_venueOf(venue) case final parsed?) parsed,
      ],
    );
  }
}

/// `organizerPublicProfiles/{uid}`.
class OrganizerPublicProfile {
  const OrganizerPublicProfile({
    required this.uid,
    required this.name,
    this.logoUrl,
    this.coverUrl,
    this.bio,
    this.city,
    this.state,
    this.whatsapp,
    this.isOrganizer = false,
    this.verified = false,
    this.listed = false,
    this.followersCount = 0,
    this.stats = const OrganizerPublicStats(),
  });

  final String uid;
  final String name;
  final String? logoUrl;
  final String? coverUrl;
  final String? bio;
  final String? city;

  /// UF em maiúsculas.
  final String? state;

  /// Dígitos com DDI 55 — só existe quando o organizador ligou o botão público.
  final String? whatsapp;

  /// Tem o papel organizer e a identidade foi projetada. O doc pode existir SEM identidade: o
  /// gatilho de números cria `{uid, stats, listed: false}` para qualquer `managerId`, e o
  /// contador de seguidores cria `{followersCount}` por merge. Só com `true` o perfil é exibível
  /// (e `name` é o nome da marca, não o fallback).
  final bool isOrganizer;
  final bool verified;

  /// Entra na lista "Organizadores".
  final bool listed;
  final int followersCount;
  final OrganizerPublicStats stats;

  /// Perfil que pode ser mostrado ao atleta (ver [isOrganizer]).
  bool get isDisplayable => isOrganizer;

  static OrganizerPublicProfile? fromMap(
    String id,
    Map<String, dynamic>? data,
  ) {
    if (data == null) return null;
    final uid = _textOf(data['uid']);
    final name = _textOf(data['name']);
    final state = _textOf(data['state']).toUpperCase();
    return OrganizerPublicProfile(
      uid: uid.isEmpty ? id : uid,
      name: name.isEmpty ? 'Organizador' : name,
      logoUrl: _nullableText(data['logoUrl']),
      coverUrl: _nullableText(data['coverUrl']),
      bio: _nullableText(data['bio']),
      city: _nullableText(data['city']),
      state: state.isEmpty ? null : state,
      whatsapp: _nullableText(data['whatsapp']),
      isOrganizer: data['isOrganizer'] == true,
      verified: data['verified'] == true,
      listed: data['listed'] == true,
      followersCount: _countOf(data['followersCount']),
      stats: OrganizerPublicStats.fromMap(data['stats']),
    );
  }
}

OrganizerVenue? _venueOf(Object? raw) {
  if (raw is! Map) return null;
  final name = _textOf(raw['name']);
  if (name.isEmpty) return null;
  return OrganizerVenue(
    name: name,
    arenaId: _nullableText(raw['arenaId']),
    city: _nullableText(raw['city']),
    count: _countOf(raw['count']),
  );
}

DateTime? _dateOf(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  return null;
}

String _textOf(Object? value) => value is String ? value.trim() : '';

String? _nullableText(Object? value) {
  final text = _textOf(value);
  return text.isEmpty ? null : text;
}

int _countOf(Object? value) =>
    value is num && value.isFinite && value > 0 ? value.toInt() : 0;
