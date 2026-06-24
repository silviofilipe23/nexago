import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'feedback_page.dart';

/// Abre a página de feedback sobre a tela atual.
Future<T?> pushFeedbackPage<T>(
  BuildContext context,
  FeedbackPage page,
) {
  return Navigator.of(context).push<T>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (context) => page,
    ),
  );
}

/// Substitui a pilha e navega para uma rota após o feedback.
void goToFeedbackPage(
  BuildContext context,
  FeedbackPage page, {
  required String backRoute,
}) {
  Navigator.of(context).push(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (context) => page,
    ),
  ).then((_) {
    if (!context.mounted) return;
    context.go(backRoute);
  });
}

/// Atalhos para os quatro tipos de feedback.
Future<T?> pushSuccessFeedback<T>(
  BuildContext context, {
  required String title,
  String? description,
  String? eyebrow,
  FeedbackAction? primaryAction,
  FeedbackAction? secondaryAction,
  Widget? extraContent,
}) {
  return pushFeedbackPage<T>(
    context,
    FeedbackPage.success(
      title: title,
      description: description,
      eyebrow: eyebrow,
      primaryAction: primaryAction,
      secondaryAction: secondaryAction,
      extraContent: extraContent,
    ),
  );
}

Future<T?> pushErrorFeedback<T>(
  BuildContext context, {
  required String title,
  String? description,
  String? eyebrow,
  FeedbackAction? primaryAction,
  FeedbackAction? secondaryAction,
  Widget? extraContent,
}) {
  return pushFeedbackPage<T>(
    context,
    FeedbackPage.error(
      title: title,
      description: description,
      eyebrow: eyebrow,
      primaryAction: primaryAction,
      secondaryAction: secondaryAction,
      extraContent: extraContent,
    ),
  );
}

Future<T?> pushAlertFeedback<T>(
  BuildContext context, {
  required String title,
  String? description,
  String? eyebrow,
  FeedbackAction? primaryAction,
  FeedbackAction? secondaryAction,
  Widget? extraContent,
}) {
  return pushFeedbackPage<T>(
    context,
    FeedbackPage.alert(
      title: title,
      description: description,
      eyebrow: eyebrow,
      primaryAction: primaryAction,
      secondaryAction: secondaryAction,
      extraContent: extraContent,
    ),
  );
}

Future<T?> pushInfoFeedback<T>(
  BuildContext context, {
  required String title,
  String? description,
  String? eyebrow,
  FeedbackAction? primaryAction,
  FeedbackAction? secondaryAction,
  Widget? extraContent,
}) {
  return pushFeedbackPage<T>(
    context,
    FeedbackPage.info(
      title: title,
      description: description,
      eyebrow: eyebrow,
      primaryAction: primaryAction,
      secondaryAction: secondaryAction,
      extraContent: extraContent,
    ),
  );
}
