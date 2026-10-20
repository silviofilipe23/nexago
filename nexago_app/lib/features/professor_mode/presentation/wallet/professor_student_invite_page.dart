import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_wallet.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_wallet_widgets.dart';

/// O que o atleta aceita ao entrar na carteira do professor.
const kProfessorStudentInviteExplanation =
    'Ao aceitar, ele poderá te enviar cobranças pelo nexaGO (PIX ou cartão). '
    'A arena não vê esses dados.';

/// Lado do ATLETA: convite do professor para a carteira dele (push
/// `professor_student_invite`). Aceitar ou recusar vai pela callable
/// `respondProfessorStudentInvite`; o doc em tempo real muda a tela.
class ProfessorStudentInvitePage extends ConsumerStatefulWidget {
  const ProfessorStudentInvitePage({super.key, required this.professorUid});

  final String professorUid;

  @override
  ConsumerState<ProfessorStudentInvitePage> createState() =>
      _ProfessorStudentInvitePageState();
}

class _ProfessorStudentInvitePageState
    extends ConsumerState<ProfessorStudentInvitePage> {
  /// Botão em andamento (`true` aceitar, `false` recusar).
  bool? _sending;

  void _back() => popOrGo(context, AppRoutes.home);

  Future<void> _respond(bool accept, String professorName) async {
    setState(() => _sending = accept);
    final ok = await runProfessorWalletAction(
      context,
      () => ref.read(professorWalletRepositoryProvider).respondInvite(
            professorUid: widget.professorUid,
            accept: accept,
          ),
      message: accept
          ? 'Pronto! Agora você é aluno de $professorName.'
          : 'Convite recusado.',
    );
    if (!mounted) return;
    setState(() => _sending = null);
    if (ok && !accept) _back();
  }

  @override
  Widget build(BuildContext context) {
    final async =
        ref.watch(professorStudentInviteProvider(widget.professorUid));
    final invite = async.valueOrNull;
    final loading = !async.hasValue && !async.hasError;
    return ProfessorLinksScaffold(
      title: 'Convite de professor',
      subtitle: 'CARTEIRA DO PROFESSOR',
      onBack: _back,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (loading)
            const ProfessorWalletLoading()
          else if (invite == null)
            // Sem doc ou sem permissão (convite de outra conta): mesmo aviso.
            const _Notice(
              key: Key('professor-invite-missing'),
              text: 'Este convite não existe mais ou não é para esta conta. '
                  'Peça ao professor para te convidar de novo.',
            )
          else ...[
            _ProfessorCard(invite: invite),
            const SizedBox(height: 18),
            ..._body(invite),
          ],
        ],
      ),
    );
  }

  List<Widget> _body(ProfessorWalletStudent invite) {
    final name = invite.professorName ?? 'O professor';
    return switch (invite.status) {
      ProfessorWalletStudentStatus.active => [
          _Notice(
            key: const Key('professor-invite-accepted'),
            text: 'Você já é aluno de $name. As cobranças dele aparecem na '
                'sua agenda.',
            tone: ProfessorLinksNoteTone.blue,
          ),
        ],
      ProfessorWalletStudentStatus.archived ||
      ProfessorWalletStudentStatus.declined =>
        [
          const _Notice(
            key: Key('professor-invite-closed'),
            text: 'Este convite não está mais valendo.',
          ),
        ],
      ProfessorWalletStudentStatus.invited => [
          const ProfessorLinksNote(
            kProfessorStudentInviteExplanation,
            tone: ProfessorLinksNoteTone.blue,
          ),
          const SizedBox(height: 22),
          ProfessorLinksPrimaryButton(
            key: const Key('professor-invite-accept'),
            label: 'Aceitar',
            loading: _sending == true,
            onPressed: _sending == null ? () => _respond(true, name) : null,
          ),
          const SizedBox(height: 10),
          ProfessorLinksGhostButton(
            key: const Key('professor-invite-decline'),
            label: 'Recusar',
            color: AppColors.live,
            loading: _sending == false,
            onPressed: _sending == null ? () => _respond(false, name) : null,
          ),
        ],
    };
  }
}

class _ProfessorCard extends StatelessWidget {
  const _ProfessorCard({required this.invite});

  final ProfessorWalletStudent invite;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final name = invite.professorName ?? 'Professor';
    return ProfessorLinksCard(
      borderColor: ProfessorLinksStyle.blue.withValues(alpha: 0.35),
      child: Row(
        children: [
          ArenaClassAvatar(
            initials: arenaClassInitials(name),
            photoUrl: invite.professorPhotoUrl,
            size: 52,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  key: const Key('professor-invite-name'),
                  style: ProfessorLinksStyle.display(
                    16,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                const ProfessorMutedText(
                  'Quer te adicionar como aluno da carteira dele.',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({
    super.key,
    required this.text,
    this.tone = ProfessorLinksNoteTone.neutral,
  });

  final String text;
  final ProfessorLinksNoteTone tone;

  @override
  Widget build(BuildContext context) => ProfessorLinksNote(text, tone: tone);
}
