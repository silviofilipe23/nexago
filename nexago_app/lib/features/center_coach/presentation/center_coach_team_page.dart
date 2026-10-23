import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../application/center_management_providers.dart';
import '../domain/center_coach.dart';
import '../domain/center_coach_repository.dart';
import '../domain/center_management.dart';
import '../infrastructure/firebase_center_management_repository.dart';
import 'widgets/center_management_widgets.dart';
import 'widgets/center_mode_tab_scope.dart';

/// G17 · Equipe do centro (owner/admin): vínculos por papel, convites
/// pendentes, revogar acesso. G18 · Convidar por e-mail — o vínculo só nasce
/// quando a pessoa aceita com a conta NexaGO daquele e-mail.
class CenterCoachTeamPage extends ConsumerStatefulWidget {
  const CenterCoachTeamPage({super.key, required this.centerId});

  final String centerId;

  @override
  ConsumerState<CenterCoachTeamPage> createState() =>
      _CenterCoachTeamPageState();
}

class _CenterCoachTeamPageState extends ConsumerState<CenterCoachTeamPage> {
  /// `all`, `coach`, `receptionist` ou `admin`.
  String _filter = 'all';

  bool _matches(String role) => switch (_filter) {
    'coach' => role == 'coach',
    'receptionist' => role == 'receptionist',
    'admin' => role == 'center_admin' || role == 'center_owner',
    _ => true,
  };

  @override
  Widget build(BuildContext context) {
    final centerId = widget.centerId;
    final colors = context.themeColors;
    final me = ref.watch(centerMembershipProvider(centerId));
    final teamAsync = ref.watch(centerTeamProvider(centerId));
    final invites = [
      for (final i
          in ref.watch(centerInvitesProvider(centerId)).valueOrNull ??
              const <CenterInvite>[])
        if (i.isPending && _matches(i.role)) i,
    ]..sort((a, b) => a.email.compareTo(b.email));
    final team = teamAsync.valueOrNull ?? const <CenterTeamMember>[];
    final members = [
      for (final m in team)
        if (_matches(m.role)) m,
    ]..sort((a, b) {
      if (a.isActive != b.isActive) return a.isActive ? -1 : 1;
      final r = _roleRank(a.role).compareTo(_roleRank(b.role));
      return r != 0 ? r : a.displayName.compareTo(b.displayName);
    });
    final active = team.where((m) => m.isActive).length;
    final manager = me?.isManager ?? false;

    return ProfessorLinksScaffold(
      title: 'Equipe',
      subtitle:
          '$active ${active == 1 ? 'VÍNCULO' : 'VÍNCULOS'} NESTE CENTRO'
          '${invites.isEmpty ? '' : ' · ${invites.length} ${invites.length == 1 ? 'CONVITE' : 'CONVITES'}'}',
      showBack: !CenterModeTabScope.of(context),
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      trailing: manager
          ? ProfessorLinksRoundButton(
              key: const Key('center-team-invite'),
              icon: Icons.person_add_alt_1_rounded,
              semanticLabel: 'Convidar',
              onTap: () => showCenterInviteSheet(context, centerId: centerId),
            )
          : null,
      body: ListView(
        padding: centerListPadding(context),
        children: [
          if (!manager)
            const ProfessorLinksCard(
              child: ProfessorMutedText(
                'Só o owner e os admins do centro cuidam da equipe.',
              ),
            )
          else if (teamAsync.isLoading && teamAsync.valueOrNull == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else if (teamAsync.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar a equipe.',
              onRetry: () => ref.invalidate(centerTeamProvider(centerId)),
            )
          else ...[
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final (k, l) in const [
                    ('all', 'Todos'),
                    ('coach', 'Professores'),
                    ('receptionist', 'Recepção'),
                    ('admin', 'Admin'),
                  ]) ...[
                    AvailabilityChoiceChip(
                      key: Key('center-team-filter-$k'),
                      label: l,
                      selected: _filter == k,
                      onTap: () => setState(() => _filter = k),
                    ),
                    const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (members.isEmpty && invites.isEmpty)
              const ProfessorLinksCard(
                child: ProfessorMutedText('Ninguém com esse papel ainda.'),
              )
            else
              ProfessorLinksCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (final (i, inv) in invites.indexed)
                      _TeamRow(
                        key: Key('center-team-invite-${inv.id}'),
                        first: i == 0,
                        initials: arenaClassInitials(
                          inv.displayName.isEmpty ? inv.email : inv.displayName,
                        ),
                        title: inv.displayName.isEmpty
                            ? inv.email
                            : inv.displayName,
                        subtitle: '${inv.roleLabel} · ${inv.email}',
                        tag: const ArenaClassTag(
                          label: 'Convite',
                          color: AppColors.pending,
                        ),
                        onTap: () => _inviteSheet(inv),
                      ),
                    for (final (i, m) in members.indexed)
                      _TeamRow(
                        key: Key('center-team-member-${m.uid}'),
                        first: invites.isEmpty && i == 0,
                        initials: arenaClassInitials(m.displayName),
                        dim: !m.isActive,
                        title: m.displayName,
                        subtitle: [
                          m.roleLabel,
                          if (m.email.isNotEmpty) m.email,
                        ].join(' · '),
                        tag: m.isActive
                            ? null
                            : ArenaClassTag(
                                label: 'Revogado',
                                color: ProfessorLinksStyle.dim(colors),
                              ),
                        onTap: me != null && centerCanRevoke(me, m)
                            ? () => _revokeSheet(me, m)
                            : null,
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            Text(
              'Cada pessoa usa a própria conta NexaGO; o papel vale só neste '
              'centro. Permissões extras ficam no painel web.',
              textAlign: TextAlign.center,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _inviteSheet(CenterInvite inv) async {
    final cancel = await showProfessorLinksSheet<bool>(
      context,
      builder: (sheet) => ProfessorLinksSheetBody(
        key: const Key('center-team-invite-sheet'),
        title: inv.displayName.isEmpty ? inv.email : inv.displayName,
        subtitle:
            '${inv.roleLabel} · convite pendente'
            '${inv.invitedByName.isEmpty ? '' : ' · por ${inv.invitedByName}'}',
        children: [
          const ProfessorLinksNote(
            'A pessoa aceita entrando no NexaGO com este e-mail. Cancelar '
            'invalida o convite na hora.',
            tone: ProfessorLinksNoteTone.blue,
          ),
          ProfessorLinksGhostButton(
            key: const Key('center-team-invite-cancel'),
            label: 'Cancelar convite',
            color: AppColors.live,
            onPressed: () => Navigator.of(sheet).pop(true),
          ),
        ],
      ),
    );
    if (cancel != true || !mounted) return;
    try {
      await ref
          .read(centerManagementRepositoryProvider)
          .cancelInvite(
            centerId: widget.centerId,
            invite: inv,
            actor: ref.read(centerActorProvider(widget.centerId)),
          );
    } on CenterCoachException catch (e) {
      if (mounted) showCenterError(context, e.message);
    }
  }

  Future<void> _revokeSheet(CenterMembership me, CenterTeamMember m) async {
    final reason = await showProfessorLinksSheet<String>(
      context,
      builder: (_) => _RevokeSheet(member: m),
    );
    if (reason == null || !mounted) return;
    try {
      await ref
          .read(centerManagementRepositoryProvider)
          .revokeMember(
            centerId: widget.centerId,
            member: m,
            reason: reason,
            actor: ref.read(centerActorProvider(widget.centerId)),
          );
      if (mounted) {
        showCenterError(context, 'Acesso de ${m.displayName} revogado.');
      }
    } on CenterCoachException catch (e) {
      if (mounted) showCenterError(context, e.message);
    }
  }
}

/// Owner, admin, recepção, professor.
int _roleRank(String role) => switch (role) {
  'center_owner' => 0,
  'center_admin' => 1,
  'receptionist' => 2,
  _ => 3,
};

class _TeamRow extends StatelessWidget {
  const _TeamRow({
    super.key,
    required this.first,
    required this.initials,
    required this.title,
    required this.subtitle,
    this.tag,
    this.onTap,
    this.dim = false,
  });

  final bool first;
  final String initials;
  final String title;
  final String subtitle;
  final Widget? tag;
  final VoidCallback? onTap;
  final bool dim;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 11, 12, 11),
        decoration: BoxDecoration(
          border: first
              ? null
              : Border(top: BorderSide(color: ProfessorLinksStyle.line(colors))),
        ),
        child: Opacity(
          opacity: dim ? 0.55 : 1,
          child: Row(
            children: [
              ArenaClassAvatar(initials: initials, size: 38),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        13.5,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
              if (tag != null) ...[const SizedBox(width: 8), tag!],
              if (onTap != null) ...[
                const SizedBox(width: 4),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 16,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _RevokeSheet extends StatefulWidget {
  const _RevokeSheet({required this.member});

  final CenterTeamMember member;

  @override
  State<_RevokeSheet> createState() => _RevokeSheetState();
}

class _RevokeSheetState extends State<_RevokeSheet> {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.member;
    return ProfessorLinksSheetBody(
      key: const Key('center-team-revoke-sheet'),
      title: m.displayName,
      subtitle: [m.roleLabel, if (m.email.isNotEmpty) m.email].join(' · '),
      children: [
        const ProfessorLinksNote(
          'Revogar corta o acesso a este centro na hora. O histórico (chamadas, '
          'auditoria) fica.',
          tone: ProfessorLinksNoteTone.yellow,
        ),
        CenterTextField(
          key: const Key('center-team-revoke-reason'),
          controller: _reason,
          hint: 'Motivo (fica na auditoria)',
          lines: 2,
          onChanged: (_) => setState(() {}),
        ),
        ProfessorLinksGhostButton(
          key: const Key('center-team-revoke'),
          label: 'Revogar acesso',
          color: AppColors.live,
          onPressed: _reason.text.trim().length < 3
              ? null
              : () => Navigator.of(context).pop(_reason.text.trim()),
        ),
      ],
    );
  }
}

/// G18 · Convidar para a equipe.
Future<void> showCenterInviteSheet(
  BuildContext context, {
  required String centerId,
}) => showProfessorLinksSheet<void>(
  context,
  builder: (_) => _InviteSheet(centerId: centerId),
);

class _InviteSheet extends ConsumerStatefulWidget {
  const _InviteSheet({required this.centerId});

  final String centerId;

  @override
  ConsumerState<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends ConsumerState<_InviteSheet> {
  final _email = TextEditingController();
  final _name = TextEditingController();
  String _role = 'coach';
  final Set<String> _programs = {};
  final Set<String> _classes = {};
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _send(CenterMembership me) async {
    final error = centerInviteError(
      email: _email.text,
      members:
          ref.read(centerTeamProvider(widget.centerId)).valueOrNull ??
          const [],
      invites:
          ref.read(centerInvitesProvider(widget.centerId)).valueOrNull ??
          const [],
    );
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(centerManagementRepositoryProvider)
          .invite(
            centerId: widget.centerId,
            centerName: me.centerName,
            email: _email.text,
            displayName: _name.text,
            role: _role,
            programIds: _role == 'coach' ? _programs.toList() : const [],
            classIds: _role == 'coach' ? _classes.toList() : const [],
            actor: ref.read(centerActorProvider(widget.centerId)),
          );
      if (!mounted) return;
      final messenger = ScaffoldMessenger.maybeOf(context);
      Navigator.of(context).pop();
      messenger?.showSnackBar(
        SnackBar(
          content: Text('Convite enviado para ${_email.text.trim()}.'),
        ),
      );
    } on CenterCoachException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final me = ref.watch(centerMembershipProvider(widget.centerId));
    final programs =
        ref.watch(centerProgramsProvider(widget.centerId)).valueOrNull ??
        const <CenterProgram>[];
    final classes = [
      for (final c
          in ref.watch(coachClassesProvider(widget.centerId)).valueOrNull ??
              const <CenterCoachClass>[])
        if ((c.status == 'active' || c.status == 'draft') &&
            (_programs.isEmpty || _programs.contains(c.programId)))
          c,
    ]..sort((a, b) => a.name.compareTo(b.name));
    if (me == null) return const SizedBox.shrink();
    final roles = centerInvitableRoles(me);

    return ProfessorLinksSheetBody(
      key: const Key('center-invite-sheet'),
      title: 'Convidar para a equipe',
      subtitle: 'Por e-mail · a pessoa aceita com a própria conta NexaGO',
      children: [
        CenterTextField(
          key: const Key('center-invite-email'),
          controller: _email,
          hint: 'E-mail',
          icon: Icons.mail_outline_rounded,
          keyboardType: TextInputType.emailAddress,
        ),
        CenterTextField(
          key: const Key('center-invite-name'),
          controller: _name,
          hint: 'Nome (opcional)',
          icon: Icons.person_outline_rounded,
        ),
        const CenterKicker('Papel'),
        const SizedBox(height: 8),
        CenterSegmented<String>(
          options: [
            for (final r in roles) (r, kCenterRoleLabels[r] ?? r),
          ],
          value: _role,
          onChanged: (r) => setState(() => _role = r),
        ),
        if (_role == 'coach' && programs.isNotEmpty) ...[
          const CenterKicker('Modalidades'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final p in programs)
                AvailabilityChoiceChip(
                  key: Key('center-invite-program-${p.id}'),
                  label: p.name,
                  selected: _programs.contains(p.id),
                  onTap: () => setState(() {
                    _programs.contains(p.id)
                        ? _programs.remove(p.id)
                        : _programs.add(p.id);
                    _classes.removeWhere(
                      (id) => !classes.any((c) => c.id == id),
                    );
                  }),
                ),
            ],
          ),
        ],
        if (_role == 'coach' && classes.isNotEmpty) ...[
          const CenterKicker('Turmas'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final c in classes)
                AvailabilityChoiceChip(
                  key: Key('center-invite-class-${c.id}'),
                  label: c.name,
                  selected: _classes.contains(c.id),
                  onTap: () => setState(
                    () => _classes.contains(c.id)
                        ? _classes.remove(c.id)
                        : _classes.add(c.id),
                  ),
                ),
            ],
          ),
        ],
        Text(
          switch (_role) {
            'receptionist' =>
              'Recepção faz check-in e matrícula; vê a situação do pagamento, '
                  'mas não os valores recebidos.',
            'center_admin' =>
              'Admin cuida de tudo no centro, menos do owner.',
            _ => 'Professor não vê cobranças, planos nem configurações.',
          },
          style: AppTypography.bodyS.copyWith(
            fontSize: 11.5,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
        if (_error != null)
          ProfessorLinksNote(_error!, tone: ProfessorLinksNoteTone.red),
        ProfessorLinksPrimaryButton(
          key: const Key('center-invite-send'),
          label: 'Enviar convite',
          loading: _busy,
          onPressed: () => _send(me),
        ),
      ],
    );
  }
}
