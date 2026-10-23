import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../messages/application/messages_providers.dart';
import '../../../messages/domain/messages.dart';
import '../../../messages/presentation/messages_widgets.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../domain/arena_schedule_providers.dart';
import '../widgets/arena_async_state.dart';
import 'widgets/arena_class_atoms.dart';

/// Conversas de quem está logado com os alunos das Aulas de [arenaId] (as
/// que a pessoa abriu pelo "Mensagem"/"Cobrar" ou em que o aluno respondeu).
List<Conversation> arenaClassConversations(
  List<Conversation> inbox, {
  required String arenaId,
  required String uid,
}) =>
    sortInbox([
      for (final c in inbox)
        if (c.isArenaStudent && c.arenaId == arenaId && c.professorUid == uid)
          c,
    ]);

/// Não lidas das conversas com os alunos da arena gerida (ponto no
/// cabeçalho das Aulas).
final arenaClassUnreadMessagesProvider = Provider.autoDispose<int>((ref) {
  final uid = ref.watch(messagesUidProvider);
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
  if (uid.isEmpty || arenaId.isEmpty) return 0;
  final list = arenaClassConversations(
    ref.watch(inboxProvider).valueOrNull ?? const [],
    arenaId: arenaId,
    uid: uid,
  );
  return totalUnread(list, uid);
});

/// Mensagens das Aulas: a caixa da gestão com os alunos (chat do app no
/// lugar do WhatsApp). A conversa começa no aluno ("Mensagem") ou na
/// mensalidade ("Cobrar").
class ArenaClassMessagesPage extends ConsumerWidget {
  const ArenaClassMessagesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(messagesUidProvider);
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
    final inboxAsync = ref.watch(inboxProvider);
    final now = ref.watch(professorLinksClockProvider)();
    final list = arenaClassConversations(
      inboxAsync.valueOrNull ?? const [],
      arenaId: arenaId,
      uid: uid,
    );

    final Widget body;
    if (inboxAsync.hasError && inboxAsync.valueOrNull == null) {
      body = const ArenaErrorState(
        message: 'Não foi possível carregar as mensagens.',
      );
    } else if (inboxAsync.valueOrNull == null) {
      body = const ArenaLoadingState(label: 'Carregando mensagens...');
    } else if (list.isEmpty) {
      body = const Padding(
        key: Key('arena-class-messages-empty'),
        padding: EdgeInsets.only(top: 24),
        child: ArenaEmptyState(
          title: 'Nenhuma conversa ainda',
          message: 'Abra um aluno e toque em "Mensagem", ou use "Cobrar" '
              'numa mensalidade — a conversa fica aqui e o aluno responde '
              'pelo app NexaGO.',
          icon: Icons.forum_outlined,
        ),
      );
    } else {
      body = ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          for (final c in list)
            ConversationTile(
              key: Key('arena-class-conversation-${c.id}'),
              conversation: c,
              viewerUid: uid,
              now: now,
              onTap: () => context.pushNamed(
                AppRouteNames.arenaClassConversation,
                pathParameters: {'conversationId': c.id},
              ),
            ),
        ],
      );
    }

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ArenaClassHeader(
              eyebrow: 'AULAS',
              title: 'Mensagens',
              subtitle: 'CONVERSAS COM OS ALUNOS',
              onBack: () => popOrGo(context, AppRoutes.arenaClasses),
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}
