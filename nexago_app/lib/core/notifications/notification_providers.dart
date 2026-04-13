import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_app_installations/firebase_app_installations.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'notification_service.dart';

final firebaseMessagingProvider = Provider<FirebaseMessaging>((ref) {
  return FirebaseMessaging.instance;
});

final firebaseInstallationsProvider = Provider<FirebaseInstallations>((ref) {
  return FirebaseInstallations.instance;
});

final notificationServiceProvider = Provider<NotificationService>((ref) {
  final service = NotificationService(
    ref.watch(firebaseMessagingProvider),
    FirebaseFirestore.instance,
    ref.watch(firebaseInstallationsProvider),
  );
  ref.onDispose(() {
    service.dispose();
  });
  return service;
});
