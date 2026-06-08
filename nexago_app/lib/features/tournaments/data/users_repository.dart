import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/user_roles.dart';
import '../../../core/search/search_keywords.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../domain/app_user_profile.dart';
import '../domain/partner_search_logic.dart';

class UsersRepositoryException implements Exception {
  UsersRepositoryException(this.message);
  final String message;

  @override
  String toString() => message;
}

class UsersRepository {
  UsersRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _users =>
      _firestore.collection('users');

  Future<AppUserProfile?> getUserById(String uid) async {
    if (uid.trim().isEmpty) return null;
    final snap = await _users.doc(uid).get();
    if (!snap.exists) return null;
    return AppUserProfile.fromFirestore(snap);
  }

  /// Busca atletas por prefixo de palavra (`keywords` + `hasAthleteRole`).
  Future<List<AppUserProfile>> searchAthletesByKeywords(
    String term, {
    int max = 25,
  }) async {
    final token = normalizeSearchTerm(term);
    if (!isSearchTermLongEnough(term)) return [];

    try {
      final snap = await _users
          .where('hasAthleteRole', isEqualTo: true)
          .where('keywords', arrayContains: token)
          .limit(max)
          .get();
      return _finalizeAthleteResults(
        snap.docs.map(AppUserProfile.fromFirestore),
        max: max,
      );
    } catch (e, stackTrace) {
      if (kDebugMode) {
        debugPrint('UsersRepository.searchAthletesByKeywords failed: $e');
        debugPrint('$stackTrace');
      }
      return _searchUsersByNicknameOrNameLegacy(
        term,
        max: max,
        roleFilter: kAthleteAppRole,
      );
    }
  }

  /// Busca organizadores por prefixo de palavra (`keywords` + `hasOrganizerRole`).
  Future<List<AppUserProfile>> searchOrganizersByKeywords(
    String term, {
    int max = 25,
  }) async {
    final token = normalizeSearchTerm(term);
    if (!isSearchTermLongEnough(term)) return [];

    try {
      final snap = await _users
          .where('hasOrganizerRole', isEqualTo: true)
          .where('keywords', arrayContains: token)
          .limit(max)
          .get();
      return sortPartnersForDisplay(
        snap.docs
            .map(AppUserProfile.fromFirestore)
            .where(isPartnerListableProfile)
            .take(max)
            .toList(),
      );
    } catch (e, stackTrace) {
      if (kDebugMode) {
        debugPrint('UsersRepository.searchOrganizersByKeywords failed: $e');
        debugPrint('$stackTrace');
      }
      return [];
    }
  }

  Future<List<AppUserProfile>> searchUsersByNicknameOrName(
    String term, {
    int max = 10,
    String? roleFilter = 'athlete',
  }) async {
    if (roleFilter == kAthleteAppRole) {
      final keywordResults = await searchAthletesByKeywords(term, max: max);
      if (keywordResults.isNotEmpty) return keywordResults;
    }
    return _searchUsersByNicknameOrNameLegacy(
      term,
      max: max,
      roleFilter: roleFilter,
    );
  }

  Future<List<AppUserProfile>> _searchUsersByNicknameOrNameLegacy(
    String term, {
    int max = 10,
    String? roleFilter = 'athlete',
  }) async {
    final t = term.trim();
    if (t.isEmpty) return [];

    final byUid = <String, AppUserProfile>{};

    Future<void> mergeQuery(Query<Map<String, dynamic>> query) async {
      try {
        final snap = await query.limit(max).get();
        for (final doc in snap.docs) {
          byUid[doc.id] = AppUserProfile.fromFirestore(doc);
        }
      } catch (_) {
        // Falha em uma query não cancela as demais (paridade web).
      }
    }

    Future<void> mergeAthleteRoleQueries({
      required Query<Map<String, dynamic>> legacyRoleQuery,
      required Query<Map<String, dynamic>> rolesArrayQuery,
    }) async {
      await mergeQuery(rolesArrayQuery);
      await mergeQuery(legacyRoleQuery);
    }

    if (roleFilter != null && roleFilter.isNotEmpty) {
      final useMultiRoleAthleteFilter = roleFilter == kAthleteAppRole;

      for (final prefix in nicknameSearchPrefixes(t)) {
        if (useMultiRoleAthleteFilter) {
          await mergeAthleteRoleQueries(
            legacyRoleQuery: _users
                .where('role', isEqualTo: kAthleteAppRole)
                .where('nickname', isGreaterThanOrEqualTo: prefix)
                .where('nickname', isLessThan: '$prefix\uf8ff'),
            rolesArrayQuery: _users
                .where('roles', arrayContains: kAthleteAppRole)
                .where('nickname', isGreaterThanOrEqualTo: prefix)
                .where('nickname', isLessThan: '$prefix\uf8ff'),
          );
        } else {
          await mergeQuery(
            _users
                .where('role', isEqualTo: roleFilter)
                .where('nickname', isGreaterThanOrEqualTo: prefix)
                .where('nickname', isLessThan: '$prefix\uf8ff'),
          );
        }
      }

      if (useMultiRoleAthleteFilter) {
        await mergeAthleteRoleQueries(
          legacyRoleQuery: _users
              .where('role', isEqualTo: kAthleteAppRole)
              .where('fullName', isGreaterThanOrEqualTo: t)
              .where('fullName', isLessThan: '$t\uf8ff'),
          rolesArrayQuery: _users
              .where('roles', arrayContains: kAthleteAppRole)
              .where('fullName', isGreaterThanOrEqualTo: t)
              .where('fullName', isLessThan: '$t\uf8ff'),
        );
      } else {
        await mergeQuery(
          _users
              .where('role', isEqualTo: roleFilter)
              .where('fullName', isGreaterThanOrEqualTo: t)
              .where('fullName', isLessThan: '$t\uf8ff'),
        );
      }

      final emailTerm = t.toLowerCase();
      if (useMultiRoleAthleteFilter) {
        await mergeAthleteRoleQueries(
          legacyRoleQuery: _users
              .where('role', isEqualTo: kAthleteAppRole)
              .where('email', isGreaterThanOrEqualTo: emailTerm)
              .where('email', isLessThan: '$emailTerm\uf8ff'),
          rolesArrayQuery: _users
              .where('roles', arrayContains: kAthleteAppRole)
              .where('email', isGreaterThanOrEqualTo: emailTerm)
              .where('email', isLessThan: '$emailTerm\uf8ff'),
        );
        if (emailTerm != t) {
          await mergeAthleteRoleQueries(
            legacyRoleQuery: _users
                .where('role', isEqualTo: kAthleteAppRole)
                .where('email', isGreaterThanOrEqualTo: t)
                .where('email', isLessThan: '$t\uf8ff'),
            rolesArrayQuery: _users
                .where('roles', arrayContains: kAthleteAppRole)
                .where('email', isGreaterThanOrEqualTo: t)
                .where('email', isLessThan: '$t\uf8ff'),
          );
        }
      } else {
        await mergeQuery(
          _users
              .where('role', isEqualTo: roleFilter)
              .where('email', isGreaterThanOrEqualTo: emailTerm)
              .where('email', isLessThan: '$emailTerm\uf8ff'),
        );
        if (emailTerm != t) {
          await mergeQuery(
            _users
                .where('role', isEqualTo: roleFilter)
                .where('email', isGreaterThanOrEqualTo: t)
                .where('email', isLessThan: '$t\uf8ff'),
          );
        }
      }
    }

    var results = byUid.values.toList();
    if (roleFilter == kAthleteAppRole) {
      results = results.where(appUserHasAthleteRole).toList();
    }
    return results.take(max).toList();
  }

  /// Lista atletas em `users/` (prioriza `hasAthleteRole`, com fallback legado).
  Future<List<AppUserProfile>> listAthleteProfiles({
    int pageSize = 200,
    int? maxResults,
  }) async {
    final byUid = <String, AppUserProfile>{};

    await _paginateProfiles(
      query: _users.where('hasAthleteRole', isEqualTo: true),
      byUid: byUid,
      pageSize: pageSize,
      debugLabel: 'hasAthleteRole',
      maxResults: maxResults,
    );

    if (byUid.isEmpty) {
      await _paginateProfiles(
        query: _users.where('roles', arrayContains: kAthleteAppRole),
        byUid: byUid,
        pageSize: pageSize,
        debugLabel: 'roles[] athlete',
        maxResults: maxResults,
      );
      await _paginateProfiles(
        query: _users.where('role', isEqualTo: kAthleteAppRole),
        byUid: byUid,
        pageSize: pageSize,
        debugLabel: 'role athlete',
        maxResults: maxResults,
      );
    }

    return _finalizeAthleteResults(byUid.values);
  }

  List<AppUserProfile> _finalizeAthleteResults(
    Iterable<AppUserProfile> users, {
    int? max,
  }) {
    var results = users
        .where(appUserHasAthleteRole)
        .where(isPartnerListableProfile)
        .toList();
    results = sortPartnersForDisplay(results);
    if (max != null && results.length > max) {
      return results.take(max).toList();
    }
    return results;
  }

  Future<void> _paginateProfiles({
    required Query<Map<String, dynamic>> query,
    required Map<String, AppUserProfile> byUid,
    required int pageSize,
    String debugLabel = 'users',
    int? maxResults,
  }) async {
    DocumentSnapshot<Map<String, dynamic>>? lastDoc;

    while (true) {
      if (maxResults != null && byUid.length >= maxResults) return;
      try {
        final remaining = maxResults == null
            ? pageSize
            : (maxResults - byUid.length).clamp(1, pageSize);
        var pageQuery = query.limit(remaining);
        if (lastDoc != null) {
          pageQuery = pageQuery.startAfterDocument(lastDoc);
        }
        final snap = await pageQuery.get();
        if (snap.docs.isEmpty) return;

        for (final doc in snap.docs) {
          byUid[doc.id] = AppUserProfile.fromFirestore(doc);
          if (maxResults != null && byUid.length >= maxResults) return;
        }

        if (snap.docs.length < remaining) return;
        lastDoc = snap.docs.last;
      } catch (e, stackTrace) {
        if (kDebugMode) {
          debugPrint(
            'UsersRepository._paginateProfiles($debugLabel) failed: $e',
          );
          debugPrint('$stackTrace');
        }
        return;
      }
    }
  }

  Future<String> createMinimalUserProfile({
    required String email,
    required String fullName,
    required String gender,
    required String invitedByUid,
    String role = 'athlete',
    String partnerInviteStatus = 'pending',
  }) async {
    final normalizedEmail = email.trim().toLowerCase();
    final name = fullName.trim();
    if (normalizedEmail.isEmpty || name.isEmpty) {
      throw UsersRepositoryException('E-mail e nome são obrigatórios.');
    }
    if (gender.trim().isEmpty) {
      throw UsersRepositoryException('Gênero é obrigatório.');
    }

    final existing = await _users
        .where('email', isEqualTo: normalizedEmail)
        .limit(1)
        .get();
    if (existing.docs.isNotEmpty) {
      throw UsersRepositoryException(
        'Este e-mail já está vinculado a outro usuário.',
      );
    }

    final uid = _generateUid();
    await _users.doc(uid).set({
      'email': normalizedEmail,
      'fullName': name,
      'gender': gender.trim(),
      'role': role,
      'createdAt': FieldValue.serverTimestamp(),
      'partnerInviteStatus': partnerInviteStatus,
      'invitedByUid': invitedByUid,
      'invitedAt': FieldValue.serverTimestamp(),
    });

    final created = await getUserById(uid);
    if (created == null) {
      throw UsersRepositoryException(
        'Não foi possível criar o perfil do parceiro.',
      );
    }
    return uid;
  }

  String _generateUid() {
    const chars =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    final random = Random.secure();
    return List.generate(
      28,
      (_) => chars[random.nextInt(chars.length)],
    ).join();
  }
}

final usersRepositoryProvider = Provider<UsersRepository>((ref) {
  return UsersRepository(ref.watch(firestoreProvider));
});
