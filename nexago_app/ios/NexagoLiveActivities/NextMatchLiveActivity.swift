import ActivityKit
import SwiftUI
import WidgetKit

/// Card "minha próxima partida" — desenhado no canvas "Live Activity · minha
/// próxima partida (Modo Focus)" (página App do Atleta do Claude Design).
struct NextMatchLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: NextMatchAttributes.self) { context in
      NextMatchLockScreenView(attributes: context.attributes, display: NextMatchDisplay(context))
        .activityBackgroundTint(PixPalette.card)
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      let display = NextMatchDisplay(context)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          NextMatchCourtBox(display: display)
            .frame(width: 58, height: 58)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .leading, spacing: 3) {
            Text(display.islandHeadline)
              .font(.system(size: 15, weight: .bold))
              .foregroundStyle(.white)
              .lineLimit(1)
              .minimumScaleFactor(0.8)
            Text(display.subline)
              .font(.system(size: 12))
              .foregroundStyle(PixPalette.muted)
              .lineLimit(1)
            NextMatchStatusText(display: display, size: 15)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        DynamicIslandExpandedRegion(.bottom) {
          NextMatchDayStrip(display: display)
            // A borda da ilha é curva: sem folga, as pontas da linha somem.
            .padding(.horizontal, 8)
            .padding(.top, 6)
        }
      } compactLeading: {
        NextMatchCourtBadge(display: display, size: 22)
      } compactTrailing: {
        NextMatchStatusText(display: display, size: 13)
          .frame(maxWidth: 64)
      } minimal: {
        NextMatchCourtBadge(display: display, size: 22)
      }
      .keylineTint(display.tint)
    }
  }
}

// MARK: - Estado de exibição

/// "15:40" no fuso do evento — o mesmo `eventTimeLabel` do servidor; o fuso do
/// aparelho mostraria outro horário para quem está viajando.
private let eventTimeFormatter: DateFormatter = {
  let f = DateFormatter()
  f.locale = Locale(identifier: "pt_BR")
  f.timeZone = TimeZone(identifier: "America/Sao_Paulo")
  f.dateFormat = "HH:mm"
  return f
}()

/// Âmbar do atraso (o laranja da marca já é o "agendado").
private let lateAmber = Color(red: 1, green: 176 / 255, blue: 32 / 255)

/// O que o card mostra. O `staleDate` da activity agendada é o horário
/// previsto: passou dele sem a partida começar, o próprio iPhone mostra o
/// atraso — sem push.
struct NextMatchDisplay {
  let state: NextMatchAttributes.ContentState
  let phase: NextMatchPhase
  let isLate: Bool

  init(_ context: ActivityViewContext<NextMatchAttributes>) {
    state = context.state
    phase = NextMatchPhase(wire: context.state.phase)
    // `isStale` cobre o horário que passa com o card na tela; a comparação com
    // agora cobre o card que já nasce atrasado (sem `staleDate`, ver a ponte).
    isLate = phase == .scheduled &&
      (context.state.scheduleTime.map { context.isStale || $0 <= Date() } ?? false)
  }

  var tint: Color {
    if isLate { return lateAmber }
    switch phase {
    case .scheduled, .playing: return PixPalette.brand
    case .called: return PixPalette.live
    case .waiting: return PixPalette.muted
    case .dayOver: return PixPalette.win
    }
  }

  private var court: String? { state.courtLabel }

  var headline: String {
    switch phase {
    case .scheduled: return court.map { "Próximo jogo · \($0)" } ?? "Próximo jogo"
    case .called: return court.map { "Vá para a \($0)" } ?? "Sua partida foi chamada"
    case .playing: return court.map { "Em jogo · \($0)" } ?? "Em jogo"
    case .waiting: return "Aguardando a próxima fase"
    case .dayOver: return "Seu dia terminou"
    }
  }

  /// Na ilha expandida a quadra já está no quadrado ao lado: o título não a
  /// repete (não caberia).
  var islandHeadline: String {
    switch phase {
    case .scheduled: return "Próximo jogo"
    case .called: return "Vá para a quadra"
    case .playing: return "Em jogo"
    case .waiting, .dayOver: return headline
    }
  }

  var subline: String {
    switch phase {
    case .scheduled, .called, .playing:
      return state.opponent.isEmpty ? state.phaseLabel : "vs \(state.opponent)"
    case .waiting, .dayOver:
      return state.summary ?? "Bom jogo hoje"
    }
  }

  /// "Grupo A · Rodada 2 · previsto 15:40"
  var detailLine: String {
    var parts = [state.phaseLabel].filter { !$0.isEmpty }
    switch phase {
    case .scheduled:
      if let time = state.scheduleTime {
        parts.append("previsto \(eventTimeFormatter.string(from: time))")
      } else {
        parts.append("sem horário, na fila")
      }
    case .called:
      parts.append("a mesa chamou sua dupla")
    case .playing, .waiting, .dayOver:
      break
    }
    return parts.joined(separator: " · ")
  }

  /// Contagem até o horário, quando ainda está no futuro.
  var countdown: ClosedRange<Date>? {
    guard phase == .scheduled, !isLate, let time = state.scheduleTime else { return nil }
    let now = Date()
    return time > now ? now...time : nil
  }

  /// Rótulo do status quando não há contagem.
  var statusLabel: String {
    if isLate { return "Atrasado" }
    switch phase {
    case .scheduled: return "Na fila"
    case .called: return "Chamada"
    case .playing: return "● Ao vivo"
    case .waiting: return "Aguarde"
    case .dayOver: return "Fim"
    }
  }
}

// MARK: - Peças

/// "Q3" num quadrado da cor do estado; ✓ no fim do dia.
struct NextMatchCourtBadge: View {
  let display: NextMatchDisplay
  let size: CGFloat

  private var label: String {
    switch display.phase {
    case .dayOver: return "✓"
    case .waiting: return "…"
    default: return display.state.courtShort ?? "—"
    }
  }

  var body: some View {
    let solid = display.phase == .called || display.phase == .playing
    Text(label)
      .font(.system(size: size * 0.45, weight: .semibold, design: .monospaced))
      .lineLimit(1)
      .minimumScaleFactor(0.5)
      .foregroundStyle(solid ? .white : display.tint)
      .frame(width: size, height: size)
      .background(
        RoundedRectangle(cornerRadius: size * 0.3)
          .fill(solid ? display.tint : display.tint.opacity(0.18))
      )
  }
}

/// Quadra em destaque na ilha expandida.
struct NextMatchCourtBox: View {
  let display: NextMatchDisplay

  private var number: String? {
    guard let court = display.state.courtLabel,
          let range = court.range(of: #"\d+"#, options: .regularExpression) else { return nil }
    return String(court[range])
  }

  var body: some View {
    VStack(spacing: 2) {
      if let number, display.phase != .dayOver, display.phase != .waiting {
        Text(number)
          .font(.system(size: 24, weight: .semibold, design: .monospaced))
        Text("QUADRA")
          .font(.system(size: 8, weight: .semibold))
          .tracking(1)
      } else {
        NextMatchCourtBadge(display: display, size: 40)
      }
    }
    .foregroundStyle(display.tint)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(
      RoundedRectangle(cornerRadius: 16)
        .fill(display.tint.opacity(0.14))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(display.tint, lineWidth: 1.5))
    )
  }
}

/// A contagem nativa (sem push por segundo) ou o rótulo do estado.
struct NextMatchStatusText: View {
  let display: NextMatchDisplay
  let size: CGFloat

  var body: some View {
    if let range = display.countdown {
      Text(timerInterval: range, countsDown: true)
        .font(.system(size: size, weight: .semibold, design: .monospaced))
        .monospacedDigit()
        .multilineTextAlignment(.leading)
        .foregroundStyle(display.tint)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    } else {
      Text(display.statusLabel)
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(display.tint)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
  }
}

/// A linha do dia: resultado, o próximo, os que vêm depois.
struct NextMatchDayStrip: View {
  let display: NextMatchDisplay

  private func color(_ kind: String) -> Color {
    switch kind {
    case "win": return PixPalette.win
    case "loss": return PixPalette.live
    case "next": return display.tint
    case "done": return PixPalette.muted
    default: return PixPalette.track
    }
  }

  var body: some View {
    let items = display.state.day
    HStack(alignment: .top, spacing: 0) {
      ForEach(Array(items.enumerated()), id: \.offset) { index, item in
        if index > 0 {
          Rectangle()
            .fill(PixPalette.track)
            .frame(height: 2)
            .padding(.top, 4)
        }
        VStack(spacing: 5) {
          Circle()
            .fill(color(item.kind))
            .frame(width: 10, height: 10)
            .overlay(
              Circle()
                .stroke(color(item.kind).opacity(item.kind == "next" ? 0.3 : 0), lineWidth: 4)
                .frame(width: 18, height: 18)
            )
          Text(item.label)
            .font(.system(size: 10, design: .monospaced))
            .foregroundStyle(item.kind == "next" ? display.tint : PixPalette.muted)
            .lineLimit(1)
            .fixedSize()
        }
        .frame(minWidth: 40)
      }
    }
  }
}

// MARK: - Tela bloqueada

struct NextMatchLockScreenView: View {
  let attributes: NextMatchAttributes
  let display: NextMatchDisplay

  private var eyebrow: String {
    ["nexaGO", attributes.tournamentName, attributes.categoryName]
      .filter { !$0.isEmpty }
      .joined(separator: " · ")
      .uppercased()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 6) {
        Circle().fill(display.tint).frame(width: 6, height: 6)
        Text(eyebrow)
          .font(.system(size: 10, weight: .semibold, design: .monospaced))
          .foregroundStyle(PixPalette.muted)
          .lineLimit(1)
      }
      .padding(.bottom, 8)

      HStack(spacing: 10) {
        NextMatchCourtBadge(display: display, size: 34)
        VStack(alignment: .leading, spacing: 2) {
          Text(display.headline)
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
          Text(display.subline)
            .font(.system(size: 12.5))
            .foregroundStyle(Color.white.opacity(0.62))
            .lineLimit(1)
        }
        Spacer(minLength: 8)
        if display.phase != .waiting && display.phase != .dayOver {
          // Largura fixa: a contagem nativa ocupa todo o espaço que recebe e
          // empurraria o título para as reticências.
          NextMatchStatusText(display: display, size: 13)
            .frame(width: 66)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.08)))
        }
      }

      if !display.detailLine.isEmpty {
        Text(display.detailLine)
          .font(.system(size: 12.5))
          .foregroundStyle(Color.white.opacity(0.62))
          .lineLimit(1)
          .padding(.top, 8)
      }

      if !display.state.day.isEmpty {
        NextMatchDayStrip(display: display)
          .padding(.top, 14)
      }
    }
    .padding(16)
  }
}
