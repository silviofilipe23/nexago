import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/application/professor_availability_providers.dart';
import '../../professor_mode/application/professor_evaluations_providers.dart';
import '../../professor_mode/application/professor_wallet_providers.dart';
import '../../professor_mode/domain/professor_availability.dart';
import '../../professor_mode/presentation/availability/reschedule_widgets.dart';
import '../../professor_mode/presentation/evaluations/professor_evaluations_page.dart'
    show openProfessorEvaluate;
import '../application/messages_providers.dart';
import '../domain/messages.dart';
import '../infrastructure/messages_repository.dart';
import 'messages_widgets.dart';
import 'reschedule_card.dart';

/// D2 Grupo da turma / D3 conversa com aluno (e o lado do aluno): bolhas,
/// separador de dia e composer. Envio por callable
/// (`sendConversationMessage`), com a bolha "enviando…" até o snapshot
/// trazer a mensagem. Abrir e chegar mensagem com a tela aberta marcam lida.
/// Conversa encerrada: histórico só leitura, sem composer.
/// D4 Canal com a arena: a mesma tela, para o professor (aba Mensagens) e
/// para a gestão ([ConversationPage.arena], a partir do vínculo).
class ConversationPage extends ConsumerStatefulWidget {
  const ConversationPage({
    super.key,
    required this.conversationId,
    required this.professorMode,
  })  : arenaLinkId = null,
        centerId = null,
        arenaClassesSide = false,
        initialDraft = null;

  /// Lado da equipe do Centro de treinamento: voltar leva às mensagens do
  /// centro.
  const ConversationPage.center({
    super.key,
    required this.conversationId,
    required String this.centerId,
  })  : professorMode = false,
        arenaLinkId = null,
        arenaClassesSide = false,
        initialDraft = null;

  /// Lado da gestão das Aulas da arena com o aluno: voltar leva às mensagens
  /// das Aulas. [initialDraft] pré-preenche o composer (o "Cobrar" chega com
  /// a mensagem e o link da fatura; quem cobra revisa e envia).
  const ConversationPage.arenaClasses({
    super.key,
    required this.conversationId,
    this.initialDraft,
  })  : professorMode = false,
        arenaLinkId = null,
        centerId = null,
        arenaClassesSide = true;

  /// Lado da gestão da arena: o canal do vínculo [linkId], sem as abas do
  /// professor; voltar leva ao vínculo.
  ConversationPage.arena({super.key, required String linkId})
      : conversationId = arenaChannelConversationId(linkId),
        professorMode = false,
        arenaLinkId = linkId,
        centerId = null,
        arenaClassesSide = false,
        initialDraft = null;

  final String conversationId;
  final bool professorMode;

  /// Preenchido no lado da gestão da arena.
  final String? arenaLinkId;

  /// Preenchido no lado da equipe do centro.
  final String? centerId;

  /// Lado da gestão das Aulas da arena.
  final bool arenaClassesSide;

  /// Texto inicial do composer (só o lado das Aulas da arena usa).
  final String? initialDraft;

  @override
  ConsumerState<ConversationPage> createState() => _ConversationPageState();
}

class _ConversationPageState extends ConsumerState<ConversationPage> {
  late final _text = TextEditingController(text: widget.initialDraft ?? '');

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
    final recipient =
        c.showsSenderNames ? null : c.nameOf(c.otherUid(uid) ?? '');
    final filled = applyTemplate(t.body, recipientName: recipient);
    final current = _text.text.trim();
    _text.text = current.isEmpty ? filled : '$current $filled';
    _text.selection = TextSelection.collapsed(offset: _text.text.length);
    setState(() {});
    ref.read(messagesRepositoryProvider).countTemplateUse(uid, t).ignore();
  }

  /// Atalhos da conversa direta (D3): o professor remarca, cobra e avalia
  /// o aluno; o aluno remarca. Só aparece o que se aplica.
  List<Widget> _actionChips(Conversation c, String uid, DateTime now) {
    if (c.isGroup ||
        c.isArena ||
        c.isCenter ||
        c.isCenterDesk ||
        c.isArenaStudent) {
      return const [];
    }
    Widget chip(String key, String label, VoidCallback onTap) => Padding(
          padding: const EdgeInsets.only(right: 6),
          child: ArenaClassChip(
            key: Key('chat-action-$key'),
            label: label,
            selected: false,
            onTap: onTap,
          ),
        );
    if (widget.professorMode) {
      final athleteId = c.athleteUid ?? c.otherUid(uid) ?? '';
      if (athleteId.isEmpty) return const [];
      final lessons = [
        for (final l
            in ref.watch(professorPrivateLessonsProvider).valueOrNull ??
                const <PrivateLesson>[])
          if (l.athleteId == athleteId && l.canRescheduleAt(now)) l,
      ];
      final walletActive = (ref
                  .watch(professorWalletStudentsProvider)
                  .valueOrNull ??
              const [])
          .any((s) => s.active && s.athleteId == athleteId);
      final evaluable = ref
          .watch(evaluableStudentsProvider)
          .any((s) => s.athleteId == athleteId);
      return [
        if (lessons.isNotEmpty)
          chip(
            'reschedule',
            'Remarcar',
            () => rescheduleOneOfLessonsFlow(
              context,
              ref,
              lessons: lessons,
              successMessage: 'Pedido enviado ao aluno',
            ),
          ),
        if (walletActive)
          chip(
            'charge',
            'Cobrar',
            () => context.pushNamed(
              AppRouteNames.professorWalletCharge,
              pathParameters: {'athleteId': athleteId},
            ),
          ),
        if (evaluable)
          chip(
            'evaluate',
            'Enviar avaliação',
            () => openProfessorEvaluate(context, athleteId),
          ),
      ];
    }
    final lessons = [
      for (final l in ref.watch(athletePrivateLessonsProvider).valueOrNull ??
          const <PrivateLesson>[])
        if (l.professorUid == c.professorUid && l.canRescheduleAt(now)) l,
    ]..sort((a, b) => a.startAt.compareTo(b.startAt));
    return [
      if (lessons.isNotEmpty)
        chip(
          'reschedule',
          'Remarcar',
          () => rescheduleOneOfLessonsFlow(
            context,
            ref,
            lessons: lessons,
            successMessage: 'Pedido enviado ao professor',
          ),
        ),
    ];
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

    final arenaLinkId = widget.arenaLinkId;
    void back() => popOrGo(
          context,
          arenaLinkId != null
              ? AppRoutes.arenaProfessionalDetail
                  .replaceAll(':linkId', Uri.encodeComponent(arenaLinkId))
              : widget.centerId != null
              ? AppRoutes.centerCoachMessages
                  .replaceAll(':centerId', widget.centerId!)
              : widget.arenaClassesSide
              ? AppRoutes.arenaClassMessages
              : widget.professorMode
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
    final staffSide = c.viewedByArenaStaff(uid);
    final walletIds = widget.professorMode && !c.isGroup && !c.isArena
        ? {
            for (final s
                in ref.watch(professorWalletStudentsProvider).valueOrNull ??
                    const [])
              if (s.active) s.athleteId,
          }
        : const <String>{};
    final String subtitle;
    if (c.isCenterDesk) {
      subtitle = c.centerStaffSide(uid)
          ? 'Aluno · canal com ${c.title ?? 'o centro'}'
          : 'Recepção e gestão do centro';
    } else if (c.isArenaStudent) {
      subtitle = uid == c.professorUid
          ? 'Aluno · ${c.title ?? 'aulas da arena'}'
          : '${c.title ?? 'Arena'} · aulas';
    } else if (c.isCenter) {
      subtitle = uid == c.professorUid
          ? 'Aluno · ${c.title ?? 'centro'}'
          : '${c.title ?? 'Centro de treinamento'} · equipe';
    } else if (c.isArena) {
      subtitle = staffSide
          ? 'Canal com o professor · ${c.arenaName ?? 'arena'}'
          : 'Canal com a arena · equipe';
    } else if (c.isGroup) {
      subtitle = [
        '${c.studentCount} aluno${c.studentCount == 1 ? '' : 's'}',
        if (c.arenaName != null) c.arenaName!,
      ].join(' · ');
    } else if (widget.professorMode) {
      subtitle =
          walletIds.contains(c.athleteUid) ? 'Carteira própria' : 'Aluno';
    } else {
      subtitle = 'Professor';
    }
    final actions = c.closed ? const <Widget>[] : _actionChips(c, uid, now);
    // Respostas rápidas: do professor e da equipe (CT, gestão das Aulas).
    final templates = (widget.professorMode || c.viewedByStaff(uid)) &&
            !c.isArena
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
      final card = m.card;
      if (card is RescheduleCard) {
        rows.add(Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: RescheduleCardView(
            key: Key('reschedule-card-${m.id}'),
            messageId: m.id,
            card: card,
            viewerUid: uid,
            professorUid: c.professorUid,
            mine: mine,
            time: messageTimeLabel(m.createdAt),
          ),
        ));
        continue;
      }
      rows.add(Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: ChatBubble(
          key: Key('message-${m.id}'),
          text: m.text,
          mine: mine,
          time: messageTimeLabel(m.createdAt),
          auto: m.auto,
          sender: c.showsSenderNames && !mine
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
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: ProfessorLinksNote(
                  c.isArena
                      ? 'Canal encerrado: o vínculo com a arena acabou. O '
                          'histórico fica aqui, mas não dá para mandar '
                          'mensagens.'
                      : 'Conversa encerrada: o histórico fica aqui, mas não '
                          'dá para mandar mensagens.',
                  key: const Key('conversation-closed'),
                ),
              ),
            )
          else
            _Composer(
              controller: _text,
              hint: c.isArena
                  ? (staffSide
                      ? 'Mensagem para o professor'
                      : 'Mensagem para a gestão')
                  : 'Mensagem',
              actions: actions,
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
    this.actions = const [],
    required this.templates,
    required this.onTemplate,
    required this.onSend,
    required this.onChanged,
    this.hint = 'Mensagem',
  });

  final String hint;

  /// Atalhos da conversa (Remarcar, Cobrar, Enviar avaliação).
  final List<Widget> actions;
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
              if (actions.isNotEmpty) ...[
                SingleChildScrollView(
                  key: const Key('chat-actions'),
                  scrollDirection: Axis.horizontal,
                  child: Row(children: actions),
                ),
                const SizedBox(height: 8),
              ],
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
                        hintText: hint,
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
