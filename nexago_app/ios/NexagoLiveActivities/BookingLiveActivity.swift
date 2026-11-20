import ActivityKit
import SwiftUI
import WidgetKit

/// Card da reserva de quadra (L3) — desenhado no canvas "Live Activity da
/// reserva (L3)" (página App do Atleta do Claude Design). Mesma linguagem do
/// Pix modelo C: anel que esvazia e trilha de etapas.
struct BookingLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: BookingAttributes.self) { context in
      let display = BookingDisplay(context)
      BookingLockScreenView(attributes: context.attributes, display: display)
        .activityBackgroundTint(PixPalette.card)
        .activitySystemActionForegroundColor(.white)
        .widgetURL(display.url(for: context.attributes))
    } dynamicIsland: { context in
      let display = BookingDisplay(context)
      let attributes = context.attributes
      return DynamicIsland {
        // Ao lado da câmera só cabe a marca; anel e texto vão juntos na faixa
        // de baixo, que tem a largura toda (na região da direita o título
        // cortava: "Em quadra at…").
        DynamicIslandExpandedRegion(.leading) {
          NexaBrandMark()
            .padding(.leading, 6)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 10) {
            HStack(spacing: 12) {
              BookingRing(attributes: attributes, display: display, showsTime: true)
                .frame(width: 60, height: 60)
              VStack(alignment: .leading, spacing: 2) {
                Text(display.islandTitle(attributes))
                  .font(.system(size: 17, weight: .bold))
                  .foregroundStyle(.white)
                  .lineLimit(1)
                  .minimumScaleFactor(0.8)
                Text(attributes.arenaName)
                  .font(.system(size: 13))
                  .foregroundStyle(PixPalette.muted)
                  .lineLimit(1)
                Text(attributes.courtName)
                  .font(.system(size: 13))
                  .foregroundStyle(PixPalette.muted)
                  .lineLimit(1)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
            BookingSteps(display: display)
          }
          .padding(.horizontal, 8)
        }
      } compactLeading: {
        BookingRing(attributes: attributes, display: display, showsTime: false)
          .frame(width: 20, height: 20)
      } compactTrailing: {
        BookingStatusText(attributes: attributes, display: display, size: 13)
          .frame(maxWidth: 64)
      } minimal: {
        BookingRing(attributes: attributes, display: display, showsTime: false)
          .frame(width: 20, height: 20)
      }
      .widgetURL(display.url(for: attributes))
      .keylineTint(display.tint)
    }
  }
}

// MARK: - Estado de exibição

/// Etapa que o card mostra. O relógio manda junto com o push: sem push nenhum
/// (chave .p8 ausente), o `staleDate` = início faz o card passar a "em quadra"
/// sozinho, e o horário do fim decide o "Placar" quando o card é redesenhado.
struct BookingDisplay {
  let phase: BookingPhase

  init(_ context: ActivityViewContext<BookingAttributes>) {
    let pushed = BookingPhase(wire: context.state.phase)
    let now = Date()
    let attributes = context.attributes
    switch pushed {
    case .upcoming, .onCourt:
      if now >= attributes.endAt {
        phase = .finished
      } else if pushed == .upcoming && (context.isStale || now >= attributes.startAt) {
        phase = .onCourt
      } else {
        phase = pushed
      }
    case .finished, .canceled:
      phase = pushed
    }
  }

  var tint: Color {
    switch phase {
    case .upcoming, .onCourt: return PixPalette.brand
    case .finished: return PixPalette.win
    case .canceled: return PixPalette.muted
    }
  }

  var eyebrow: String {
    switch phase {
    case .upcoming: return "NEXAGO · RESERVA"
    case .onCourt: return "NEXAGO · EM QUADRA"
    case .finished: return "NEXAGO · FIM DE JOGO"
    case .canceled: return "NEXAGO · RESERVA CANCELADA"
    }
  }

  func islandTitle(_ a: BookingAttributes) -> String {
    switch phase {
    case .upcoming: return "Reserva \(a.startLabel)"
    case .onCourt: return "Em quadra até \(a.endLabel)"
    case .finished: return "Como foi o jogo?"
    case .canceled: return "Reserva cancelada"
    }
  }

  /// O intervalo que o anel e a contagem acompanham agora.
  func countdown(_ a: BookingAttributes) -> ClosedRange<Date>? {
    let now = Date()
    switch phase {
    case .upcoming:
      let from = min(a.createdAt, a.startAt)
      return a.startAt > now ? from...a.startAt : nil
    case .onCourt:
      return a.endAt > now ? a.startAt...a.endAt : nil
    case .finished, .canceled:
      return nil
    }
  }

  /// Toque: o detalhe da reserva; no fim, o lançar placar.
  func url(for a: BookingAttributes) -> URL? {
    let id = a.bookingId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? a.bookingId
    return URL(string: phase == .finished ? "nexago://reserva/\(id)/placar" : "nexago://reserva/\(id)")
  }
}

// MARK: - Peças

/// Assinatura discreta da Nexa no canto da ilha expandida: o "N" laranja
/// (`Assets.xcassets/NexaMark`) e o nome em cinza.
struct NexaBrandMark: View {
  var body: some View {
    HStack(spacing: 5) {
      Image("NexaMark")
        .resizable()
        .scaledToFit()
        .frame(width: 14, height: 14)
      Text("nexaGO")
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(PixPalette.muted)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("nexaGO")
  }
}

/// Anel que esvazia sozinho até o início (Chegar) ou até o fim (Em quadra).
struct BookingRing: View {
  let attributes: BookingAttributes
  let display: BookingDisplay
  let showsTime: Bool

  var body: some View {
    ZStack {
      if let range = display.countdown(attributes) {
        ProgressView(
          timerInterval: range,
          countsDown: true,
          label: { EmptyView() },
          currentValueLabel: { EmptyView() }
        )
        .progressViewStyle(.circular)
        .tint(display.tint)
        if showsTime {
          // "1:51:41" cabe numa linha só com fonte menor (o texto de timer
          // não encolhe sozinho).
          Text(timerInterval: range, countsDown: true)
            .font(.system(size: range.upperBound.timeIntervalSinceNow >= 3600 ? 10.5 : 13,
                          weight: .semibold, design: .monospaced))
            .monospacedDigit()
            .multilineTextAlignment(.center)
            .lineLimit(1)
            .foregroundStyle(.white)
            .frame(width: 50)
        }
      } else {
        Circle()
          .stroke(display.phase == .finished ? PixPalette.win : PixPalette.track, lineWidth: 2.5)
        Image(systemName: display.phase == .finished ? "checkmark" : "xmark")
          .font(.system(size: showsTime ? 22 : 9, weight: .bold))
          .foregroundStyle(display.tint)
      }
    }
  }
}

/// A contagem (até o início ou até o fim) ou o desfecho.
struct BookingStatusText: View {
  let attributes: BookingAttributes
  let display: BookingDisplay
  let size: CGFloat

  var body: some View {
    if let range = display.countdown(attributes) {
      Text(timerInterval: range, countsDown: true)
        .font(.system(size: size, weight: .semibold, design: .monospaced))
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
        .foregroundStyle(display.tint)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    } else {
      Text(display.phase == .canceled ? "Cancelada" : "Jogado")
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(display.tint)
        .lineLimit(1)
    }
  }
}

/// Trilha "Chegar → Em quadra → Placar".
struct BookingSteps: View {
  let display: BookingDisplay

  private var activeIndex: Int {
    switch display.phase {
    case .upcoming, .canceled: return 0
    case .onCourt: return 1
    case .finished: return 2
    }
  }

  private func dotColor(_ index: Int) -> Color {
    if display.phase == .canceled { return PixPalette.track }
    if index < activeIndex { return PixPalette.win }
    if index == activeIndex { return display.phase == .finished ? PixPalette.win : PixPalette.brand }
    return PixPalette.track
  }

  private func lineColor(_ index: Int) -> Color {
    index < activeIndex && display.phase != .canceled ? PixPalette.win : PixPalette.track
  }

  private func label(_ text: String, _ index: Int) -> some View {
    Text(text)
      .font(.system(size: 11, weight: index == activeIndex ? .bold : .regular))
      .foregroundStyle(index == activeIndex ? Color.white : PixPalette.muted)
  }

  var body: some View {
    VStack(spacing: 5) {
      HStack(spacing: 0) {
        dot(0)
        Rectangle().fill(lineColor(0)).frame(height: 2)
        dot(1)
        Rectangle().fill(lineColor(1)).frame(height: 2)
        dot(2)
      }
      HStack {
        label("Chegar", 0)
        Spacer()
        label("Em quadra", 1)
        Spacer()
        label("Placar", 2)
      }
    }
  }

  private func dot(_ index: Int) -> some View {
    Circle()
      .fill(dotColor(index))
      .frame(width: 10, height: 10)
      .overlay(
        Circle()
          .stroke(dotColor(index).opacity(index == activeIndex ? 0.3 : 0), lineWidth: 4)
          .frame(width: 17, height: 17)
      )
  }
}

// MARK: - Tela bloqueada

struct BookingLockScreenView: View {
  let attributes: BookingAttributes
  let display: BookingDisplay

  private var title: String? {
    switch display.phase {
    case .upcoming: return "Jogo às \(attributes.startLabel)"
    case .finished: return "Como foi o jogo?"
    case .canceled: return "Reserva cancelada"
    case .onCourt: return nil
    }
  }

  private var context: String {
    let place = "\(attributes.arenaName) · \(attributes.courtName)"
    switch display.phase {
    case .upcoming:
      return "\(place) · \(attributes.confirmed) de \(attributes.totalSlots) confirmados"
    case .onCourt:
      return "\(place) · termina às \(attributes.endLabel)"
    case .finished, .canceled:
      return place
    }
  }

  var body: some View {
    // A tela bloqueada dá ~160 pt: no fim de jogo o botão ocupa o lugar do
    // contexto e da trilha (o "Placar" já está no título e no botão).
    let finished = display.phase == .finished
    VStack(alignment: .leading, spacing: finished ? 6 : 8) {
      HStack {
        Text(display.eyebrow)
          .font(.system(size: 10, weight: .bold, design: .monospaced))
          .tracking(1)
          .foregroundStyle(PixPalette.muted)
          .lineLimit(1)
        Spacer(minLength: 8)
        BookingStatusText(attributes: attributes, display: display, size: 14)
          .frame(width: 72)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .background(RoundedRectangle(cornerRadius: 10).fill(display.tint.opacity(0.16)))
      }
      if let title {
        Text(title)
          .font(.system(size: 19, weight: .bold))
          .foregroundStyle(.white)
          .lineLimit(1)
      }
      Text(context)
        .font(.system(size: 12.5))
        .foregroundStyle(Color.white.opacity(0.75))
        .lineLimit(1)
      if finished, let url = display.url(for: attributes) {
        Link(destination: url) {
          Text("Lançar placar")
            .font(.system(size: 15, weight: .heavy))
            .foregroundStyle(Color(red: 11 / 255, green: 11 / 255, blue: 12 / 255))
            .frame(maxWidth: .infinity)
            .frame(height: 36)
            .background(RoundedRectangle(cornerRadius: 12).fill(PixPalette.brand))
        }
        .padding(.top, 2)
      } else {
        BookingSteps(display: display)
          .padding(.top, 2)
      }
    }
    .padding(16)
  }
}
