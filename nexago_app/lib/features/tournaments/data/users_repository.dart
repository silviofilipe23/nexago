import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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

  Future<List<AppUserProfile>> searchUsersByNicknameOrName(
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

    if (roleFilter != null && roleFilter.isNotEmpty) {
      for (final prefix in nicknameSearchPrefixes(t)) {
        await mergeQuery(
          _users
              .where('role', isEqualTo: roleFilter)
              .where('nickname', isGreaterThanOrEqualTo: prefix)
              .where('nickname', isLessThan: '$prefix\uf8ff'),
        );
      }

      await mergeQuery(
        _users
            .where('role', isEqualTo: roleFilter)
            .where('fullName', isGreaterThanOrEqualTo: t)
            .where('fullName', isLessThan: '$t\uf8ff'),
      );

      final emailTerm = t.toLowerCase();
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

    return byUid.values.take(max).toList();
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
