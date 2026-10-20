import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_wallet.dart';
import '../../domain/professor_wallet_logic.dart';
import '../actions/professor_action_widgets.dart' show ProfessorActionHint;
import 'professor_wallet_widgets.dart';

/// B5 Adicionar aluno (carteira): atleta com conta NexaGO recebe um convite
/// para a carteira do professor; só vira aluno (e pode ser cobrado) quando
/// aceita. Plano padrão é opcional. Link para quem não tem conta fica para
/// depois.
class ProfessorWalletAddStudentPage extends ConsumerStatefulWidget {
  const ProfessorWalletAddStudentPage({super.key});

  @override
  ConsumerState<ProfessorWalletAddStudentPage> createState() =>
      _ProfessorWalletAddStudentPageState();
}

class _ProfessorWalletAddStudentPageState
    extends ConsumerState<ProfessorWalletAddStudentPage> {
  String? _uid;
  String _name = '';
  String? _planId;
  bool _saving = false;

  void _back() => popOrGo(context, AppRoutes.professorWallet);

  Future<void> _submit() async {
    setState(() => _saving = true);
    final ok = await runProfessorWalletAction(
      context,
      () => ref
          .read(professorWalletRepositoryProvider)
          .upsertStudent(athleteId: _uid!, planId: _planId),
      message: 'Convite enviado para $_name.',
    );
    if (!mounted) return;
    if (ok) {
      _back();
    } else {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final plans = [
      for (final p
          in ref.watch(professorWalletPlansProvider).valueOrNull ?? const [])
        if (p.active) p,
    ];
    final already = <String>{
      for (final s in ref.watch(professorWalletStudentsProvider).valueOrNull ??
          const <ProfessorWalletStudent>[])
        s.athleteId,
      ref.watch(professorLinksUidProvider),
    };
    return ProfessorLinksScaffold(
      title: 'Adicionar aluno',
      subtitle: 'CARTEIRA PRÓPRIA',
      onBack: _back,
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                const ProfessorLinksNote(
                  'O atleta recebe um convite no app. Quando aceitar, entra '
                  'na sua carteira e você pode cobrar pelo nexaGO. A arena '
                  'não vê esses dados.',
                  tone: ProfessorLinksNoteTone.blue,
                ),
                const SizedBox(height: 16),
                const ProfessorLinksKicker('Atleta nexaGO'),
                const SizedBox(height: 8),
                ArenaClassAthleteSearch(
                  selectedUid: _uid,
                  excludeUids: already,
                  hint: 'Nome ou apelido do atleta',
                  onSelect: (u) => setState(() {
                    _uid = u.uid;
                    _name = arenaClassAthleteName(u);
                  }),
                ),
                if (_uid != null && plans.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  const ProfessorLinksKicker('Plano combinado (opcional)'),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      ArenaClassChip(
                        key: const Key('professor-wallet-add-plan-none'),
                        label: 'Sem plano',
                        selected: _planId == null,
                        onTap: () => setState(() => _planId = null),
                      ),
                      for (final p in plans)
                        ArenaClassChip(
                          key: Key('professor-wallet-add-plan-${p.id}'),
                          label: '${p.name} · ${formatBRL(p.priceReais)}',
                          selected: _planId == p.id,
                          onTap: () => setState(() => _planId = p.id),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ProfessorActionHint(
                    _planId == null
                        ? 'Você escolhe o valor na hora de cobrar.'
                        : professorPlanSubtitle(
                            plans.firstWhere((p) => p.id == _planId),
                          ),
                  ),
                ],
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('professor-wallet-add-submit'),
                label: _uid == null
                    ? 'Enviar convite'
                    : 'Enviar convite para $_name',
                loading: _saving,
                onPressed: _uid == null ? null : _submit,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
