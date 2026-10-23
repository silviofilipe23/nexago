import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../messages/infrastructure/messages_repository.dart';
import '../../../../messages/presentation/messages_widgets.dart';
import 'arena_class_form_atoms.dart';

/// O aluno fala pelo chat do app? Só quem tem conta NexaGO ([athleteId]).
bool arenaClassStudentHasChat(String? athleteId) =>
    athleteId != null && athleteId.trim().isNotEmpty;

/// Fala com o aluno das Aulas: com conta, abre (ou retoma) a conversa da
/// gestão com ele no chat do app, com [message] no composer (o "Cobrar"
/// leva a mensagem e o link da fatura; quem cobra revisa e envia). Sem
/// conta, segue o WhatsApp do [phone] com a mesma mensagem.
Future<void> contactArenaClassStudent(
  BuildContext context,
  WidgetRef ref, {
  required String arenaId,
  required String? athleteId,
  required String? phone,
  String message = '',
}) {
  if (arenaClassStudentHasChat(athleteId) && arenaId.isNotEmpty) {
    final repo = ref.read(messagesRepositoryProvider);
    return openConversationWith(
      context,
      () => repo.openArenaStudentConversation(arenaId, athleteId!.trim()),
      professorMode: false,
      arenaClasses: true,
      draft: message.isEmpty ? null : message,
    );
  }
  return openArenaClassWhatsApp(context, phone: phone, message: message);
}
