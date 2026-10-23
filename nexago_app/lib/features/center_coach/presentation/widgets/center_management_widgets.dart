import 'package:flutter/material.dart';

import '../../../../core/profiles/app_user_profile.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';

/// Rótulo de seção (mono, caixa alta).
class CenterKicker extends StatelessWidget {
  const CenterKicker(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: ProfessorLinksStyle.mono(
      10,
      color: ProfessorLinksStyle.dim(context.themeColors),
    ).copyWith(letterSpacing: 0.6),
  );
}

/// Campo de texto das folhas e formulários do centro.
class CenterTextField extends StatelessWidget {
  const CenterTextField({
    super.key,
    required this.controller,
    required this.hint,
    this.lines = 1,
    this.keyboardType,
    this.icon,
    this.onChanged,
  });

  final TextEditingController controller;
  final String hint;
  final int lines;
  final TextInputType? keyboardType;
  final IconData? icon;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(13),
      borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
    );
    return TextField(
      controller: controller,
      minLines: lines,
      maxLines: lines == 1 ? 1 : 5,
      keyboardType: keyboardType,
      onChanged: onChanged,
      style: AppTypography.bodyS.copyWith(color: colors.onSurface),
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: icon == null
            ? null
            : Icon(icon, size: 18, color: ProfessorLinksStyle.dim(colors)),
        filled: true,
        fillColor: ProfessorLinksStyle.soft(colors),
        border: border,
        enabledBorder: border,
      ),
    );
  }
}

/// Opções lado a lado (papel, "Só esta aula"…): a escolhida em laranja.
class CenterSegmented<T> extends StatelessWidget {
  const CenterSegmented({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  final List<(T, String)> options;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        for (var i = 0; i < options.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: Material(
              color: options[i].$1 == value
                  ? AppColors.brand.withValues(alpha: 0.12)
                  : ProfessorLinksStyle.soft(colors),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(
                  color: options[i].$1 == value
                      ? AppColors.brand
                      : ProfessorLinksStyle.line(colors),
                ),
              ),
              child: InkWell(
                key: ValueKey('center-seg-${options[i].$1}'),
                borderRadius: BorderRadius.circular(12),
                onTap: () => onChanged(options[i].$1),
                child: SizedBox(
                  height: 42,
                  child: Center(
                    child: Text(
                      options[i].$2,
                      style: ProfessorLinksStyle.display(
                        13,
                        weight: FontWeight.w700,
                        color: options[i].$1 == value
                            ? colors.brandText
                            : ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Card de pares rótulo/valor ("Turma · BT Iniciante Sábado").
class CenterInfoRows extends StatelessWidget {
  const CenterInfoRows({super.key, required this.rows});

  final List<(String, String)> rows;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++)
            Container(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              decoration: BoxDecoration(
                border: i == 0
                    ? null
                    : Border(
                        top: BorderSide(color: ProfessorLinksStyle.line(colors)),
                      ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    rows[i].$1,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      rows[i].$2,
                      textAlign: TextAlign.right,
                      style: ProfessorLinksStyle.mono(
                        11.5,
                        weight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Opção com bolinha de rádio (turma lotada: fila ou outra turma).
class CenterRadioTile extends StatelessWidget {
  const CenterRadioTile({
    super.key,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      borderColor: selected ? AppColors.brand : null,
      backgroundColor: selected
          ? AppColors.brand.withValues(alpha: 0.08)
          : ProfessorLinksStyle.soft(colors),
      child: Row(
        children: [
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                width: 2,
                color: selected
                    ? AppColors.brand
                    : ProfessorLinksStyle.line2(colors),
              ),
            ),
            child: selected
                ? Center(
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.brand,
                      ),
                    ),
                  )
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Mostra o erro de uma ação numa SnackBar.
void showCenterError(BuildContext context, String message) {
  ScaffoldMessenger.maybeOf(context)
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// Nome da conta NexaGO (nome completo, senão apelido).
String centerAccountName(AppUserProfile p) {
  final full = p.fullName?.trim() ?? '';
  if (full.isNotEmpty) return full;
  final nick = p.nickname?.trim() ?? '';
  return nick.isNotEmpty ? nick : 'Atleta';
}

/// Conta NexaGO num resultado de busca (avatar, nome, cidade e etiqueta).
/// [linked] = já está no centro: apagada e sem toque.
class CenterAccountRow extends StatelessWidget {
  const CenterAccountRow({
    super.key,
    required this.profile,
    required this.first,
    required this.linked,
    required this.selected,
    required this.onTap,
    this.linkedLabel = 'Já é aluno',
    this.actionLabel = 'Vincular',
  });

  final AppUserProfile profile;
  final bool first;
  final bool linked;
  final bool selected;
  final VoidCallback onTap;
  final String linkedLabel;
  final String actionLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final name = centerAccountName(profile);
    final city = [
      profile.city?.trim() ?? '',
      profile.state?.trim() ?? '',
    ].where((s) => s.isNotEmpty).join('/');
    final (tag, tagColor) = linked
        ? (linkedLabel, ProfessorLinksStyle.dim(colors))
        : selected
            ? ('Selecionado', AppColors.brand)
            : (actionLabel, AppColors.win);
    return Opacity(
      opacity: linked ? 0.55 : 1,
      child: InkWell(
        onTap: linked ? null : onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 11, 12, 11),
          decoration: BoxDecoration(
            color: selected ? AppColors.brand.withValues(alpha: 0.07) : null,
            border: first
                ? null
                : Border(
                    top: BorderSide(color: ProfessorLinksStyle.line(colors)),
                  ),
          ),
          child: Row(
            children: [
              ArenaClassAvatar(
                initials: arenaClassInitials(name),
                photoUrl: profile.profilePhotoUrl,
                size: 36,
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
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
                      city.isEmpty ? 'Conta NexaGO' : city,
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
              const SizedBox(width: 8),
              ArenaClassTag(label: tag, color: tagColor),
            ],
          ),
        ),
      ),
    );
  }
}
