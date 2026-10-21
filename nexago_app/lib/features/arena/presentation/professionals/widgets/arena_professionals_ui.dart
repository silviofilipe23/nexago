import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../professor_links/domain/arena_professor_link.dart';
import '../../../../professor_links/domain/professor_link_rules.dart';
import '../../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../domain/aulas/arena_class_logic.dart';
import '../../../domain/professionals/arena_professionals_logic.dart';
import '../../aulas/widgets/arena_class_atoms.dart';

/// Peças da tela Profissionais (lado da arena) sobre o desenho dos vínculos
/// (`ProfessorLinksStyle`, protótipo `vc-arena-web.jsx` adaptado ao celular).

/// Foto do professor (toque amplia) ou as iniciais.
class ArenaProfessorAvatar extends StatelessWidget {
  const ArenaProfessorAvatar({
    super.key,
    required this.name,
    this.photoUrl,
    this.size = 40,
  });

  final String name;
  final String? photoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    return ArenaClassAvatar(
      initials: arenaClassInitials(name),
      photoUrl: photoUrl,
      size: size,
      zoomName: name,
      zoomRole: 'Professor',
    );
  }
}

/// Ponto colorido + rótulo do status do lado da arena ("Convite enviado").
class ArenaProfessorStatusLabel extends StatelessWidget {
  const ArenaProfessorStatusLabel(this.status, {super.key, this.small = false});

  final ArenaProfessorLinkStatus status;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final color =
        colors.readableTone(ProfessorLinksStyle.statusColor(status, colors));
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            arenaProfessorStatusLabel(status),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: ProfessorLinksStyle.mono(small ? 10 : 10.5, color: color),
          ),
        ),
      ],
    );
  }
}

/// As permissões com interruptor: as três de sempre e, só no vínculo da
/// equipe, o grupo "Aulas da arena" (independente não vê — o servidor recusa
/// ligar). [onChanged] `null` = só leitura; [busyKey] mostra um indicador na
/// linha que está gravando.
class ArenaProfessorPermissionToggles extends StatelessWidget {
  const ArenaProfessorPermissionToggles({
    super.key,
    required this.type,
    required this.permissions,
    required this.onChanged,
    this.busyKey,
    this.dense = false,
  });

  final ArenaProfessorLinkType type;
  final ArenaProfessorPermissions permissions;
  final void Function(ArenaProfessorPermissionKey key, bool value)? onChanged;
  final ArenaProfessorPermissionKey? busyKey;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final groups = arenaProfessorPermissionGroups(type);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final group in groups) ...[
          if (group.title case final title?) ...[
            SizedBox(height: dense ? 6 : 10),
            ProfessorLinksKicker(
              title,
              key: Key(
                title == professorArenaLessonsGroupTitle
                    ? 'arena-professor-permission-group-lessons'
                    : 'arena-professor-permission-group-recurring',
              ),
            ),
            const SizedBox(height: 6),
          ],
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: colors.surfaceCard,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: ProfessorLinksStyle.line(colors)),
            ),
            child: Column(
              children: [
                for (var i = 0; i < group.items.length; i++)
                  _ToggleRow(
                    info: group.items[i],
                    value: permissions.valueOf(group.items[i].key),
                    busy: busyKey == group.items[i].key,
                    divider: i > 0,
                    dense: dense,
                    onChanged: onChanged == null
                        ? null
                        : (value) => onChanged!(group.items[i].key, value),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.info,
    required this.value,
    required this.busy,
    required this.divider,
    required this.dense,
    required this.onChanged,
  });

  final ProfessorPermissionInfo info;
  final bool value;
  final bool busy;
  final bool divider;
  final bool dense;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final enabled = onChanged != null && !busy;
    return Semantics(
      toggled: value,
      enabled: enabled,
      label: info.title,
      child: InkWell(
        onTap: enabled ? () => onChanged!(!value) : null,
        child: Container(
          key: Key(
            'arena-professor-permission-${info.key.wire}-${value ? 'on' : 'off'}',
          ),
          padding: EdgeInsets.symmetric(vertical: dense ? 8 : 11),
          decoration: BoxDecoration(
            border: divider
                ? Border(
                    top: BorderSide(color: ProfessorLinksStyle.line(colors)),
                  )
                : null,
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      info.title,
                      style: ProfessorLinksStyle.display(
                        13,
                        weight: FontWeight.w600,
                        color: value
                            ? colors.onSurface
                            : ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      info.description,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 52,
                height: 32,
                child: busy
                    ? const Center(
                        child: SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.2,
                            color: AppColors.brand,
                          ),
                        ),
                      )
                    : ExcludeSemantics(
                        child: Switch(
                          value: value,
                          onChanged: enabled ? onChanged : null,
                          activeThumbColor: ProfessorLinksStyle.onBrand,
                          activeTrackColor: AppColors.brand,
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Cartão de escolha do tipo do vínculo (convite). Com [selectable] falso é
/// só a explicação do tipo (estado vazio), sem o botão de rádio.
class ArenaProfessorTypeOption extends StatelessWidget {
  const ArenaProfessorTypeOption({
    super.key,
    required this.type,
    required this.selected,
    required this.onTap,
    this.selectable = true,
  });

  final ArenaProfessorLinkType type;
  final bool selected;
  final VoidCallback? onTap;
  final bool selectable;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final accent = type == ArenaProfessorLinkType.arenaStaff
        ? AppColors.brandHover
        : ProfessorLinksStyle.blue;
    return Semantics(
      selected: selectable ? selected : null,
      inMutuallyExclusiveGroup: selectable ? true : null,
      button: selectable,
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.10)
            : ProfessorLinksStyle.soft(colors),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.45)
                : ProfessorLinksStyle.line(colors),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: Key('arena-professor-type-${type.wire}'),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Row(
              children: [
                if (selectable) ...[
                  Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: selected
                            ? AppColors.brand
                            : ProfessorLinksStyle.line2(colors),
                        width: 2,
                      ),
                    ),
                    child: selected
                        ? Center(
                            child: Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: AppColors.brand,
                                shape: BoxShape.circle,
                              ),
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        professorLinkTypeLabel(type),
                        style: ProfessorLinksStyle.display(
                          13.5,
                          weight: FontWeight.w700,
                          color: selected ? colors.onSurface : accent,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        professorLinkTypeDescription(type),
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
          ),
        ),
      ),
    );
  }
}

/// Indicador do topo da lista ("Equipe da arena · 3 · ativos").
class ArenaProfessorKpiTile extends StatelessWidget {
  const ArenaProfessorKpiTile({
    super.key,
    required this.label,
    required this.value,
    required this.sub,
    this.highlight = false,
  });

  final String label;
  final int value;
  final String sub;

  /// Laranja: há pedido esperando decisão.
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: highlight
            ? AppColors.brand.withValues(alpha: 0.08)
            : colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: highlight
              ? AppColors.brand.withValues(alpha: 0.35)
              : ProfessorLinksStyle.line(colors),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.eyebrow.copyWith(
              color: highlight
                  ? AppColors.brandHover
                  : ProfessorLinksStyle.dim(colors),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '$value',
            style: ProfessorLinksStyle.display(
              24,
              color: highlight ? AppColors.brand : colors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            sub,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: ProfessorLinksStyle.mono(
              10,
              weight: FontWeight.w600,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ],
      ),
    );
  }
}

/// Chip de filtro da lista.
class ArenaProfessorFilterChip extends StatelessWidget {
  const ArenaProfessorFilterChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.dotColor,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? dotColor;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.14)
            : ProfessorLinksStyle.soft(colors),
        shape: StadiumBorder(
          side: BorderSide(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.5)
                : ProfessorLinksStyle.line2(colors),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (dotColor != null) ...[
                  Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(
                      color: dotColor,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                Text(
                  label,
                  style: AppTypography.labelS.copyWith(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: selected ? AppColors.brandHover : colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Pílula de permissão da lista ("Aulas"); riscada quando desligada.
class _PermissionPill extends StatelessWidget {
  const _PermissionPill({required this.label, required this.on});

  final String label;
  final bool on;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      height: 20,
      padding: const EdgeInsets.symmetric(horizontal: 7),
      decoration: BoxDecoration(
        color: on ? colors.surfaceRaised : Colors.transparent,
        borderRadius: BorderRadius.circular(5),
        border: Border.all(
          color: on
              ? ProfessorLinksStyle.line2(colors)
              : ProfessorLinksStyle.line(colors),
        ),
      ),
      child: Center(
        widthFactor: 1,
        child: Text(
          label,
          style: ProfessorLinksStyle.mono(
            9.5,
            weight: FontWeight.w600,
            color: on
                ? ProfessorLinksStyle.mute(colors)
                : ProfessorLinksStyle.dim(colors),
          ).copyWith(
            decoration: on ? null : TextDecoration.lineThrough,
            decorationColor: ProfessorLinksStyle.dim(colors),
          ),
        ),
      ),
    );
  }
}

/// Permissões da linha: pílulas (ativo) ou o texto do estado.
class ArenaProfessorPermissionsCell extends StatelessWidget {
  const ArenaProfessorPermissionsCell({
    super.key,
    required this.link,
    required this.now,
  });

  final ArenaProfessorLink link;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final cell = arenaProfessorPermissionsCell(link, now);
    final pills = cell.pills;
    if (pills == null) {
      return Text(
        cell.text ?? '',
        style: ProfessorLinksStyle.mono(
          10,
          weight: FontWeight.w600,
          color: ProfessorLinksStyle.dim(context.themeColors),
        ),
      );
    }
    return Wrap(
      spacing: 4,
      runSpacing: 4,
      children: [
        for (final pill in pills)
          _PermissionPill(label: pill.label, on: pill.on),
      ],
    );
  }
}

/// Linha da lista: foto, nome, modalidades, tipo, status com a data e as
/// permissões. Vínculo fechado fica apagado, como no protótipo.
class ArenaProfessorRowCard extends StatelessWidget {
  const ArenaProfessorRowCard({
    super.key,
    required this.link,
    required this.now,
    required this.onTap,
  });

  final ArenaProfessorLink link;
  final DateTime now;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final status = effectiveProfessorLinkStatus(link, now);
    final dateLine = arenaProfessorStatusDateLine(link, now);
    final card = ProfessorLinksCard(
      key: Key('arena-professor-row-${link.id}'),
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ArenaProfessorAvatar(
            name: link.professorName,
            photoUrl: link.professorPhotoUrl,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        link.professorName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ProfessorLinksStyle.display(
                          14,
                          weight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    ProfessorLinkTypeTag(link.type, small: true),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  arenaProfessorModalitiesLabel(link),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.mono(
                    10,
                    weight: FontWeight.w500,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Flexible(
                      child: ArenaProfessorStatusLabel(status, small: true),
                    ),
                    if (dateLine != null) ...[
                      Text(
                        '  ·  ',
                        style: ProfessorLinksStyle.mono(
                          10,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                      Flexible(
                        child: Text(
                          dateLine,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ProfessorLinksStyle.mono(
                            10,
                            weight: FontWeight.w500,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 8),
                ArenaProfessorPermissionsCell(link: link, now: now),
              ],
            ),
          ),
          const SizedBox(width: 4),
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Icon(
              Icons.chevron_right_rounded,
              size: 20,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ],
      ),
    );
    return status.isOpen ? card : Opacity(opacity: 0.55, child: card);
  }
}

/// Card de um pedido aguardando decisão (lista e topo da tela).
class ArenaProfessorRequestCard extends StatelessWidget {
  const ArenaProfessorRequestCard({
    super.key,
    required this.link,
    required this.now,
    required this.onAnalyze,
    required this.onReject,
    this.highlight = false,
    this.busy = false,
  });

  final ArenaProfessorLink link;
  final DateTime now;

  /// Toque no card e no "Analisar".
  final VoidCallback? onAnalyze;

  /// `null` = só leitura (sem escrita na área): o card fica sem os botões.
  final VoidCallback? onReject;
  final bool highlight;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final requested = link.requestedAt;
    final message = link.message;
    return ProfessorLinksCard(
      key: Key('arena-professor-request-${link.id}'),
      borderColor: highlight
          ? AppColors.pending.withValues(alpha: 0.4)
          : ProfessorLinksStyle.line(colors),
      onTap: onAnalyze,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              ArenaProfessorAvatar(
                name: link.professorName,
                photoUrl: link.professorPhotoUrl,
                size: 42,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      link.professorName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        14.5,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        arenaProfessorModalitiesLabel(link),
                        if (requested != null)
                          'pedido ${professorLinkShortDate(requested, now)}',
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.mono(
                        10,
                        weight: FontWeight.w500,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Text(
                'Quer atuar como',
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
              const SizedBox(width: 8),
              ProfessorLinkTypeTag(link.type, small: true),
            ],
          ),
          if (message != null) ...[
            const SizedBox(height: 8),
            Text(
              '“$message”',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodyS.copyWith(
                fontSize: 12.5,
                height: 1.45,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
          ],
          if (onReject != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ProfessorLinksPrimaryButton(
                    key: Key('arena-professor-analyze-${link.id}'),
                    label: 'Analisar',
                    height: 42,
                    onPressed: busy ? null : onAnalyze,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ProfessorLinksGhostButton(
                    key: Key('arena-professor-reject-${link.id}'),
                    label: 'Rejeitar',
                    color: colors.live,
                    height: 42,
                    loading: busy,
                    onPressed: onReject,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Faixa vermelha com a mensagem do servidor (dentro das folhas).
class ArenaProfessorErrorBanner extends StatelessWidget {
  const ArenaProfessorErrorBanner(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('arena-professor-error'),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.live.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.live.withValues(alpha: 0.5)),
      ),
      child: Text(
        message,
        style: AppTypography.bodyS.copyWith(
          fontSize: 12.5,
          height: 1.4,
          color: context.themeColors.live,
        ),
      ),
    );
  }
}

/// Campo de texto das folhas (mensagem, motivo, detalhes, busca).
InputDecoration arenaProfessorInputDecoration(
  BuildContext context, {
  required String hint,
  IconData? icon,
}) {
  final colors = context.themeColors;
  OutlineInputBorder border(Color color) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: color),
      );
  return InputDecoration(
    hintText: hint,
    hintMaxLines: 2,
    hintStyle: AppTypography.bodyS.copyWith(
      color: ProfessorLinksStyle.dim(colors),
    ),
    prefixIcon: icon == null
        ? null
        : Icon(icon, size: 18, color: ProfessorLinksStyle.dim(colors)),
    isDense: true,
    filled: true,
    fillColor: ProfessorLinksStyle.soft(colors),
    contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
    border: border(ProfessorLinksStyle.line2(colors)),
    enabledBorder: border(ProfessorLinksStyle.line2(colors)),
    disabledBorder: border(ProfessorLinksStyle.line(colors)),
    focusedBorder: border(AppColors.brand),
  );
}

/// Linha "rótulo · valor" da ficha do detalhe.
class ArenaProfessorFact extends StatelessWidget {
  const ArenaProfessorFact({
    super.key,
    required this.label,
    required this.child,
    this.divider = true,
  });

  final String label;
  final Widget child;
  final bool divider;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: divider
            ? Border(
                top: BorderSide(
                  color: ProfessorLinksStyle.line(context.themeColors),
                ),
              )
            : null,
      ),
      child: Row(
        children: [
          ProfessorLinksKicker(label),
          const SizedBox(width: 12),
          Expanded(
            child: Align(alignment: Alignment.centerRight, child: child),
          ),
        ],
      ),
    );
  }
}

/// Valor em texto da ficha ("Professor", "Ana Souza").
class ArenaProfessorFactText extends StatelessWidget {
  const ArenaProfessorFactText(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      textAlign: TextAlign.right,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: AppTypography.bodyS.copyWith(
        fontSize: 12.5,
        color: context.themeColors.onSurface,
      ),
    );
  }
}

/// Rótulo de seção com a dica à direita; em tela estreita a dica desce para a
/// linha de baixo em vez de estourar.
class ArenaProfessorSectionHead extends StatelessWidget {
  const ArenaProfessorSectionHead({
    super.key,
    required this.title,
    required this.hint,
  });

  final String title;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 12,
        runSpacing: 4,
        children: [
          ProfessorLinksKicker(title),
          Text(
            hint,
            style: ProfessorLinksStyle.mono(
              9.5,
              weight: FontWeight.w600,
              color: ProfessorLinksStyle.dim(context.themeColors),
            ),
          ),
        ],
      ),
    );
  }
}
