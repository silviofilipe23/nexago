import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart'
    show ProfessorMutedText;
import '../application/messages_providers.dart';
import '../infrastructure/messages_repository.dart' show MessagesException;
import '../domain/messages.dart';
import 'messages_widgets.dart';

/// Com quem o aluno fala no centro (carregado na abertura da folha).
final centerChatContactsProvider = FutureProvider.autoDispose
    .family<CenterChatContacts, String>(
      (ref, centerId) =>
          ref.watch(messagesRepositoryProvider).getCenterChatContacts(centerId),
    );

/// Aluno inicia a conversa com o centro: o canal com a recepção e a gestão
/// ou um professor das turmas dele. A conversa abre na caixa de Mensagens.
Future<void> showCenterChatContactsSheet(
  BuildContext context, {
  required String centerId,
}) => showProfessorLinksSheet<void>(
  context,
  builder: (_) => _CenterChatContactsSheet(centerId: centerId),
);

class _CenterChatContactsSheet extends ConsumerWidget {
  const _CenterChatContactsSheet({required this.centerId});

  final String centerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(centerChatContactsProvider(centerId));
    final contacts = async.valueOrNull;
    final repo = ref.read(messagesRepositoryProvider);

    void open(Future<String> Function() opener) {
      final outer = Navigator.of(context).context;
      Navigator.of(context).pop();
      openConversationWith(outer, opener, professorMode: false);
    }

    return ProfessorLinksSheetBody(
      key: const Key('center-chat-contacts-sheet'),
      title: 'Falar com o centro',
      subtitle: contacts?.centerName ?? 'Pelo chat do app',
      children: [
        if (contacts == null && async.hasError)
          ProfessorMutedText(
            async.error is MessagesException
                ? (async.error as MessagesException).message
                : 'Não foi possível carregar os contatos do centro.',
          )
        else if (contacts == null)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          )
        else ...[
          if (contacts.desk)
            _ContactRow(
              key: const Key('center-chat-desk'),
              icon: Icons.support_agent_rounded,
              title: 'Recepção e gestão',
              subtitle: 'Matrícula, horários, pagamentos · quem estiver no '
                  'centro responde',
              onTap: () => open(() => repo.openCenterDesk(centerId)),
            ),
          for (final p in contacts.professors)
            _ContactRow(
              key: Key('center-chat-professor-${p.professorUid}'),
              name: p.name,
              photoUrl: p.photoUrl,
              title: p.name,
              subtitle: 'Professor das suas turmas',
              onTap: () => open(
                () => repo.openCenterStaffConversation(centerId, p.professorUid),
              ),
            ),
          if (!contacts.desk && contacts.professors.isEmpty)
            const ProfessorMutedText(
              'O centro ainda não tem equipe no app para conversar.',
            ),
        ],
      ],
    );
  }
}

class _ContactRow extends StatelessWidget {
  const _ContactRow({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.icon,
    this.name,
    this.photoUrl,
  });

  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final IconData? icon;
  final String? name;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          if (icon != null)
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.13),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 20, color: colors.brandText),
            )
          else
            ConversationAvatar(name: name ?? title, photoUrl: photoUrl, size: 38),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          Icon(
            Icons.chevron_right_rounded,
            size: 18,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ],
      ),
    );
  }
}
