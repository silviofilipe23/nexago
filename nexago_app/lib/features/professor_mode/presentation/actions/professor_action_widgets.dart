import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_students_providers.dart';
import '../../domain/professor_actions.dart';
import '../../domain/professor_students.dart';
import '../../infrastructure/professor_students_repository.dart';
import '../widgets/professor_students_widgets.dart';

/// Moldura das telas de ação (B5–B13): header, corpo rolável e o botão
/// principal fixo embaixo. Carrega o contexto da arena e mostra
/// carregando/erro antes do conteúdo.
class ProfessorActionPage extends ConsumerWidget {
  const ProfessorActionPage({
    super.key,
    required this.title,
    required this.arenaId,
    required this.builder,
    this.subtitle,
    this.footer,
  });

  final String title;
  final String? subtitle;
  final String arenaId;

  /// Conteúdo com o contexto já carregado.
  final List<Widget> Function(BuildContext, ProfessorActionsContext) builder;

  /// Botão principal (só aparece com o contexto carregado).
  final Widget Function(BuildContext, ProfessorActionsContext)? footer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(professorActionsContextProvider(arenaId));
    final ctx = async.valueOrNull;
    return ProfessorLinksScaffold(
      title: title,
      subtitle: subtitle,
      onBack: () => popOrGo(context, AppRoutes.professorStudents),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                if (ctx == null && async.hasError)
                  ProfessorRetryCard(
                    message: async.error is ProfessorStudentsException
                        ? (async.error as ProfessorStudentsException).message
                        : 'Não foi possível carregar as turmas.',
                    onRetry: () => ref
                        .invalidate(professorActionsContextProvider(arenaId)),
                  )
                else if (ctx == null)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(
                      child: CircularProgressIndicator(color: AppColors.brand),
                    ),
                  )
                else
                  ..._spaced(builder(context, ctx)),
              ],
            ),
          ),
          if (ctx != null && footer != null)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: footer!(context, ctx),
              ),
            ),
        ],
      ),
    );
  }

  static List<Widget> _spaced(List<Widget> children) => [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          children[i],
        ],
      ];
}

/// Roda a ação com o erro na tela; no sucesso relê os dados, avisa e volta.
Future<bool> runProfessorAction(
  BuildContext context,
  WidgetRef ref, {
  required String arenaId,
  required Future<String?> Function() action,
  bool pop = true,
}) async {
  try {
    final message = await action();
    refreshProfessorAfterAction(ref, arenaId);
    if (!context.mounted) return true;
    if (message != null) showAppSnackBar(context, message);
    if (pop) popOrGo(context, AppRoutes.professorStudents);
    return true;
  } catch (e) {
    if (context.mounted) {
      showAppSnackBar(
        context,
        e is ProfessorStudentsException
            ? e.message
            : 'Não deu certo agora. Tente de novo.',
        isError: true,
      );
    }
    return false;
  }
}

/// Selo de vagas: verde com vaga, vermelho lotada.
class ProfessorSpotsBadge extends StatelessWidget {
  const ProfessorSpotsBadge({super.key, required this.free});

  final int free;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Text(
      free <= 0 ? 'LOTADA' : '$free VAGA${free == 1 ? '' : 'S'}',
      style: ProfessorLinksStyle.mono(
        10.5,
        color: free <= 0 ? colors.live : colors.win,
      ),
    );
  }
}

/// Aviso fixo das telas de dinheiro: o produto é da arena.
class ProfessorArenaRule extends StatelessWidget {
  const ProfessorArenaRule(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) =>
      ProfessorLinksNote(text, tone: ProfessorLinksNoteTone.neutral);
}

/// Texto pequeno de apoio.
class ProfessorActionHint extends StatelessWidget {
  const ProfessorActionHint(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: AppTypography.bodyS.copyWith(
          fontSize: 12,
          color: ProfessorLinksStyle.dim(context.themeColors),
        ),
      );
}

/// Arena da ação: com uma só, vai direto; com mais, pergunta numa folha.
Future<String?> pickProfessorActionArena(
  BuildContext context,
  List<ProfessorArenaSummary> arenas,
) async {
  if (arenas.isEmpty) return null;
  if (arenas.length == 1) return arenas.first.arenaId;
  return showProfessorLinksSheet<String>(
    context,
    builder: (sheetContext) => ProfessorLinksSheetBody(
      title: 'Em qual arena?',
      children: [
        for (final a in arenas)
          ProfessorLinksCard(
            key: Key('professor-pick-arena-${a.arenaId}'),
            onTap: () => Navigator.of(sheetContext).pop(a.arenaId),
            child: Text(
              a.arenaName,
              style: ProfessorLinksStyle.display(
                14,
                weight: FontWeight.w600,
                color: sheetContext.themeColors.onSurface,
              ),
            ),
          ),
      ],
    ),
  );
}
