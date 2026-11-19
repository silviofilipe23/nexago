import ActivityKit
import SwiftUI
import WidgetKit

/// Card do Pix pendente — modelo C (anel + trilha de etapas), desenhado no
/// canvas "Live Activity do Pix" (página App do Atleta do Claude Design).
struct PixPaymentLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PixPaymentAttributes.self) { context in
      PixLockScreenView(attributes: context.attributes, display: PixDisplay(context))
        .activityBackgroundTint(PixPalette.card)
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      let display = PixDisplay(context)
      let attributes = context.attributes
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          PixRing(attributes: attributes, display: display, showsTime: true)
            .frame(width: 64, height: 64)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .leading, spacing: 3) {
            Text(attributes.amountLabel)
              .font(.system(size: 18, weight: .semibold))
              .monospacedDigit()
              .lineLimit(1)
              .minimumScaleFactor(0.7)
              .foregroundStyle(.white)
            Text(attributes.summary)
              .font(.system(size: 12))
              .foregroundStyle(PixPalette.muted)
              .lineLimit(2)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 10) {
            if display.phase == .urgent {
              Text("Pague agora para não perder o horário")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(PixPalette.live)
            }
            PixSteps(display: display)
          }
          // A borda da ilha é curva: sem folga, "Pix gerado" e "Confirmado"
          // ficam cortados nas pontas.
          .padding(.horizontal, 8)
          .padding(.top, 4)
        }
      } compactLeading: {
        PixRing(attributes: attributes, display: display, showsTime: false)
          .frame(width: 20, height: 20)
      } compactTrailing: {
        PixCompactLabel(attributes: attributes, display: display)
      } minimal: {
        PixRing(attributes: attributes, display: display, showsTime: false)
          .frame(width: 20, height: 20)
      }
      .keylineTint(display.tint)
    }
  }
}

// MARK: - Estado de exibição

enum PixPalette {
  static let brand = Color(red: 1, green: 106 / 255, blue: 26 / 255)
  static let live = Color(red: 1, green: 59 / 255, blue: 48 / 255)
  static let win = Color(red: 43 / 255, green: 209 / 255, blue: 126 / 255)
  static let muted = Color(red: 154 / 255, green: 154 / 255, blue: 163 / 255)
  static let track = Color(red: 44 / 255, green: 44 / 255, blue: 49 / 255)
  static let card = Color(red: 24 / 255, green: 24 / 255, blue: 28 / 255)
}

/// Fase que o card mostra. O `staleDate` da activity é o prazo do Pix: passou
/// dele sem push de pago, o próprio iPhone já mostra "Expirou" — o push do
/// servidor só vem depois, para encerrar.
struct PixDisplay {
  let phase: PixPaymentPhase

  init(_ context: ActivityViewContext<PixPaymentAttributes>) {
    let pushed = PixPaymentPhase(wire: context.state.phase)
    phase = (context.isStale && pushed.isOpen) ? .expired : pushed
  }

  var tint: Color {
    switch phase {
    case .waiting: return PixPalette.brand
    case .urgent: return PixPalette.live
    case .paid: return PixPalette.win
    case .expired: return PixPalette.muted
    }
  }

  var title: String {
    switch phase {
    case .waiting: return "Aguardando seu Pix"
    case .urgent: return "Pix expira em instantes"
    case .paid: return "Pagamento confirmado"
    case .expired: return "Pix expirou"
    }
  }
}

private extension PixPaymentAttributes {
  /// Intervalo do anel e do relógio. Protege contra prazo anterior à criação
  /// (relógio do aparelho errado): `ClosedRange` invertido derruba a view.
  var countdown: ClosedRange<Date> {
    createdAt <= expiresAt ? createdAt...expiresAt : expiresAt...expiresAt
  }
}

// MARK: - Peças

/// Anel que esvazia sozinho até o prazo (sem push por segundo).
struct PixRing: View {
  let attributes: PixPaymentAttributes
  let display: PixDisplay
  let showsTime: Bool

  var body: some View {
    ZStack {
      if display.phase.isOpen {
        ProgressView(
          timerInterval: attributes.countdown,
          countsDown: true,
          label: { EmptyView() },
          currentValueLabel: { EmptyView() }
        )
        .progressViewStyle(.circular)
        .tint(display.tint)
        if showsTime {
          Text(timerInterval: attributes.countdown, countsDown: true)
            .font(.system(size: 14, weight: .semibold, design: .monospaced))
            .monospacedDigit()
            .multilineTextAlignment(.center)
            .foregroundStyle(display.tint)
            .frame(width: 52)
        }
      } else {
        Circle()
          .stroke(display.phase == .paid ? PixPalette.win : PixPalette.track, lineWidth: 2.5)
        Image(systemName: display.phase == .paid ? "checkmark" : "clock")
          .font(.system(size: showsTime ? 22 : 9, weight: .bold))
          .foregroundStyle(display.tint)
      }
    }
  }
}

/// Lado direito da ilha compacta: o relógio, ou o desfecho.
struct PixCompactLabel: View {
  let attributes: PixPaymentAttributes
  let display: PixDisplay

  var body: some View {
    switch display.phase {
    case .waiting, .urgent:
      Text(timerInterval: attributes.countdown, countsDown: true)
        .font(.system(size: 14, weight: .semibold, design: .monospaced))
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
        .foregroundStyle(display.tint)
        .frame(width: 46)
    case .paid:
      Text("Pago")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(PixPalette.win)
    case .expired:
      Text("Expirou")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(PixPalette.muted)
    }
  }
}

/// Trilha "Pix gerado → Pagamento → Confirmado".
struct PixSteps: View {
  let display: PixDisplay

  private var middleColor: Color {
    switch display.phase {
    case .waiting: return PixPalette.brand
    case .urgent, .expired: return PixPalette.live
    case .paid: return PixPalette.win
    }
  }

  private var doneColor: Color {
    display.phase == .paid ? PixPalette.win : PixPalette.track
  }

  var body: some View {
    VStack(spacing: 5) {
      HStack(spacing: 0) {
        dot(PixPalette.win)
        line(doneColor)
        dot(middleColor)
        line(doneColor)
        dot(doneColor)
      }
      HStack {
        Text("Pix gerado").foregroundStyle(.white)
        Spacer()
        Text(display.phase == .expired ? "Expirou" : "Pagamento")
          .foregroundStyle(middleColor)
        Spacer()
        Text("Confirmado")
          .foregroundStyle(display.phase == .paid ? PixPalette.win : PixPalette.muted)
      }
      .font(.system(size: 11))
    }
  }

  private func dot(_ color: Color) -> some View {
    Circle().fill(color).frame(width: 10, height: 10)
  }

  private func line(_ color: Color) -> some View {
    Rectangle().fill(color).frame(height: 2)
  }
}

// MARK: - Tela bloqueada

struct PixLockScreenView: View {
  let attributes: PixPaymentAttributes
  let display: PixDisplay

  private var contextLine: String {
    switch display.phase {
    case .expired:
      return "O prazo acabou sem pagamento · \(attributes.summary)"
    case .waiting, .urgent, .paid:
      return "\(attributes.amountLabel) · \(attributes.summary) · \(attributes.detail)"
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 6) {
        Circle().fill(display.tint).frame(width: 6, height: 6)
        Text("NEXAGO · \(attributes.title.uppercased())")
          .font(.system(size: 10, weight: .semibold, design: .monospaced))
          .foregroundStyle(PixPalette.muted)
      }
      .padding(.bottom, 8)

      HStack(spacing: 9) {
        PixRing(attributes: attributes, display: display, showsTime: false)
          .frame(width: 20, height: 20)
        Text(display.title)
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(.white)
          .lineLimit(1)
        Spacer(minLength: 8)
        if display.phase.isOpen {
          Text(timerInterval: attributes.countdown, countsDown: true)
            .font(.system(size: 13, weight: .semibold, design: .monospaced))
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
            .foregroundStyle(display.tint)
            .frame(width: 48)
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.08)))
        }
      }

      Text(contextLine)
        .font(.system(size: 12.5))
        .foregroundStyle(Color.white.opacity(0.62))
        .lineLimit(2)
        .padding(.top, 6)

      PixSteps(display: display)
        .padding(.top, 14)
    }
    .padding(16)
  }
}
