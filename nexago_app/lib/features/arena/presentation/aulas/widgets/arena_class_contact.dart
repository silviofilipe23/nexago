import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../arenas/domain/arena_booking_success_actions.dart';
import '../../../../messages/infrastructure/messages_repository.dart';
import '../../../../messages/presentation/messages_widgets.dart';
import '../../../../professor_links/presentation/widgets/professor_links_ui.dart';
import 'arena_class_form_atoms.dart';

/// O aluno fala pelo chat do app? Só quem tem conta NexaGO ([athleteId]).
bool arenaClassStudentHasChat(String? athleteId) =>
    athleteId != null && athleteId.trim().isNotEmpty;

/// Há um telefone que abre o WhatsApp?
bool arenaClassStudentHasWhatsApp(String? phone) =>
    ArenaBookingSuccessActions.buildWhatsAppUrl(phone: phone, message: '') !=
    null;

/// Por onde falar com o aluno.
enum ArenaClassChannel { chat, whatsApp }

/// Fala com o aluno das Aulas, com [message] pronta (o "Cobrar" leva a
/// mensagem e o link da fatura; quem cobra revisa e envia). [via] escolhe o
/// canal; sem ele, com conta NexaGO E telefone a pessoa escolhe entre o chat
/// do app e o WhatsApp; com um só, vai por ele.
Future<void> contactArenaClassStudent(
  BuildContext context,
  WidgetRef ref, {
  required String arenaId,
  required String? athleteId,
  required String? phone,
  String message = '',
  ArenaClassChannel? via,
}) async {
  final chat = arenaClassStudentHasChat(athleteId) && arenaId.isNotEmpty;
  final channel =
      via ??
      (chat && arenaClassStudentHasWhatsApp(phone)
          ? await pickArenaClassChannel(context)
          : chat
          ? ArenaClassChannel.chat
          : ArenaClassChannel.whatsApp);
  if (channel == null || !context.mounted) return;
  if (channel == ArenaClassChannel.chat && chat) {
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

/// "Enviar por": chat do app ou WhatsApp (`null` = desistiu).
Future<ArenaClassChannel?> pickArenaClassChannel(BuildContext context) =>
    showProfessorLinksSheet<ArenaClassChannel>(
      context,
      builder: (sheet) => ProfessorLinksSheetBody(
        key: const Key('arena-class-channel-sheet'),
        title: 'Enviar por',
        children: [
          ProfessorLinksSheetRow(
            key: const Key('arena-class-channel-chat'),
            icon: Icons.forum_outlined,
            title: 'Chat do app',
            subtitle: 'Fica na conversa com o aluno no NexaGO',
            onTap: () => Navigator.of(sheet).pop(ArenaClassChannel.chat),
          ),
          ProfessorLinksSheetRow(
            key: const Key('arena-class-channel-whatsapp'),
            icon: Icons.chat_bubble_outline_rounded,
            title: 'WhatsApp',
            subtitle: 'Abre o WhatsApp com a mensagem pronta',
            onTap: () => Navigator.of(sheet).pop(ArenaClassChannel.whatsApp),
          ),
        ],
      ),
    );
