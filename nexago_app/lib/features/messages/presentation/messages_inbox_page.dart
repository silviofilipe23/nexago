import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../athlete_training/application/athlete_training_providers.dart'
    show athleteTrainingCentersProvider;
import '../../athlete_training/domain/training_center.dart'
    show TrainingCenterLink;
import '../../../core/layout/nexa_page_header.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/search/search_keywords.dart';
import '../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../../professor_links/domain/professor_link_rules.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/application/professor_students_providers.dart';
import '../../professor_mode/application/professor_wallet_providers.dart';
import '../../professor_mode/presentation/professor_shell_page.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/messages_providers.dart';
import '../domain/messages.dart';
import 'center_chat_contacts_sheet.dart';
import 'messages_widgets.dart';

/// D1 Caixa de entrada — do professor (aba Mensagens) e do aluno
/// (`/mensagens`, modo Atleta). Busca, chips Todas/Não lidas/Turmas/Arenas e
/// "+" para começar uma conversa (D5). O canal com a gestão da arena (D4)
/// chega pela mesma consulta de `memberIds`.
class MessagesInboxPage extends ConsumerStatefulWidget {
  const MessagesInboxPage({super.key, required this.professorMode});

  final bool professorMode;

  @override
  ConsumerState<MessagesInboxPage> createState() => _MessagesInboxPageState();
}

class _MessagesInboxPageState extends ConsumerState<MessagesInboxPage> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _open(Conversation c, String uid) {
    // Da gestão da arena (e também atleta/professor noutra conta de papel):
    // o canal abre do lado da arena, sem as abas do professor.
    final linkId = c.linkId;
    if (c.viewedByArenaStaff(uid) && linkId != null) {
      context.pushNamed(
        AppRouteNames.arenaProfessionalConversation,
        pathParameters: {'linkId': linkId},
      );
      return;
    }
    context.pushNamed(
      widget.professorMode
          ? AppRouteNames.professorConversation
          : AppRouteNames.athleteConversation,
      pathParameters: {'conversationId': c.id},
    );
  }

  void _new() => widget.professorMode
      ? showProfessorNewMessageSheet(context)
      : showStudentNewMessageSheet(context);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final uid = ref.watch(messagesUidProvider);
    final async = ref.watch(inboxProvider);
    final all = async.valueOrNull;
    final filter = ref.watch(inboxFilterProvider);
    final now = ref.watch(professorLinksClockProvider)();
    final walletIds = widget.professorMode
        ? {
            for (final s
                in ref.watch(professorWalletStudentsProvider).valueOrNull ??
                    const [])
              if (s.active) s.athleteId,
          }
        : const <String>{};
    final unreadConvs = all == null ? 0 : unreadConversations(all, uid);
    final visible = all == null
        ? null
        : filterInbox(all, viewerUid: uid, filter: filter, query: _search.text);

    final title = Text(
      'Mensagens',
      style: ProfessorLinksStyle.display(24, color: colors.onSurface),
    );
    final subtitle = Text(
      unreadConvs == 0
          ? 'TUDO EM DIA'
          : '$unreadConvs NÃO LIDA${unreadConvs == 1 ? '' : 'S'}',
      key: const Key('messages-subtitle'),
      style: ProfessorLinksStyle.mono(
        10.5,
        color: ProfessorLinksStyle.dim(colors),
      ).copyWith(letterSpacing: 0.8),
    );
    final actions = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.professorMode)
          PopupMenuButton<String>(
            key: const Key('messages-menu'),
            icon: const Icon(Icons.more_horiz_rounded),
            onSelected: (v) => context.pushNamed(v),
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: AppRouteNames.professorMessageTemplates,
                child: Text('Respostas rápidas'),
              ),
              PopupMenuItem(
                value: AppRouteNames.professorServiceHours,
                child: Text('Horário de atendimento'),
              ),
            ],
          ),
        ProfessorLinksRoundButton(
          key: const Key('messages-new'),
          icon: Icons.add_rounded,
          filled: true,
          semanticLabel: 'Nova mensagem',
          onTap: _new,
        ),
      ],
    );

    final list = ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(
        20,
        8,
        20,
        widget.professorMode ? professorShellBottomPadding(context) : 40,
      ),
      children: [
        TextField(
          key: const Key('messages-search'),
          controller: _search,
          onChanged: (_) => setState(() {}),
          style: AppTypography.bodyM.copyWith(color: colors.onSurface),
          decoration: InputDecoration(
            isDense: true,
            hintText: 'Buscar conversa',
            prefixIcon: const Icon(Icons.search_rounded, size: 19),
            filled: true,
            fillColor: ProfessorLinksStyle.soft(colors),
            contentPadding: const EdgeInsets.symmetric(vertical: 12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: BorderSide(color: ProfessorLinksStyle.line(colors)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: BorderSide(color: ProfessorLinksStyle.line(colors)),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 6,
          children: [
            for (final (f, label) in [
              (InboxFilter.all, 'Todas'),
              (
                InboxFilter.unread,
                unreadConvs == 0 ? 'Não lidas' : 'Não lidas · $unreadConvs',
              ),
              (InboxFilter.classes, 'Turmas'),
              if (widget.professorMode ||
                  (all ?? const <Conversation>[]).any((c) => c.isArena))
                (InboxFilter.arenas, 'Arenas'),
            ])
              ArenaClassChip(
                key: Key('messages-filter-${f.name}'),
                label: label,
                selected: filter == f,
                onTap: () => ref.read(inboxFilterProvider.notifier).state = f,
              ),
          ],
        ),
        const SizedBox(height: 8),
        if (visible == null && async.hasError)
          ProfessorRetryCard(
            message: 'Não foi possível carregar suas mensagens.',
            onRetry: () => ref.invalidate(inboxProvider),
          )
        else if (visible == null)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          )
        else if (visible.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: ProfessorLinksCard(
              key: const Key('messages-empty'),
              child: ProfessorMutedText(
                (all ?? const []).isEmpty
                    ? (widget.professorMode
                        ? 'Nenhuma conversa ainda. Toque em "+" para falar com '
                            'um aluno, o grupo de uma turma ou a gestão de '
                            'uma arena.'
                        : 'Nenhuma conversa ainda. Toque em "+" para falar com '
                            'seu professor.')
                    : 'Nada por aqui.',
              ),
            ),
          )
        else
          for (final c in visible)
            ConversationTile(
              key: Key('conversation-${c.id}'),
              conversation: c,
              viewerUid: uid,
              now: now,
              walletDot: !c.isGroup &&
                  c.athleteUid != null &&
                  walletIds.contains(c.athleteUid),
              onTap: () => _open(c, uid),
            ),
        if (walletIds.isNotEmpty &&
            (visible ?? const []).any(
                (c) => !c.isGroup && walletIds.contains(c.athleteUid))) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                width: 6,
                height: 6,
                decoration: const BoxDecoration(
                  color: ProfessorLinksStyle.blue,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Aluno da carteira própria · a arena não tem acesso',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ),
            ],
          ),
        ],
      ],
    );

    if (!widget.professorMode) {
      return ProfessorLinksScaffold(
        title: 'Mensagens',
        subtitle: subtitle.data,
        onBack: () => popOrGo(context, AppRoutes.home),
        trailing: actions,
        body: RefreshIndicator(
          onRefresh: () async => ref.invalidate(inboxProvider),
          child: list,
        ),
      );
    }
    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        topGap: 10,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
        header: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [title, const SizedBox(height: 3), subtitle],
              ),
            ),
            actions,
          ],
        ),
        child: list,
      ),
    );
  }
}

// ── D5 Nova mensagem ─────────────────────────────────────────────────────

/// Professor: alunos (turmas liberadas + carteira ativa), turmas e as arenas
/// com vínculo ATIVO (canal com a gestão, D4), com busca; atalho para
/// Comunicados.
Future<void> showProfessorNewMessageSheet(BuildContext context) =>
    showProfessorLinksSheet<void>(
      context,
      builder: (_) => const _ProfessorNewMessageSheet(),
    );

class _ProfessorNewMessageSheet extends ConsumerStatefulWidget {
  const _ProfessorNewMessageSheet();

  @override
  ConsumerState<_ProfessorNewMessageSheet> createState() =>
      _ProfessorNewMessageSheetState();
}

class _ProfessorNewMessageSheetState
    extends ConsumerState<_ProfessorNewMessageSheet> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _go(Future<String> Function() open) async {
    final nav = Navigator.of(context);
    final outer = nav.context;
    nav.pop();
    await openConversationWith(outer, open, professorMode: true);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final snap = ref.watch(professorStudentsProvider).valueOrNull;
    final wallet = [
      for (final s
          in ref.watch(professorWalletStudentsProvider).valueOrNull ?? const [])
        if (s.active) s,
    ];
    final term = normalizeSearchTerm(_search.text);
    bool match(String name) =>
        term.isEmpty || normalizeSearchTerm(name).contains(term);

    final students = <String, ({String name, String? photo, String sub})>{};
    for (final s in snap?.students ?? const []) {
      final id = s.athleteId;
      if (id == null || id.isEmpty || students.containsKey(id)) continue;
      students[id] = (name: s.name, photo: s.photoUrl, sub: s.arenaName);
    }
    for (final s in wallet) {
      students[s.athleteId] =
          (name: s.name, photo: s.photoUrl, sub: 'Carteira própria');
    }
    final classes = [
      for (final c in snap?.classes ?? const [])
        if ((snap?.arena(c.arenaId)?.canSeeStudents ?? false) && match(c.name))
          c,
    ];
    final people = [
      for (final e in students.entries)
        if (match(e.value.name)) e,
    ]..sort((a, b) => a.value.name.compareTo(b.value.name));
    final now = ref.watch(professorLinksClockProvider)();
    final arenas = [
      for (final l
          in ref.watch(myProfessorLinksProvider).valueOrNull ?? const [])
        if (effectiveProfessorLinkStatus(l, now) ==
                ArenaProfessorLinkStatus.active &&
            match(l.arenaName))
          l,
    ]..sort((a, b) => a.arenaName.compareTo(b.arenaName));
    final repo = ref.read(messagesRepositoryProvider);

    return ProfessorLinksSheetBody(
      title: 'Nova mensagem',
      subtitle: 'Para alunos, turmas ou arena',
      children: [
        const SizedBox(height: 12),
        TextField(
          key: const Key('new-message-search'),
          controller: _search,
          autofocus: false,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            isDense: true,
            hintText: 'Buscar aluno ou turma',
            prefixIcon: const Icon(Icons.search_rounded, size: 19),
            filled: true,
            fillColor: ProfessorLinksStyle.soft(colors),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        if (classes.isNotEmpty) ...[
          const SizedBox(height: 16),
          const ProfessorLinksKicker('Turmas'),
          for (final c in classes)
            _PickRow(
              key: Key('new-message-class-${c.classId}'),
              name: c.name,
              sub: '${c.activeCount} alunos · ${c.arenaName}',
              group: true,
              onTap: () => _go(() => repo.openClassConversation(c.classId)),
            ),
        ],
        if (people.isNotEmpty) ...[
          const SizedBox(height: 16),
          const ProfessorLinksKicker('Alunos'),
          for (final e in people)
            _PickRow(
              key: Key('new-message-student-${e.key}'),
              name: e.value.name,
              photoUrl: e.value.photo,
              sub: e.value.sub,
              onTap: () => _go(() => repo.openProfessorConversation(e.key)),
            ),
        ],
        if (arenas.isNotEmpty) ...[
          const SizedBox(height: 16),
          const ProfessorLinksKicker('Arenas'),
          for (final l in arenas)
            _PickRow(
              key: Key('new-message-arena-${l.arenaId}'),
              name: 'Gestão ${l.arenaName}',
              avatarName: l.arenaName,
              arena: true,
              sub: 'Canal com a equipe da arena',
              onTap: () => _go(() => repo.openArenaChannel(l.arenaId)),
            ),
        ],
        if (classes.isEmpty && people.isEmpty && arenas.isEmpty) ...[
          const SizedBox(height: 16),
          const ProfessorMutedText('Ninguém encontrado.'),
        ],
        const SizedBox(height: 16),
        const ProfessorLinksKicker('Envio em massa'),
        const SizedBox(height: 8),
        ProfessorLinksCard(
          key: const Key('new-message-notices'),
          onTap: () {
            final outer = Navigator.of(context).context;
            Navigator.of(context).pop();
            outer.pushNamed(AppRouteNames.professorNoticeNew);
          },
          child: Row(
            children: [
              const Icon(Icons.campaign_outlined, color: AppColors.brand),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Comunicado para várias turmas',
                      style: ProfessorLinksStyle.display(
                        13,
                        weight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    const ProfessorMutedText(
                      'Cada aluno recebe individualmente',
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Aluno: os professores dele (`getMyProfessors`).
Future<void> showStudentNewMessageSheet(BuildContext context) =>
    showProfessorLinksSheet<void>(
      context,
      builder: (_) => const _StudentNewMessageSheet(),
    );

class _StudentNewMessageSheet extends ConsumerWidget {
  const _StudentNewMessageSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myProfessorsProvider);
    final list = async.valueOrNull;
    final repo = ref.read(messagesRepositoryProvider);
    // Centros de treinamento do aluno: falar com a recepção ou o professor.
    final centers =
        ref.watch(athleteTrainingCentersProvider).valueOrNull ??
        const <TrainingCenterLink>[];
    return ProfessorLinksSheetBody(
      title: 'Nova mensagem',
      subtitle: 'Para um professor das suas aulas',
      children: [
        for (final c in centers)
          _PickRow(
            key: Key('new-message-center-${c.centerId}'),
            name: c.name,
            sub: 'Centro de treinamento · recepção ou professor',
            arena: true,
            onTap: () {
              final outer = Navigator.of(context).context;
              Navigator.of(context).pop();
              showCenterChatContactsSheet(outer, centerId: c.centerId);
            },
          ),
        const SizedBox(height: 12),
        if (list == null && async.hasError)
          const ProfessorMutedText(
              'Não foi possível carregar seus professores.')
        else if (list == null)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          )
        else if (list.isEmpty)
          const ProfessorMutedText(
            'Você ainda não tem professor no nexaGO. Quando entrar numa turma '
            'ou na carteira de um professor, ele aparece aqui.',
          )
        else
          for (final p in list)
            _PickRow(
              key: Key('new-message-professor-${p.professorUid}'),
              name: p.name,
              photoUrl: p.photoUrl,
              sub: 'Professor',
              onTap: () {
                final outer = Navigator.of(context).context;
                Navigator.of(context).pop();
                openConversationWith(
                  outer,
                  () => repo.openStudentConversation(p.professorUid),
                  professorMode: false,
                );
              },
              // Fase 10: agendar particular com o professor.
              trailing: IconButton(
                key: Key('new-message-book-${p.professorUid}'),
                tooltip: 'Agendar particular',
                icon: const Icon(Icons.event_available_outlined, size: 20),
                color: AppColors.brandHover,
                onPressed: () {
                  final outer = Navigator.of(context).context;
                  Navigator.of(context).pop();
                  outer.pushNamed(
                    AppRouteNames.athletePrivateLessonBook,
                    pathParameters: {'professorUid': p.professorUid},
                    extra: p.name,
                  );
                },
              ),
            ),
      ],
    );
  }
}

class _PickRow extends StatelessWidget {
  const _PickRow({
    super.key,
    required this.name,
    required this.sub,
    required this.onTap,
    this.photoUrl,
    this.group = false,
    this.arena = false,
    this.avatarName,
    this.trailing,
  });

  final String name;
  final String sub;

  /// Ação à direita (agendar particular).
  final Widget? trailing;
  final String? photoUrl;
  final bool group;
  final bool arena;

  /// Nome do avatar quando difere do título (iniciais da arena).
  final String? avatarName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            ConversationAvatar(
              name: avatarName ?? name,
              photoUrl: photoUrl,
              group: group,
              arena: arena,
              size: 38,
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                  Text(
                    sub,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}
