import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

import '../domain/tournament_detail_logic.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_listing_status.dart';
import '../domain/tournament_payment_mode.dart';
import '../domain/tournament_uniform_selection.dart';

/// Mapeia `tournaments/{id}` (ou legado artifacts) → [DiscoveryTournament] / [TournamentDetail].
///
/// Campos recomendados no Firestore: `name`, `city`, `location`/`locationName`,
/// `startAt`, `endAt`, `dateLabel`, `format`, `capacity`, `enrolledCount`,
/// `featured`, `liveMatchesNow`, `listingStatus`, `leagueId`, `categories[]`, etc.
abstract final class TournamentDocumentMapper {
  TournamentDocumentMapper._();

  static final _dateFmt = DateFormat('dd/MM', 'pt_BR');

  static DiscoveryTournament? fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    if (!doc.exists) return null;
    final data = doc.data();
    if (data == null) return null;
    return fromMap(doc.id, data);
  }

  static TournamentDetail? detailFromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    if (!doc.exists) return null;
    final data = doc.data();
    if (data == null) return null;
    return detailFromMap(doc.id, data);
  }

  static DiscoveryTournament fromMap(String id, Map<String, dynamic> data) {
    return detailFromMap(id, data).toDiscovery();
  }

  static TournamentDetail detailFromMap(String id, Map<String, dynamic> data) {
    final offers = _parseCategoryOffers(
      data['categories'],
      categoryOpsRaw: data['categoryOps'],
      tournamentUniformRequired: data['uniformRequired'] == true,
      tournamentUniformNumberOnShirt: data['uniformNumberOnShirt'] == true,
      tournamentUniformNameOnShirt: data['uniformNameOnShirt'] == true,
      tournamentWaitlistEnabled: data['waitlistEnabled'] as bool? ?? true,
    );
    final genderCats = _genderCatsFromOffers(offers);

    final capacity = _int(data['capacity']) ?? 0;
    final enrolled = _int(data['enrolledCount']) ?? 0;
    var spotsTotal = capacity > 0
        ? capacity
        : offers.fold<int>(0, (m, o) => m + o.spotsTotal);
    if (spotsTotal <= 0 && offers.isNotEmpty) spotsTotal = 32;
    var spotsLeft = spotsTotal > 0
        ? (spotsTotal - enrolled).clamp(0, spotsTotal)
        : 0;
    if (offers.isNotEmpty) {
      final offerMins = offers
          .map((o) => o.spotsLeft)
          .where((n) => n >= 0)
          .toList();
      if (offerMins.isNotEmpty) {
        spotsLeft = offerMins.reduce((a, b) => a < b ? a : b);
      }
    }

    final startAt = _timestamp(data['startAt'] ?? data['startDate']);
    final endAt = _timestamp(data['endAt'] ?? data['endDate']);
    final minFee = offers.isEmpty
        ? (_num(data['entryFee']) ?? 0)
        : offers
                  .map((o) => o.entryFee)
                  .where((f) => f > 0)
                  .fold<double?>(
                    null,
                    (min, f) => min == null || f < min ? f : min,
                  ) ??
              0;

    final listingStatusRaw = _str(data['listingStatus'] ?? data['status']);

    final status = resolveListingStatus(
      listingStatusRaw: listingStatusRaw,
      startAt: startAt,
      endAt: endAt,
      spotsLeft: spotsLeft,
      liveMatchesNow: _int(data['liveMatchesNow']) ?? 0,
    );

    final dateLabel =
        _str(data['dateLabel']) ?? _formatDateRange(startAt, endAt);

    final location =
        _str(data['locationName']) ??
        _str(data['location'] ?? data['venueName']) ??
        'Local a confirmar';

    return TournamentDetail(
      id: id,
      name: _str(data['name']) ?? 'Torneio',
      location: location,
      city: _str(data['city']) ?? 'Cidade a confirmar',
      dateLabel: dateLabel,
      startDate: startAt ?? DateTime.now(),
      endDate: endAt,
      categories: genderCats.isNotEmpty
          ? genderCats
          : const [TournamentGenderCat.mix],
      format: _parseFormat(_str(data['format'])),
      priceLabel: _formatBrl(minFee),
      priceValue: minFee,
      spotsLeft: spotsLeft,
      spotsTotal: spotsTotal,
      status: status,
      featured: data['featured'] == true,
      enrolledCount: enrolled,
      liveMatchesNow: _int(data['liveMatchesNow']) ?? 0,
      offerEndsAt: _timestamp(data['offerEndsAt']),
      leagueId: _str(data['leagueId']),
      leagueStageId: _str(data['leagueStageId']),
      imageUrl: _imageUrl(data),
      categoryOffers: offers,
      locationAddress: _str(data['locationAddress']),
      regulationsText: _str(data['regulationsText']),
      managerId: _str(data['managerId']),
      leagueStageOrder: _int(data['leagueStageOrder']),
      leagueStageName: _str(data['leagueStageName']),
      tournamentPrizes: _parsePrizes(data['prizes']),
      createdAt: _timestamp(data['createdAt'] ?? data['created_at']),
      registrationOpensAt: _timestamp(data['registrationOpensAt']),
      registrationClosesAt: _timestamp(data['registrationClosesAt']),
      listingStatusRaw: listingStatusRaw,
      sport: _str(data['sport']) ?? '',
      paymentMode: parseTournamentPaymentMode(data['paymentMode'] as String?),
      organizerPixKey: _pixField(data['organizerPix'], 'key'),
      organizerPixKeyType: _pixField(data['organizerPix'], 'keyType'),
      organizerPixRecipientName: _pixField(data['organizerPix'], 'recipientName'),
      organizerPixCity: _pixField(data['organizerPix'], 'city'),
      requireFormedPair: data['requireFormedPair'] == true,
    );
  }

  static String _pixField(dynamic raw, String key) {
    if (raw is! Map) return '';
    return _str(raw[key]) ?? '';
  }

  static int? _ageRestrictionInt(dynamic raw, String key) {
    if (raw is! Map) return null;
    final value = raw[key];
    return value is num ? value.toInt() : null;
  }

  /// `bracketFormatOverride` de `tournaments/{id}.categoryOps[categoryId]`.
  ///
  /// Vazio quando a chave ainda não foi publicada — aí o formato declarado na
  /// categoria segue valendo.
  static String _categoryOpsOverride(
    dynamic categoryOpsRaw,
    String categoryId,
  ) {
    if (categoryOpsRaw is! Map) return '';
    final entry = categoryOpsRaw[categoryId];
    if (entry is! Map) return '';
    return _str(entry['bracketFormatOverride'])?.trim() ?? '';
  }

  /// `bracketStatus` publicado/concluído de `categoryOps[categoryId]` — gate
  /// client-side da substituição de atleta.
  static bool _categoryOpsBracketPublished(
    dynamic categoryOpsRaw,
    String categoryId,
  ) {
    if (categoryOpsRaw is! Map) return false;
    final entry = categoryOpsRaw[categoryId];
    if (entry is! Map) return false;
    final status = _str(entry['bracketStatus'])?.trim() ?? '';
    return status == 'published' || status == 'completed';
  }

  static List<TournamentCategoryOffer> _parseCategoryOffers(
    dynamic raw, {
    dynamic categoryOpsRaw,
    bool tournamentUniformRequired = false,
    bool tournamentUniformNumberOnShirt = false,
    bool tournamentUniformNameOnShirt = false,
    bool tournamentWaitlistEnabled = true,
  }) {
    final offers = <TournamentCategoryOffer>[];
    if (raw is! List) return offers;

    for (final item in raw) {
      if (item is! Map) continue;
      final map = Map<String, dynamic>.from(item);
      final name = _str(map['categoryName'] ?? map['name']) ?? 'Categoria';
      final categoryId = _str(map['id'] ?? map['categoryId'])?.trim();
      final offerId = categoryId != null && categoryId.isNotEmpty
          ? categoryId
          : name;

      // O formato com que a chave foi GERADA vence o que a categoria declarou
      // — ver `effectiveBracketFormat`. Resolvido aqui, no mapper, para que
      // TODA a superfície do atleta (nav do Focus, card de vidas, aba de
      // chave, detalhe) enxergue o mesmo formato sem cada tela repetir a regra.
      final bracketFormat = effectiveBracketFormat(
        declared: _str(map['bracketFormat']) ?? '',
        override: _categoryOpsOverride(categoryOpsRaw, offerId),
      );
      final entryFee = _num(map['entryFee']) ?? 0;
      final maxTeams = _int(map['maxTeams']) ?? 0;
      final spotsTotalLegacy =
          _int(map['spotsTotal'] ?? map['capacity']) ?? 0;
      final capacity = maxTeams > 0 ? maxTeams : spotsTotalLegacy;
      final spotsLeft =
          _int(map['spotsLeft']) ?? (capacity > 0 ? capacity : 0);

      var uniformType = _str(map['uniformType']);
      var uniformNameOnShirt = map['uniformNameOnShirt'] == true;
      var uniformNumberOnShirt = map['uniformNumberOnShirt'] == true;

      final preliminaryOffer = TournamentCategoryOffer(
        id: offerId,
        name: name,
        entryFee: entryFee,
        spotsLeft: spotsLeft,
        maxTeams: capacity,
        spotsTotal: capacity,
        level: _str(map['level']) ?? '',
        minLevel: _str(map['minLevel']) ?? '',
        ageBand: _str(map['ageBand']) ?? '',
        ageRestrictionMode: _pixField(map['ageRestriction'], 'mode'),
        ageMinYears: _ageRestrictionInt(map['ageRestriction'], 'minAge'),
        ageMaxYears: _ageRestrictionInt(map['ageRestriction'], 'maxAge'),
        ageReference: _pixField(map['ageRestriction'], 'reference'),
        genderType: _str(map['genderType']) ?? '',
        bracketFormat: bracketFormat,
        registrationClosed: map['registrationClosed'] == true,
        isCompleted: map['isCompleted'] == true,
        prizes: _parseCategoryPrizes(map['prizes']),
        uniformType: uniformType,
        uniformNameOnShirt: uniformNameOnShirt,
        uniformNumberOnShirt: uniformNumberOnShirt,
        uniformSizeOptionsTop: _stringList(map['uniformSizeOptionsTop']),
        uniformSizeOptionsShorts:
            _stringList(map['uniformSizeOptionsShorts']),
        waitlistEnabled: tournamentWaitlistEnabled,
        qualifiersPerGroup: (_int(map['qualifiersPerGroup']) ?? 2).clamp(1, 99),
      );

      if (!categoryRequiresUniform(preliminaryOffer) &&
          tournamentUniformRequired) {
        uniformType = 'top_only';
        uniformNumberOnShirt = tournamentUniformNumberOnShirt;
        uniformNameOnShirt = tournamentUniformNameOnShirt;
      }

      // Categoria de EQUIPE (trio/quarteto/quinteto) gravada pelo portal:
      // teamSize 3–5, genderMode free/composition e a composição exata.
      final teamSizeRaw = _int(map['teamSize']);
      final teamSize =
          teamSizeRaw != null && teamSizeRaw >= 3 && teamSizeRaw <= 5
          ? teamSizeRaw
          : null;
      final genderFree =
          teamSize != null && _str(map['genderMode']) == 'free';
      final compositionRaw = map['genderComposition'];
      final compositionMen = compositionRaw is Map
          ? _int(compositionRaw['men'])
          : null;
      final compositionWomen = compositionRaw is Map
          ? _int(compositionRaw['women'])
          : null;
      final compositionValid =
          teamSize != null &&
          !genderFree &&
          compositionMen != null &&
          compositionWomen != null &&
          compositionMen + compositionWomen == teamSize;

      offers.add(
        TournamentCategoryOffer(
          id: offerId,
          name: name,
          entryFee: entryFee,
          spotsLeft: spotsLeft,
          maxTeams: capacity,
          spotsTotal: capacity,
          level: _str(map['level']) ?? '',
          minLevel: _str(map['minLevel']) ?? '',
          ageBand: _str(map['ageBand']) ?? '',
          ageRestrictionMode: _pixField(map['ageRestriction'], 'mode'),
          ageMinYears: _ageRestrictionInt(map['ageRestriction'], 'minAge'),
          ageMaxYears: _ageRestrictionInt(map['ageRestriction'], 'maxAge'),
          ageReference: _pixField(map['ageRestriction'], 'reference'),
          genderType: _str(map['genderType']) ?? '',
          bracketFormat: bracketFormat,
          registrationClosed: map['registrationClosed'] == true,
          isCompleted: map['isCompleted'] == true,
          prizes: _parseCategoryPrizes(map['prizes']),
          uniformType: uniformType,
          uniformNameOnShirt: uniformNameOnShirt,
          uniformNumberOnShirt: uniformNumberOnShirt,
          uniformSizeOptionsTop: _stringList(map['uniformSizeOptionsTop']),
          uniformSizeOptionsShorts:
              _stringList(map['uniformSizeOptionsShorts']),
          waitlistEnabled: tournamentWaitlistEnabled,
          qualifiersPerGroup:
              (_int(map['qualifiersPerGroup']) ?? 2).clamp(1, 99),
          teamSize: teamSize,
          genderFree: genderFree,
          genderCompositionMen: compositionValid ? compositionMen : null,
          genderCompositionWomen: compositionValid ? compositionWomen : null,
          bracketPublished: _categoryOpsBracketPublished(categoryOpsRaw, offerId),
        ),
      );
    }
    return offers;
  }

  static List<TournamentCategoryPrize> _parseCategoryPrizes(dynamic raw) {
    return _parsePrizeList(raw);
  }

  static List<TournamentPrize> _parsePrizes(dynamic raw) {
    final items = _parsePrizeList(raw);
    return items
        .map(
          (p) => TournamentPrize(
            position: p.position,
            value: p.value,
            label: p.label,
          ),
        )
        .toList();
  }

  /// Prêmios em `categories[].prizes` ou `prizes[]` no torneio.
  ///
  /// No volley-track, `value` é gravado como **string** (`"2000"`, `"R$ 2.000,00"`).
  static List<TournamentCategoryPrize> _parsePrizeList(dynamic raw) {
    if (raw is! List) return const [];
    final out = <TournamentCategoryPrize>[];
    for (final item in raw) {
      if (item is! Map) continue;
      final map = Map<String, dynamic>.from(item);
      final position =
          _str(map['position']) ??
          _str(map['place']) ??
          _str(map['rank']) ??
          '${out.length + 1}';
      final value = _parseMoneyValue(map['value'] ?? map['amount']) ?? 0;
      if (position.isEmpty && value <= 0) continue;
      out.add(
        TournamentCategoryPrize(
          position: position,
          value: value,
          label: _str(map['label'] ?? map['description']),
        ),
      );
    }
    return out;
  }

  static double? _parseMoneyValue(dynamic v) {
    if (v is num) return v.toDouble();
    if (v is! String) return null;
    var s = v.trim();
    if (s.isEmpty) return null;

    s = s.replaceAll('R\$', '').replaceAll(r'R$', '').trim();
    s = s.replaceAll(' ', '');

    if (s.contains(',')) {
      s = s.replaceAll('.', '').replaceAll(',', '.');
    }

    return double.tryParse(s);
  }

  static List<TournamentGenderCat> _genderCatsFromOffers(
    List<TournamentCategoryOffer> offers,
  ) {
    final genderCats = <TournamentGenderCat>[];
    for (final o in offers) {
      final g = _parseGender(o.name) ?? _parseGender(o.genderType);
      if (g != null && !genderCats.contains(g)) genderCats.add(g);
    }
    return genderCats;
  }

  static String? _imageUrl(Map<String, dynamic> data) {
    for (final key in [
      'coverUrl',
      'imageUrl',
      'coverImageUrl',
      'posterUrl',
      'thumbnailUrl',
    ]) {
      final v = _str(data[key]);
      if (v != null) return v;
    }
    return null;
  }

  static TournamentGenderCat? _parseGender(String name) {
    final n = name.toLowerCase().trim();
    if (n.isEmpty) return null;
    if (n == 'm' ||
        n == 'male' ||
        n == 'masculino' ||
        n.contains('masc')) {
      return TournamentGenderCat.m;
    }
    if (n == 'f' ||
        n == 'female' ||
        n == 'feminino' ||
        n.contains('fem')) {
      return TournamentGenderCat.f;
    }
    if (n == 'mixed' ||
        n == 'misto' ||
        n.contains('misto') ||
        n.contains('mix')) {
      return TournamentGenderCat.mix;
    }
    return null;
  }

  static TournamentFormat _parseFormat(String? raw) {
    final v = raw?.toLowerCase() ?? '';
    if (v.contains('individual')) return TournamentFormat.individual;
    return TournamentFormat.dupla;
  }

  static String _formatBrl(double value) {
    if (value <= 0) return r'R$ —';
    return 'R\$ ${value.toStringAsFixed(value.truncateToDouble() == value ? 0 : 2)}';
  }

  static String _formatDateRange(DateTime? start, DateTime? end) {
    if (start == null) return 'Data a confirmar';
    if (end == null) return _dateFmt.format(start);
    if (start.year == end.year &&
        start.month == end.month &&
        start.day == end.day) {
      return _dateFmt.format(start);
    }
    return '${_dateFmt.format(start)} – ${_dateFmt.format(end)}';
  }

  static List<String> _stringList(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .map((e) => e?.toString().trim() ?? '')
        .where((s) => s.isNotEmpty)
        .toList();
  }

  static String? _str(dynamic v) {
    if (v is String && v.trim().isNotEmpty) return v.trim();
    return null;
  }

  static int? _int(dynamic v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    return null;
  }

  static double? _num(dynamic v) {
    if (v is num) return v.toDouble();
    return null;
  }

  static DateTime? _timestamp(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    if (v is String) return DateTime.tryParse(v);
    return null;
  }
}
