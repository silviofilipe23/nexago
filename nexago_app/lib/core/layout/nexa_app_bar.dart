import 'package:flutter/material.dart';
import 'package:native_liquid_glass/native_liquid_glass.dart';

import 'nexa_native_liquid_glass.dart';

/// App bar do NexaGO — Liquid Glass nativo no iOS 26+, Material nos demais.
class NexaAppBar extends StatefulWidget implements PreferredSizeWidget {
  const NexaAppBar({
    super.key,
    this.title,
    this.leading,
    this.actions,
    this.automaticallyImplyLeading = true,
    this.centerTitle,
    this.backgroundColor,
    this.foregroundColor,
    this.surfaceTintColor,
    this.elevation,
    this.scrolledUnderElevation,
    this.titleSpacing,
    this.titleTextStyle,
    this.toolbarHeight = kToolbarHeight,
    this.leadingWidth,
    this.bottom,
    this.flexibleSpace,
    this.forceMaterial = false,
  });

  final Widget? title;
  final Widget? leading;
  final List<Widget>? actions;
  final bool automaticallyImplyLeading;
  final bool? centerTitle;
  final Color? backgroundColor;
  final Color? foregroundColor;
  final Color? surfaceTintColor;
  final double? elevation;
  final double? scrolledUnderElevation;
  final double? titleSpacing;
  final TextStyle? titleTextStyle;
  final double toolbarHeight;
  final double? leadingWidth;
  final PreferredSizeWidget? bottom;
  final Widget? flexibleSpace;
  final bool forceMaterial;

  @override
  Size get preferredSize {
    final bottomHeight = bottom?.preferredSize.height ?? 0;
    return Size.fromHeight(toolbarHeight + bottomHeight);
  }

  @override
  State<NexaAppBar> createState() => _NexaAppBarState();
}

class _NexaAppBarState extends State<NexaAppBar> {
  final Map<String, VoidCallback> _actionCallbacks = {};

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: nexaNativeLiquidGlassEnabled,
      builder: (context, _, __) {
        final nativeConfig = _buildNativeConfig(context);
        if (nativeConfig != null) {
          return _NativeNexaAppBar(
            config: nativeConfig,
            actionCallbacks: _actionCallbacks,
            toolbarHeight: widget.toolbarHeight,
          );
        }

        return AppBar(
          title: widget.title,
          leading: widget.leading,
          actions: widget.actions,
          automaticallyImplyLeading: widget.automaticallyImplyLeading,
          centerTitle: widget.centerTitle,
          backgroundColor: widget.backgroundColor,
          foregroundColor: widget.foregroundColor,
          surfaceTintColor: widget.surfaceTintColor,
          elevation: widget.elevation,
          scrolledUnderElevation: widget.scrolledUnderElevation,
          titleSpacing: widget.titleSpacing,
          titleTextStyle: widget.titleTextStyle,
          toolbarHeight: widget.toolbarHeight,
          leadingWidth: widget.leadingWidth,
          bottom: widget.bottom,
          flexibleSpace: widget.flexibleSpace,
        );
      },
    );
  }

  _NativeNexaAppBarConfig? _buildNativeConfig(BuildContext context) {
    if (widget.forceMaterial ||
        !nexaUseNativeLiquidGlass ||
        widget.bottom != null ||
        widget.flexibleSpace != null) {
      return null;
    }

    final title = _extractTitle(widget.title);
    if (title == null || title.isEmpty) return null;

    _actionCallbacks.clear();

    final leadingItems = <LiquidGlassNavBarItem>[];
    VoidCallback? backCallback;

    if (widget.leading != null) {
      final parsed = _parseBarButton(widget.leading!, 'leading');
      if (parsed == null) return null;
      leadingItems.add(parsed.item);
      _actionCallbacks[parsed.id] = parsed.onPressed;
    } else if (widget.automaticallyImplyLeading &&
        Navigator.of(context).canPop()) {
      backCallback = () => Navigator.of(context).maybePop();
      leadingItems.add(
        const LiquidGlassNavBarItem(
          id: 'back',
          icon: NativeLiquidGlassIcon.sfSymbol('chevron.left'),
          label: 'Voltar',
        ),
      );
    }

    final trailingItems = <LiquidGlassNavBarItem>[];
    final actions = widget.actions;
    if (actions != null) {
      for (var i = 0; i < actions.length; i++) {
        if (actions[i] is SizedBox) continue;
        final parsed = _parseBarButton(actions[i], 'action_$i');
        if (parsed == null) return null;
        trailingItems.add(parsed.item);
        _actionCallbacks[parsed.id] = parsed.onPressed;
      }
    }

    if (backCallback != null) {
      _actionCallbacks['back'] = backCallback;
    }

    return _NativeNexaAppBarConfig(
      title: title,
      leadingItems: leadingItems,
      trailingItems: trailingItems,
      tintColor: widget.foregroundColor,
      titleTextStyle: widget.titleTextStyle ?? _extractTitleStyle(widget.title),
    );
  }

  String? _extractTitle(Widget? titleWidget) {
    if (titleWidget == null) return null;
    if (titleWidget is Text) {
      if (titleWidget.data != null) return titleWidget.data;
      return titleWidget.textSpan?.toPlainText();
    }
    if (titleWidget is Align) return _extractTitle(titleWidget.child);
    return null;
  }

  TextStyle? _extractTitleStyle(Widget? titleWidget) {
    if (titleWidget is Text) return titleWidget.style;
    if (titleWidget is Align) return _extractTitleStyle(titleWidget.child);
    return null;
  }

  _ParsedBarButton? _parseBarButton(Widget widget, String defaultId) {
    if (widget is Padding) {
      return _parseBarButton(widget.child ?? const SizedBox(), defaultId);
    }
    if (widget is IconButton) {
      final icon = widget.icon;
      if (icon is Icon && icon.icon != null) {
        return _parsedFromIcon(
          id: defaultId,
          iconData: icon.icon!,
          onPressed: widget.onPressed ?? () {},
        );
      }
      return null;
    }
    if (widget is InkWell) {
      final iconData = _extractIconData(widget.child);
      if (iconData != null) {
        return _parsedFromIcon(
          id: defaultId,
          iconData: iconData,
          onPressed: widget.onTap ?? () {},
        );
      }
      if (widget.child != null) {
        return _parseBarButton(widget.child!, defaultId);
      }
    }
    if (widget is Material) {
      if (widget.child != null) {
        return _parseBarButton(widget.child!, defaultId);
      }
    }
    if (widget is SizedBox && widget.child != null) {
      return _parseBarButton(widget.child!, defaultId);
    }
    return null;
  }

  IconData? _extractIconData(Widget? widget) {
    if (widget == null) return null;
    if (widget is Icon) return widget.icon;
    if (widget is Padding) return _extractIconData(widget.child);
    if (widget is SizedBox) return _extractIconData(widget.child);
    if (widget is Center) return _extractIconData(widget.child);
    return null;
  }

  _ParsedBarButton? _parsedFromIcon({
    required String id,
    required IconData iconData,
    required VoidCallback onPressed,
  }) {
    final sfSymbol = _materialIconToSfSymbol(iconData);
    return _ParsedBarButton(
      id: id,
      onPressed: onPressed,
      item: LiquidGlassNavBarItem(
        id: id,
        icon: sfSymbol != null
            ? NativeLiquidGlassIcon.sfSymbol(sfSymbol)
            : NativeLiquidGlassIcon.iconData(iconData),
      ),
    );
  }
}

class _NativeNexaAppBar extends StatelessWidget {
  const _NativeNexaAppBar({
    required this.config,
    required this.actionCallbacks,
    required this.toolbarHeight,
  });

  final _NativeNexaAppBarConfig config;
  final Map<String, VoidCallback> actionCallbacks;
  final double toolbarHeight;

  @override
  Widget build(BuildContext context) {
    return Material(
      type: MaterialType.transparency,
      child: SizedBox(
        height: toolbarHeight,
        child: LiquidGlassNavigationBar(
          title: config.title,
          leadingItems: config.leadingItems,
          trailingItems: config.trailingItems,
          tintColor: config.tintColor,
          titleTextStyle: config.titleTextStyle,
          height: toolbarHeight,
          onItemTapped: (id) => actionCallbacks[id]?.call(),
        ),
      ),
    );
  }
}

class _NativeNexaAppBarConfig {
  const _NativeNexaAppBarConfig({
    required this.title,
    required this.leadingItems,
    required this.trailingItems,
    this.tintColor,
    this.titleTextStyle,
  });

  final String title;
  final List<LiquidGlassNavBarItem> leadingItems;
  final List<LiquidGlassNavBarItem> trailingItems;
  final Color? tintColor;
  final TextStyle? titleTextStyle;
}

class _ParsedBarButton {
  const _ParsedBarButton({
    required this.id,
    required this.item,
    required this.onPressed,
  });

  final String id;
  final LiquidGlassNavBarItem item;
  final VoidCallback onPressed;
}

String? _materialIconToSfSymbol(IconData icon) {
  return switch (icon) {
    Icons.arrow_back ||
    Icons.arrow_back_rounded ||
    Icons.arrow_back_ios_new_rounded ||
    Icons.chevron_left ||
    Icons.chevron_left_rounded =>
      'chevron.left',
    Icons.search || Icons.search_rounded => 'magnifyingglass',
    Icons.tune || Icons.tune_rounded => 'slider.horizontal.3',
    Icons.share || Icons.share_rounded => 'square.and.arrow.up',
    Icons.summarize_outlined || Icons.description_outlined => 'doc.text',
    Icons.insights_outlined || Icons.bar_chart_rounded => 'chart.bar',
    Icons.auto_fix_high_rounded => 'wand.and.stars',
    Icons.admin_panel_settings_outlined => 'gearshape.2',
    Icons.settings || Icons.settings_outlined => 'gearshape',
    Icons.more_horiz || Icons.more_horiz_rounded => 'ellipsis',
    Icons.close || Icons.close_rounded => 'xmark',
    Icons.check || Icons.check_rounded => 'checkmark',
    Icons.edit || Icons.edit_outlined => 'square.and.pencil',
    Icons.filter_list_rounded => 'line.3.horizontal.decrease.circle',
    Icons.notifications_outlined => 'bell',
    Icons.person_outline || Icons.person => 'person',
    _ => null,
  };
}
