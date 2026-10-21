import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../domain/messages.dart';
import '../infrastructure/messages_repository.dart';

/// Peças das Mensagens (protótipo `pa-app-msg.jsx`).

/// Abre a conversa ([open] chama a callable que cria/acha) e empurra a tela
/// do modo certo. Erro do servidor vira aviso.
Future<void> openConversationWith(
  BuildContext context,
  Future<String> Function() open, {
  required bool professorMode,
}) async {
  try {
    final id = await open();
    if (!context.mounted) return;
    context.pushNamed(
      professorMode
          ? AppRouteNames.professorConversation
          : AppRouteNames.athleteConversation,
      pathParameters: {'conversationId': id},
    );
  } catch (e) {
    if (!context.mounted) return;
    showAppSnackBar(
      context,
      e is MessagesException ? e.message : 'Não foi possível abrir a conversa.',
      isError: true,
    );
  }
}

/// Avatar da conversa: foto/iniciais na direta, quadrado com sigla no grupo.
class ConversationAvatar extends StatelessWidget {
  const ConversationAvatar({
    super.key,
    required this.name,
    this.photoUrl,
    this.group = false,
    this.size = 44,
  });

  final String name;
  final String? photoUrl;
  final bool group;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (!group) {
      return ArenaClassAvatar(
        initials: arenaClassInitials(name),
        photoUrl: photoUrl,
        size: size,
      );
    }
    final colors = context.themeColors;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: ProfessorLinksStyle.soft(colors),
        borderRadius: BorderRadius.circular(size * 0.32),
        border: Border.all(color: ProfessorLinksStyle.line2(colors)),
      ),
      child: Text(
        arenaClassInitials(name),
        style: ProfessorLinksStyle.display(
          size * 0.3,
          weight: FontWeight.w700,
          color: ProfessorLinksStyle.mute(colors),
        ),
      ),
    );
  }
}

/// Linha da caixa (D1): não lida em negrito, contagem laranja, ponto azul
/// para aluno da carteira.
class ConversationTile extends StatelessWidget {
  const ConversationTile({
    super.key,
    required this.conversation,
    required this.viewerUid,
    required this.now,
    required this.onTap,
    this.walletDot = false,
  });

  final Conversation conversation;
  final String viewerUid;
  final DateTime now;
  final VoidCallback onTap;
  final bool walletDot;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = conversation;
    final unread = c.unreadFor(viewerUid);
    final title = c.titleFor(viewerUid);
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: ProfessorLinksStyle.line(colors)),
          ),
        ),
        child: Row(
          children: [
            ConversationAvatar(
              name: title,
              photoUrl: c.photoFor(viewerUid),
              group: c.isGroup,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ProfessorLinksStyle.display(
                            13.5,
                            weight:
                                unread > 0 ? FontWeight.w800 : FontWeight.w600,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      if (walletDot) ...[
                        const SizedBox(width: 6),
                        Container(
                          key: Key('conversation-wallet-dot-${c.id}'),
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: ProfessorLinksStyle.blue,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ],
                      if (c.closed) ...[
                        const SizedBox(width: 6),
                        Text(
                          'ENCERRADA',
                          style: ProfessorLinksStyle.mono(
                            8.5,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ],
                      const Spacer(),
                      Text(
                        inboxTimeLabel(c.lastAt, now),
                        style: ProfessorLinksStyle.mono(
                          9.5,
                          weight: FontWeight.w600,
                          color: unread > 0
                              ? AppColors.brand
                              : ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          inboxPreview(c, viewerUid),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 12,
                            color: unread > 0
                                ? ProfessorLinksStyle.mute(colors)
                                : ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ),
                      if (unread > 0)
                        Container(
                          key: Key('conversation-unread-${c.id}'),
                          constraints: const BoxConstraints(minWidth: 18),
                          height: 18,
                          padding: const EdgeInsets.symmetric(horizontal: 5),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: AppColors.brand,
                            borderRadius: BorderRadius.circular(9),
                          ),
                          child: Text(
                            unread > 99 ? '99+' : '$unread',
                            style: ProfessorLinksStyle.mono(
                              9.5,
                              weight: FontWeight.w800,
                              color: ProfessorLinksStyle.onBrand,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Bolha: as minhas em laranja à direita; no grupo, o nome de quem mandou.
class ChatBubble extends StatelessWidget {
  const ChatBubble({
    super.key,
    required this.text,
    required this.mine,
    this.time = '',
    this.sender,
    this.auto = false,
    this.sending = false,
  });

  final String text;
  final bool mine;
  final String time;
  final String? sender;
  final bool auto;
  final bool sending;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = mine ? ProfessorLinksStyle.onBrand : colors.onSurface;
    final meta = [
      if (auto) 'resposta automática',
      if (sending) 'enviando…' else if (time.isNotEmpty) time,
    ].join(' · ');
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.75,
        ),
        child: Column(
          crossAxisAlignment:
              mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (sender != null && !mine)
              Padding(
                padding: const EdgeInsets.only(left: 4, bottom: 3),
                child: Text(
                  sender!,
                  style: ProfessorLinksStyle.mono(9.5, color: AppColors.brand),
                ),
              ),
            Opacity(
              opacity: sending ? 0.6 : 1,
              child: Container(
                padding: const EdgeInsets.fromLTRB(13, 10, 13, 8),
                decoration: BoxDecoration(
                  color:
                      mine ? AppColors.brand : ProfessorLinksStyle.soft(colors),
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(16),
                    topRight: const Radius.circular(16),
                    bottomLeft: Radius.circular(mine ? 16 : 4),
                    bottomRight: Radius.circular(mine ? 4 : 16),
                  ),
                  border: auto
                      ? Border.all(color: ProfessorLinksStyle.line2(colors))
                      : null,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      text,
                      style: AppTypography.bodyM.copyWith(
                        fontSize: 13.5,
                        height: 1.42,
                        color: fg,
                      ),
                    ),
                    if (meta.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        meta,
                        style: ProfessorLinksStyle.mono(
                          9,
                          weight: FontWeight.w500,
                          color: fg.withValues(alpha: 0.6),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Separador de dia.
class ChatDaySeparator extends StatelessWidget {
  const ChatDaySeparator(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Center(
          child: Text(
            label,
            style: ProfessorLinksStyle.mono(
              10,
              color: ProfessorLinksStyle.dim(context.themeColors),
            ),
          ),
        ),
      );
}

/// Badge de não lidas no canto de um ícone (cabeçalho do atleta).
class UnreadDot extends StatelessWidget {
  const UnreadDot({super.key, required this.count});

  final int count;

  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.brand,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.black, width: 1.5),
        ),
        child: Text(
          count > 99 ? '99+' : '$count',
          style: const TextStyle(
            color: AppColors.black,
            fontSize: 9,
            fontWeight: FontWeight.w800,
          ),
        ),
      );
}

/// Ação para os atalhos de outras telas (aluno, turma).
typedef ConversationOpener = Future<String> Function(MessagesRepository repo);

/// Botão "Mensagem"/"Grupo da turma" das telas do professor.
class OpenConversationButton extends ConsumerStatefulWidget {
  const OpenConversationButton({
    super.key,
    required this.label,
    required this.open,
    this.icon = Icons.chat_bubble_outline_rounded,
  });

  final String label;
  final IconData icon;
  final ConversationOpener open;

  @override
  ConsumerState<OpenConversationButton> createState() =>
      _OpenConversationButtonState();
}

class _OpenConversationButtonState
    extends ConsumerState<OpenConversationButton> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) => ProfessorLinksGhostButton(
        label: widget.label,
        height: 42,
        loading: _busy,
        onPressed: () async {
          setState(() => _busy = true);
          await openConversationWith(
            context,
            () => widget.open(ref.read(messagesRepositoryProvider)),
            professorMode: true,
          );
          if (mounted) setState(() => _busy = false);
        },
      );
}
