import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/application/professor_wallet_providers.dart';
import '../application/messages_providers.dart';
import '../domain/messages.dart';
import '../infrastructure/messages_repository.dart';
import 'messages_widgets.dart';

/// D2 Grupo da turma / D3 conversa com aluno (e o lado do aluno): bolhas,
/// separador de dia e composer. Envio por callable
/// (`sendConversationMessage`), com a bolha "enviando…" até o snapshot
/// trazer a mensagem. Abrir e chegar mensagem com a tela aberta marcam lida.
/// Conversa encerrada: histórico só leitura, sem composer.
class ConversationPage extends ConsumerStatefulWidget {
  const ConversationPage({
    super.key,
    required this.conversationId,
    required this.professorMode,
  });

  final String conversationId;
  final bool professorMode;

  @override
  ConsumerState<ConversationPage> createState() => _ConversationPageState();
}

class _ConversationPageState extends ConsumerState<ConversationPage> {
  final _text = TextEditingController();

  /// Mensagens mandadas que o snapshot ainda não trouxe.
  final _pending = <({String key, String text})>[];
  int _seq = 0;
  String? _lastReadMessageId;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _markRead() {
    ref
        .read(messagesRepositoryProvider)
        .markRead(widget.conversationId)
        .then<void>((_) {}, onError: (_) {});
  }

  Future<void> _send() async {
    final text = cleanMessageText(_text.text);
    if (text == null) return;
    final key = 'p${_seq++}';
    setState(() {
      _pending.add((key: key, text: text));
      _text.clear();
    });
    try {
      await ref.read(messagesRepositoryProvider).send(
            widget.conversationId,
            text,
          );
    } catch (e) {
      if (!mounted) return;
      // Devolve o texto para não perder o que foi escrito.
      if (_text.text.isEmpty) _text.text = text;
      showAppSnackBar(
        context,
        e is MessagesException ? e.message : 'Não foi possível enviar.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _pending.removeWhere((p) => p.key == key));
    }
  }

  void _useTemplate(MessageTemplate t, Conversation c, String uid) {
    final recipient = c.isGroup ? null : c.nameOf(c.otherUid(uid) ?? '');
    final filled = applyTemplate(t.body, recipientName: recipient);
    final current = _text.text.trim();
    _text.text = current.isEmpty ? filled : '$current $filled';
    _text.selection = TextSelection.collapsed(offset: _text.text.length);
    setState(() {});
    ref.read(messagesRepositoryProvider).countTemplateUse(uid, t).ignore();
  }

  @override
  Widget build(BuildContext context) {
    final uid = ref.watch(messagesUidProvider);
    final convAsync = ref.watch(conversationProvider(widget.conversationId));
    final conversation = convAsync.valueOrNull;
    final msgsAsync =
        ref.watch(conversationMessagesProvider(widget.conversationId));
    final messages = msgsAsync.valueOrNull;
    final now = ref.watch(professorLinksClockProvider)();

    // Abriu ou chegou mensagem (de outro) com a tela aberta: marca lida.
    final last = messages?.isEmpty ?? true ? null : messages!.last;
    final lastId = last?.id ?? '';
    if (messages != null && lastId != _lastReadMessageId) {
      final firstLoad = _lastReadMessageId == null;
      _lastReadMessageId = lastId;
      if (firstLoad || (last != null && last.senderUid != uid)) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _markRead();
        });
      }
    }

    void back() => popOrGo(
          context,
          widget.professorMode
              ? AppRoutes.professorMessages
              : AppRoutes.athleteMessages,
        );

    if (conversation == null) {
      return ProfessorLinksScaffold(
        title: 'Conversa',
        onBack: back,
        body: Center(
          child: !convAsync.hasValue && !convAsync.hasError
              ? const CircularProgressIndicator(color: AppColors.brand)
              : const Padding(
                  padding: EdgeInsets.all(24),
                  child: ProfessorLinksNote(
                    'Esta conversa não está disponível para você.',
                    key: Key('conversation-missing'),
                  ),
                ),
        ),
      );
    }

    final c = conversation;
    final walletIds = widget.professorMode && !c.isGroup
        ? {
            for (final s
                in ref.watch(professorWalletStudentsProvider).valueOrNull ??
                    const [])
              if (s.active) s.athleteId,
          }
        : const <String>{};
    final subtitle = c.isGroup
        ? [
            '${c.studentCount} aluno${c.studentCount == 1 ? '' : 's'}',
            if (c.arenaName != null) c.arenaName!,
          ].join(' · ')
        : widget.professorMode
            ? (walletIds.contains(c.athleteUid) ? 'Carteira própria' : 'Aluno')
            : 'Professor';
    final templates = widget.professorMode
        ? ref.watch(messageTemplatesProvider).valueOrNull ?? const []
        : const <MessageTemplate>[];

    final rows = <Widget>[];
    String? day;
    for (final m in messages ?? const <ChatMessage>[]) {
      final key = messageDayKey(m.createdAt, now);
      if (key != day) {
        day = key;
        rows.add(ChatDaySeparator(messageDayLabel(m.createdAt ?? now, now)));
      }
      final mine = m.senderUid == uid;
      rows.add(Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: ChatBubble(
          key: Key('message-${m.id}'),
          text: m.text,
          mine: mine,
          time: messageTimeLabel(m.createdAt),
          auto: m.auto,
          sender: c.isGroup && !mine
              ? (m.senderName.isEmpty ? c.nameOf(m.senderUid) : m.senderName)
              : null,
        ),
      ));
    }
    for (final p in _pending) {
      rows.add(Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: ChatBubble(
          key: Key('message-pending-${p.key}'),
          text: p.text,
          mine: true,
          sending: true,
        ),
      ));
    }

    return ProfessorLinksScaffold(
      title: c.titleFor(uid),
      subtitle: subtitle.toUpperCase(),
      onBack: back,
      body: Column(
        children: [
          Expanded(
            child: messages == null && !msgsAsync.hasError
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.brand),
                  )
                : rows.isEmpty
                    ? const Center(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Text('Nenhuma mensagem ainda. Diga oi!'),
                        ),
                      )
                    : ListView(
                        key: const Key('conversation-messages'),
                        reverse: true,
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                        children: rows.reversed.toList(),
                      ),
          ),
          if (c.closed)
            const SafeArea(
              top: false,
              child: Padding(
                padding: EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: ProfessorLinksNote(
                  'Conversa encerrada: o histórico fica aqui, mas não dá para '
                  'mandar mensagens.',
                  key: Key('conversation-closed'),
                ),
              ),
            )
          else
            _Composer(
              controller: _text,
              templates: templates,
              onTemplate: (t) => _useTemplate(t, c, uid),
              onSend: _send,
              onChanged: () => setState(() {}),
            ),
        ],
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.templates,
    required this.onTemplate,
    required this.onSend,
    required this.onChanged,
  });

  final TextEditingController controller;
  final List<MessageTemplate> templates;
  final ValueChanged<MessageTemplate> onTemplate;
  final VoidCallback onSend;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final missing = templatePlaceholders(controller.text);
    final canSend = controller.text.trim().isNotEmpty;
    return Container(
      decoration: BoxDecoration(
        color: colors.canvas,
        border:
            Border(top: BorderSide(color: ProfessorLinksStyle.line(colors))),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (templates.isNotEmpty) ...[
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final t in templates.take(8)) ...[
                        ArenaClassChip(
                          key: Key('composer-template-${t.id}'),
                          label: t.title,
                          selected: false,
                          onTap: () => onTemplate(t),
                        ),
                        const SizedBox(width: 6),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 8),
              ],
              if (missing.isNotEmpty) ...[
                Text(
                  'Complete antes de enviar: ${missing.join(', ')}',
                  key: const Key('composer-placeholders'),
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11,
                    color: AppColors.pending,
                  ),
                ),
                const SizedBox(height: 6),
              ],
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('composer-field'),
                      controller: controller,
                      minLines: 1,
                      maxLines: 5,
                      maxLength: kMessageTextMax,
                      textCapitalization: TextCapitalization.sentences,
                      onChanged: (_) => onChanged(),
                      decoration: InputDecoration(
                        counterText: '',
                        isDense: true,
                        hintText: 'Mensagem',
                        filled: true,
                        fillColor: ProfessorLinksStyle.soft(colors),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 13,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide(
                            color: ProfessorLinksStyle.line2(colors),
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide(
                            color: ProfessorLinksStyle.line2(colors),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Material(
                    color: canSend
                        ? AppColors.brand
                        : AppColors.brand.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(14),
                    child: InkWell(
                      key: const Key('composer-send'),
                      borderRadius: BorderRadius.circular(14),
                      onTap: canSend ? onSend : null,
                      child: const SizedBox.square(
                        dimension: 46,
                        child: Icon(
                          Icons.send_rounded,
                          size: 18,
                          color: ProfessorLinksStyle.onBrand,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
