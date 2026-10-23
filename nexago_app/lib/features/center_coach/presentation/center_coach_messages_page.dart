import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../messages/application/messages_providers.dart';
import '../../messages/domain/messages.dart';
import '../../messages/presentation/messages_widgets.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import 'widgets/center_mode_tab_scope.dart';

/// Conversas da equipe com os alunos de [centerId] (as que a pessoa abriu
/// ou recebeu). O chat substitui o WhatsApp: começa pelo perfil do aluno.
List<Conversation> centerConversations(
  List<Conversation> inbox, {
  required String centerId,
  required String uid,
}) => sortInbox([
  for (final c in inbox)
    if (c.isCenter && c.centerId == centerId && c.professorUid == uid) c,
]);

/// Mensagens do centro: a caixa da equipe com os alunos.
class CenterCoachMessagesPage extends ConsumerWidget {
  const CenterCoachMessagesPage({super.key, required this.centerId});

  final String centerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(messagesUidProvider);
    final member = ref.watch(centerMembershipProvider(centerId));
    final inboxAsync = ref.watch(inboxProvider);
    final now = ref.watch(professorLinksClockProvider)();
    final list = centerConversations(
      inboxAsync.valueOrNull ?? const [],
      centerId: centerId,
      uid: uid,
    );

    return ProfessorLinksScaffold(
      title: 'Mensagens',
      subtitle: member?.centerName.toUpperCase(),
      showBack: !CenterModeTabScope.of(context),
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: ListView(
        padding: centerListPadding(context),
        children: [
          if (inboxAsync.hasError && inboxAsync.valueOrNull == null)
            ProfessorRetryCard(
              message: 'Não foi possível carregar as mensagens.',
              onRetry: () => ref.invalidate(inboxProvider),
            )
          else if (inboxAsync.valueOrNull == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else if (list.isEmpty)
            const ProfessorLinksCard(
              key: Key('center-messages-empty'),
              child: ProfessorMutedText(
                'Nenhuma conversa ainda. Abra um aluno em Alunos e toque em '
                '"Mensagem" — a conversa fica aqui e o aluno responde pelo '
                'app NexaGO.',
              ),
            )
          else
            for (final c in list)
              ConversationTile(
                key: Key('center-conversation-${c.id}'),
                conversation: c,
                viewerUid: uid,
                now: now,
                onTap: () => context.pushNamed(
                  AppRouteNames.centerCoachConversation,
                  pathParameters: {
                    'centerId': centerId,
                    'conversationId': c.id,
                  },
                ),
              ),
        ],
      ),
    );
  }
}
