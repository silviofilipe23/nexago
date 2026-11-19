import ActivityKit
import Foundation

/// Live Activity "minha próxima partida" (Modo Focus). Compilado nos DOIS
/// alvos: no app (Runner), que inicia a activity, e na extensão, que desenha o
/// card. O ActivityKit casa os dois pelo nome do tipo.
///
/// CONTRATO: `ContentState` espelha `NextMatchContentState` de
/// `functions/src/next-match-live-activity-state.ts` campo a campo (o teste
/// "CONTRATO" de lá fixa o JSON). O mesmo JSON chega por dois caminhos: pela
/// ponte (estado inicial, devolvido pela callable) e pelo push do servidor.
@available(iOS 16.1, *)
struct NextMatchAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    /// Texto cru: fase desconhecida não pode derrubar o decode do push.
    /// Ler por `NextMatchPhase`.
    var phase: String
    var matchId: String?
    /// "Quadra 3" / "Central"
    var courtLabel: String?
    /// "Q3" / "Central" — a ilha compacta.
    var courtShort: String?
    /// "Rafa / Bruno" / "Vencedor do Jogo 14"
    var opponent: String
    /// "Grupo A · Rodada 2" / "Quartas de final"
    var phaseLabel: String
    /// Horário previsto; `nil` = na fila, sem horário.
    var scheduleTimeMs: Double?
    /// A linha do dia: resultados, o próximo, os que vêm depois.
    var day: [NextMatchDayItem]
    /// "2 vitórias · 1 derrota" (aguardando a próxima fase / fim do dia).
    var summary: String?
    /// Só em `playing`: o card vira placar sem trocar de activity.
    var score: NextMatchScore?

    init(from decoder: Decoder) throws {
      // Tolerante: campo que faltar no push vira o padrão em vez de descartar
      // a atualização inteira.
      let c = try decoder.container(keyedBy: CodingKeys.self)
      phase = try c.decodeIfPresent(String.self, forKey: .phase) ?? "scheduled"
      matchId = try c.decodeIfPresent(String.self, forKey: .matchId)
      courtLabel = try c.decodeIfPresent(String.self, forKey: .courtLabel)
      courtShort = try c.decodeIfPresent(String.self, forKey: .courtShort)
      opponent = try c.decodeIfPresent(String.self, forKey: .opponent) ?? ""
      phaseLabel = try c.decodeIfPresent(String.self, forKey: .phaseLabel) ?? ""
      scheduleTimeMs = try c.decodeIfPresent(Double.self, forKey: .scheduleTimeMs)
      day = try c.decodeIfPresent([NextMatchDayItem].self, forKey: .day) ?? []
      summary = try c.decodeIfPresent(String.self, forKey: .summary)
      score = try c.decodeIfPresent(NextMatchScore.self, forKey: .score)
    }

    var scheduleTime: Date? {
      scheduleTimeMs.map { Date(timeIntervalSince1970: $0 / 1000) }
    }
  }

  var tournamentId: String
  /// "Copa Verão"
  var tournamentName: String
  /// "Masculino B" (pode vir vazio)
  var categoryName: String
}

/// O placar sob a ótica do atleta: "meu" lado primeiro.
struct NextMatchScore: Codable, Hashable {
  var mySets: Int
  var theirSets: Int
  /// Pontos (ou games) do set em jogo.
  var myPoints: Int
  var theirPoints: Int
  /// 1-based: "2º set".
  var set: Int
  /// "me" | "them" | nil
  var serving: String?
  /// "points" | "games" (beach tennis/tênis: os pontos são os games do set).
  var unit: String?
  /// O game em andamento, meu lado primeiro: "40–15"; no tie-break, "5–4".
  var game: String?
  /// "tb" | "super" | nil
  var tiebreak: String?
}

struct NextMatchDayItem: Codable, Hashable {
  /// "win" | "loss" | "done" | "next" | "upcoming"
  var kind: String
  /// "V 2–0" / "15:40" / "Fila" / "Agora"
  var label: String
}

enum NextMatchPhase: String {
  case scheduled
  case called
  case playing
  case waiting
  case dayOver

  init(wire: String) {
    self = NextMatchPhase(rawValue: wire) ?? .scheduled
  }
}
