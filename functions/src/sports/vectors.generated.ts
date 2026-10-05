// GERADO por sports/codegen.mjs a partir de sports/catalog.json — não editar.

export const SPORT_NORMALIZE_VECTORS: ReadonlyArray<readonly [string, string]> = [
  ["Vôlei de praia", "voleidepraia"],
  ["beach_tennis", "beachtennis"],
  ["  BEACH-TENNIS ", "beachtennis"],
  ["Futevôlei", "futevolei"],
  ["AÇÃO ñ", "acaon"],
  ["", ""],
];

export const SPORT_RESOLVE_VECTORS: ReadonlyArray<readonly [string, string | null]> = [
  ["beachVolleyball", "beachVolleyball"],
  ["VOLEI_PRAIA", "beachVolleyball"],
  ["beach_volleyball", "beachVolleyball"],
  ["Vôlei de praia", "beachVolleyball"],
  ["beach_tennis", "beachTennis"],
  ["Beach tênis", "beachTennis"],
  ["Vôlei indoor", "indoorVolleyball"],
  ["futevolei", "footvolley"],
  ["TENIS", "tennis"],
  ["padel", "padel"],
  ["Pádel", "padel"],
  ["curling", null],
  ["", null],
];

export const SPORT_TITLE_CASE_VECTORS: ReadonlyArray<readonly [string, string]> = [
  ["curling", "Curling"],
  ["curling", "Curling"],
  ["FUTEVOLEI_MISTO", "Futevolei Misto"],
  ["beachTennisPro", "Beach Tennis Pro"],
  ["  ", ""],
];

export interface ScoringVectorCase {
  readonly profile: string;
  readonly sets: ReadonlyArray<{a: number; b: number; tb?: {a: number; b: number}}>;
  readonly setWinners: ReadonlyArray<"A" | "B" | null>;
  readonly matchWinner: "A" | "B" | null;
  readonly issues: readonly string[];
}

export interface ScoringLabelVector {
  readonly profile: string;
  readonly rulesLabel: string;
  readonly setLabels: readonly string[];
}

export interface ScoringTextVector {
  readonly profile: string;
  readonly index: number;
  readonly set: {a: number; b: number; tb?: {a: number; b: number}};
  readonly text: string;
}

export interface ScoringEventTextVector {
  readonly profile: string;
  readonly setIndex: number;
  readonly set: {a: number; b: number};
  readonly game: {a: number; b: number};
  readonly text: string;
}

export interface ScoringQuickVector {
  readonly profile: string;
  readonly index: number;
  readonly set: {a: number; b: number; tb?: {a: number; b: number}};
  readonly kind: "points" | "games" | "games_tiebreak" | "super_tiebreak";
  readonly normalized: {a: number; b: number; tb?: {a: number; b: number}};
}

export interface ScoringLiveState {
  readonly sets: ReadonlyArray<{a: number; b: number; tb?: {a: number; b: number}}>;
  readonly currentSetIndex: number;
  readonly currentGame: {a: number; b: number};
  readonly servingTeamId: string;
}

export interface ScoringLiveVector {
  readonly profile: string;
  readonly start?: ScoringLiveState;
  readonly points: string;
  readonly expect: ScoringLiveState & {
    readonly winnerSide: "A" | "B" | null;
    readonly closed: "none" | "game" | "set" | "match" | null;
  };
  readonly labels?: {a: string; b: string};
  readonly hint?: string;
}

export const SCORING_VECTORS: {readonly profiles: Readonly<Record<string, unknown>>; readonly cases: readonly ScoringVectorCase[]; readonly labelVectors: readonly ScoringLabelVector[]; readonly quickVectors: readonly ScoringQuickVector[]; readonly liveVectors: readonly ScoringLiveVector[]; readonly textVectors: readonly ScoringTextVector[]; readonly eventTextVectors: readonly ScoringEventTextVector[]} = {"profiles":{"legacy1":{"kind":"sets_points","bestOf":1,"setTarget":21,"decidingSetTarget":21,"winBy":2,"pointCap":null},"legacy3":{"kind":"sets_points","bestOf":3,"setTarget":21,"decidingSetTarget":15,"winBy":2,"pointCap":null},"legacy5":{"kind":"sets_points","bestOf":5,"setTarget":21,"decidingSetTarget":21,"winBy":2,"pointCap":null},"indoor3":{"kind":"sets_points","bestOf":3,"setTarget":25,"decidingSetTarget":15,"winBy":2,"pointCap":null},"capped1":{"kind":"sets_points","bestOf":1,"setTarget":21,"decidingSetTarget":21,"winBy":2,"pointCap":25},"bt3":{"kind":"sets_games","bestOf":3,"gamesPerSet":6,"winByGames":2,"tiebreakAtGames":6,"tiebreakTo":7,"noAd":true,"decidingSet":"super_tiebreak","superTiebreakTo":10},"tennis3":{"kind":"sets_games","bestOf":3,"gamesPerSet":6,"winByGames":2,"tiebreakAtGames":6,"tiebreakTo":7,"noAd":false,"decidingSet":"full","superTiebreakTo":10},"proSet1":{"kind":"sets_games","bestOf":1,"gamesPerSet":8,"winByGames":2,"tiebreakAtGames":8,"tiebreakTo":7,"noAd":true,"decidingSet":"full","superTiebreakTo":10},"advantage1":{"kind":"sets_games","bestOf":1,"gamesPerSet":6,"winByGames":2,"tiebreakAtGames":null,"tiebreakTo":7,"noAd":false,"decidingSet":"full","superTiebreakTo":10}},"cases":[{"profile":"legacy3","sets":[{"a":21,"b":19},{"a":15,"b":21},{"a":15,"b":13}],"setWinners":["A","B","A"],"matchWinner":"A","issues":[]},{"profile":"legacy3","sets":[{"a":21,"b":20}],"setWinners":[null],"matchWinner":null,"issues":["Set 1: vitória exige 21 pontos com vantagem de 2."]},{"profile":"legacy3","sets":[{"a":21,"b":15},{"a":21,"b":18}],"setWinners":["A","A"],"matchWinner":"A","issues":[]},{"profile":"legacy3","sets":[{"a":21,"b":15}],"setWinners":["A"],"matchWinner":null,"issues":["Complete o placar: nenhuma dupla venceu ainda."]},{"profile":"legacy3","sets":[{"a":21,"b":19},{"a":19,"b":21},{"a":14,"b":12}],"setWinners":["A","B",null],"matchWinner":null,"issues":["Set 3: vitória exige 15 pontos com vantagem de 2."]},{"profile":"legacy3","sets":[{"a":10,"b":10}],"setWinners":[null],"matchWinner":null,"issues":["Set 1: não pode terminar empatado."]},{"profile":"legacy3","sets":[{"a":100,"b":98}],"setWinners":["A"],"matchWinner":null,"issues":["Set 1: placar fora do intervalo (0–99)."]},{"profile":"legacy3","sets":[],"setWinners":[],"matchWinner":null,"issues":["Informe ao menos um set."]},{"profile":"legacy1","sets":[{"a":21,"b":19},{"a":21,"b":19}],"setWinners":["A","A"],"matchWinner":"A","issues":["Máximo de 1 sets."]},{"profile":"legacy1","sets":[{"a":15,"b":13}],"setWinners":[null],"matchWinner":null,"issues":["Set 1: vitória exige 21 pontos com vantagem de 2."]},{"profile":"legacy5","sets":[{"a":21,"b":19},{"a":19,"b":21},{"a":21,"b":19},{"a":19,"b":21},{"a":15,"b":13}],"setWinners":["A","B","A","B",null],"matchWinner":null,"issues":["Set 5: vitória exige 21 pontos com vantagem de 2."]},{"profile":"indoor3","sets":[{"a":25,"b":23},{"a":21,"b":25},{"a":15,"b":10}],"setWinners":["A","B","A"],"matchWinner":"A","issues":[]},{"profile":"capped1","sets":[{"a":25,"b":24}],"setWinners":["A"],"matchWinner":"A","issues":[]},{"profile":"capped1","sets":[{"a":24,"b":23}],"setWinners":[null],"matchWinner":null,"issues":["Set 1: vitória exige 21 pontos com vantagem de 2 (teto 25)."]},{"profile":"bt3","sets":[{"a":6,"b":4},{"a":7,"b":5}],"setWinners":["A","A"],"matchWinner":"A","issues":[]},{"profile":"bt3","sets":[{"a":6,"b":5}],"setWinners":[null],"matchWinner":null,"issues":["Set 1: set até 6 games com vantagem de 2."]},{"profile":"bt3","sets":[{"a":7,"b":6}],"setWinners":[null],"matchWinner":null,"issues":["Set 1: 7-6 exige o placar do tie-break."]},{"profile":"bt3","sets":[{"a":7,"b":6,"tb":{"a":7,"b":5}},{"a":4,"b":6},{"a":1,"b":0,"tb":{"a":10,"b":8}}],"setWinners":["A","B","A"],"matchWinner":"A","issues":[]},{"profile":"bt3","sets":[{"a":7,"b":6,"tb":{"a":5,"b":7}}],"setWinners":[null],"matchWinner":null,"issues":["Set 1: tie-break até 7 com vantagem de 2."]},{"profile":"bt3","sets":[{"a":7,"b":6,"tb":{"a":7,"b":6}}],"setWinners":[null],"matchWinner":null,"issues":["Set 1: tie-break até 7 com vantagem de 2."]},{"profile":"bt3","sets":[{"a":8,"b":6}],"setWinners":[null],"matchWinner":null,"issues":["Set 1: set até 6 games com vantagem de 2."]},{"profile":"bt3","sets":[{"a":6,"b":3},{"a":3,"b":6},{"a":1,"b":0,"tb":{"a":10,"b":9}}],"setWinners":["A","B",null],"matchWinner":null,"issues":["Set 3: super tie-break até 10 com vantagem de 2."]},{"profile":"bt3","sets":[{"a":6,"b":3},{"a":3,"b":6},{"a":0,"b":1,"tb":{"a":10,"b":8}}],"setWinners":["A","B",null],"matchWinner":null,"issues":["Set 3: super tie-break até 10 com vantagem de 2."]},{"profile":"bt3","sets":[{"a":6,"b":3},{"a":3,"b":6},{"a":6,"b":4}],"setWinners":["A","B",null],"matchWinner":null,"issues":["Set 3: super tie-break até 10 com vantagem de 2."]},{"profile":"tennis3","sets":[{"a":6,"b":3},{"a":3,"b":6},{"a":7,"b":5}],"setWinners":["A","B","A"],"matchWinner":"A","issues":[]},{"profile":"proSet1","sets":[{"a":8,"b":6}],"setWinners":["A"],"matchWinner":"A","issues":[]},{"profile":"proSet1","sets":[{"a":9,"b":8,"tb":{"a":7,"b":3}}],"setWinners":["A"],"matchWinner":"A","issues":[]},{"profile":"advantage1","sets":[{"a":9,"b":7}],"setWinners":["A"],"matchWinner":"A","issues":[]}],"labelVectors":[{"profile":"legacy3","rulesLabel":"set até 21 · decisivo até 15","setLabels":["até 21","até 21","até 15"]},{"profile":"legacy1","rulesLabel":"set até 21","setLabels":["até 21"]},{"profile":"capped1","rulesLabel":"set até 21 · teto 25","setLabels":["até 21"]},{"profile":"bt3","rulesLabel":"set até 6 games · tie-break a 7 em 6-6 · super tie-break a 10 · sem vantagem","setLabels":["até 6 games","até 6 games","super tie-break até 10"]},{"profile":"tennis3","rulesLabel":"set até 6 games · tie-break a 7 em 6-6","setLabels":["até 6 games","até 6 games","até 6 games"]},{"profile":"advantage1","rulesLabel":"set até 6 games","setLabels":["até 6 games"]}],"quickVectors":[{"profile":"legacy3","index":0,"set":{"a":21,"b":19,"tb":{"a":7,"b":5}},"kind":"points","normalized":{"a":21,"b":19}},{"profile":"bt3","index":0,"set":{"a":7,"b":6},"kind":"games_tiebreak","normalized":{"a":7,"b":6}},{"profile":"bt3","index":0,"set":{"a":7,"b":6,"tb":{"a":7,"b":4}},"kind":"games_tiebreak","normalized":{"a":7,"b":6,"tb":{"a":7,"b":4}}},{"profile":"bt3","index":0,"set":{"a":6,"b":4,"tb":{"a":7,"b":4}},"kind":"games","normalized":{"a":6,"b":4}},{"profile":"bt3","index":2,"set":{"a":0,"b":0,"tb":{"a":8,"b":10}},"kind":"super_tiebreak","normalized":{"a":0,"b":1,"tb":{"a":8,"b":10}}},{"profile":"bt3","index":2,"set":{"a":0,"b":0},"kind":"super_tiebreak","normalized":{"a":0,"b":0,"tb":{"a":0,"b":0}}},{"profile":"bt3","index":2,"set":{"a":1,"b":0,"tb":{"a":10,"b":10}},"kind":"super_tiebreak","normalized":{"a":0,"b":0,"tb":{"a":10,"b":10}}},{"profile":"tennis3","index":2,"set":{"a":7,"b":5},"kind":"games","normalized":{"a":7,"b":5}}],"liveVectors":[{"profile":"bt3","points":"AAAA","expect":{"sets":[{"a":1,"b":0}],"currentSetIndex":0,"currentGame":{"a":0,"b":0},"servingTeamId":"B","winnerSide":null,"closed":"game"}},{"profile":"bt3","points":"AAABBBA","expect":{"sets":[{"a":1,"b":0}],"currentSetIndex":0,"currentGame":{"a":0,"b":0},"servingTeamId":"B","winnerSide":null,"closed":"game"}},{"profile":"tennis3","points":"AAABBBA","expect":{"sets":[{"a":0,"b":0}],"currentSetIndex":0,"currentGame":{"a":4,"b":3},"servingTeamId":"A","winnerSide":null,"closed":"none"},"labels":{"a":"AD","b":"40"}},{"profile":"tennis3","points":"AAABBBAB","expect":{"sets":[{"a":0,"b":0}],"currentSetIndex":0,"currentGame":{"a":4,"b":4},"servingTeamId":"A","winnerSide":null,"closed":"none"},"labels":{"a":"40","b":"40"}},{"profile":"tennis3","points":"AAABBBAA","expect":{"sets":[{"a":1,"b":0}],"currentSetIndex":0,"currentGame":{"a":0,"b":0},"servingTeamId":"B","winnerSide":null,"closed":"game"}},{"profile":"bt3","points":"AAABB","expect":{"sets":[{"a":0,"b":0}],"currentSetIndex":0,"currentGame":{"a":3,"b":2},"servingTeamId":"A","winnerSide":null,"closed":"none"},"labels":{"a":"40","b":"30"}},{"profile":"bt3","points":"AAAAAAAAAAAAAAAAAAAAAAAA","expect":{"sets":[{"a":6,"b":0}],"currentSetIndex":1,"currentGame":{"a":0,"b":0},"servingTeamId":"","winnerSide":null,"closed":"set"}},{"profile":"bt3","points":"AAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBA","expect":{"sets":[{"a":6,"b":6}],"currentSetIndex":0,"currentGame":{"a":1,"b":0},"servingTeamId":"B","winnerSide":null,"closed":"none"},"labels":{"a":"1","b":"0"}},{"profile":"bt3","points":"AAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAB","expect":{"sets":[{"a":6,"b":6}],"currentSetIndex":0,"currentGame":{"a":1,"b":1},"servingTeamId":"B","winnerSide":null,"closed":"none"}},{"profile":"bt3","points":"AAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBABA","expect":{"sets":[{"a":6,"b":6}],"currentSetIndex":0,"currentGame":{"a":2,"b":1},"servingTeamId":"A","winnerSide":null,"closed":"none"},"labels":{"a":"2","b":"1"}},{"profile":"bt3","points":"AAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAAABBBBBAA","expect":{"sets":[{"a":7,"b":6,"tb":{"a":7,"b":5}}],"currentSetIndex":1,"currentGame":{"a":0,"b":0},"servingTeamId":"","winnerSide":null,"closed":"set"}},{"profile":"bt3","start":{"sets":[{"a":6,"b":0},{"a":0,"b":6}],"currentSetIndex":2,"currentGame":{"a":0,"b":0},"servingTeamId":"A"},"points":"AAAAAAAAAA","expect":{"sets":[{"a":6,"b":0},{"a":0,"b":6},{"a":1,"b":0,"tb":{"a":10,"b":0}}],"currentSetIndex":2,"currentGame":{"a":0,"b":0},"servingTeamId":"B","winnerSide":"A","closed":"match"}},{"profile":"bt3","points":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","expect":{"sets":[{"a":6,"b":0},{"a":6,"b":0}],"currentSetIndex":1,"currentGame":{"a":0,"b":0},"servingTeamId":"","winnerSide":"A","closed":"match"}},{"profile":"bt3","start":{"sets":[],"currentSetIndex":0,"currentGame":{"a":0,"b":0},"servingTeamId":""},"points":"AAAA","expect":{"sets":[{"a":1,"b":0}],"currentSetIndex":0,"currentGame":{"a":0,"b":0},"servingTeamId":"","winnerSide":null,"closed":"game"}},{"profile":"bt3","start":{"sets":[{"a":5,"b":0}],"currentSetIndex":0,"currentGame":{"a":3,"b":0},"servingTeamId":"A"},"points":"","expect":{"sets":[{"a":5,"b":0}],"currentSetIndex":0,"currentGame":{"a":3,"b":0},"servingTeamId":"A","winnerSide":null,"closed":null},"hint":"set point"},{"profile":"bt3","start":{"sets":[{"a":6,"b":0},{"a":5,"b":0}],"currentSetIndex":1,"currentGame":{"a":3,"b":0},"servingTeamId":"A"},"points":"","expect":{"sets":[{"a":6,"b":0},{"a":5,"b":0}],"currentSetIndex":1,"currentGame":{"a":3,"b":0},"servingTeamId":"A","winnerSide":null,"closed":null},"hint":"match point"},{"profile":"bt3","start":{"sets":[{"a":2,"b":1}],"currentSetIndex":0,"currentGame":{"a":3,"b":1},"servingTeamId":"A"},"points":"","expect":{"sets":[{"a":2,"b":1}],"currentSetIndex":0,"currentGame":{"a":3,"b":1},"servingTeamId":"A","winnerSide":null,"closed":null},"hint":"game point"},{"profile":"bt3","start":{"sets":[{"a":6,"b":6}],"currentSetIndex":0,"currentGame":{"a":0,"b":0},"servingTeamId":"A"},"points":"","expect":{"sets":[{"a":6,"b":6}],"currentSetIndex":0,"currentGame":{"a":0,"b":0},"servingTeamId":"A","winnerSide":null,"closed":null},"hint":"tie-break"},{"profile":"bt3","start":{"sets":[{"a":6,"b":3},{"a":3,"b":6}],"currentSetIndex":2,"currentGame":{"a":0,"b":0},"servingTeamId":"A"},"points":"","expect":{"sets":[{"a":6,"b":3},{"a":3,"b":6}],"currentSetIndex":2,"currentGame":{"a":0,"b":0},"servingTeamId":"A","winnerSide":null,"closed":null},"hint":"super tie-break"},{"profile":"bt3","points":"AAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAAAABBBBBBA","expect":{"sets":[{"a":6,"b":6}],"currentSetIndex":0,"currentGame":{"a":7,"b":6},"servingTeamId":"B","winnerSide":null,"closed":"none"},"labels":{"a":"7","b":"6"}},{"profile":"bt3","start":{"sets":[{"a":6,"b":0},{"a":0,"b":6}],"currentSetIndex":2,"currentGame":{"a":0,"b":0},"servingTeamId":"A"},"points":"AAAAAAAAABBBBBBBBBA","expect":{"sets":[{"a":6,"b":0},{"a":0,"b":6},{"a":0,"b":0}],"currentSetIndex":2,"currentGame":{"a":10,"b":9},"servingTeamId":"A","winnerSide":null,"closed":"none"},"hint":"match point"}],"textVectors":[{"profile":"legacy3","index":0,"set":{"a":21,"b":18},"text":"21-18"},{"profile":"legacy3","index":1,"set":{"a":21,"b":19,"tb":{"a":7,"b":5}},"text":"21-19"},{"profile":"bt3","index":0,"set":{"a":6,"b":4},"text":"6-4"},{"profile":"bt3","index":0,"set":{"a":7,"b":6},"text":"7-6"},{"profile":"bt3","index":1,"set":{"a":7,"b":6,"tb":{"a":7,"b":4}},"text":"7-6 (7-4)"},{"profile":"bt3","index":1,"set":{"a":6,"b":7,"tb":{"a":8,"b":10}},"text":"6-7 (8-10)"},{"profile":"bt3","index":2,"set":{"a":1,"b":0,"tb":{"a":10,"b":8}},"text":"10-8"},{"profile":"bt3","index":2,"set":{"a":0,"b":1,"tb":{"a":6,"b":10}},"text":"6-10"},{"profile":"bt3","index":2,"set":{"a":1,"b":0},"text":"1-0"},{"profile":"tennis3","index":2,"set":{"a":7,"b":6,"tb":{"a":7,"b":3}},"text":"7-6 (7-3)"}],"eventTextVectors":[{"profile":"bt3","setIndex":0,"set":{"a":0,"b":0},"game":{"a":1,"b":0},"text":"0-0 · 15-0"},{"profile":"tennis3","setIndex":0,"set":{"a":3,"b":2},"game":{"a":3,"b":3},"text":"3-2 · 40-40"},{"profile":"tennis3","setIndex":1,"set":{"a":4,"b":3},"game":{"a":4,"b":3},"text":"4-3 · AD-40"},{"profile":"bt3","setIndex":0,"set":{"a":5,"b":4},"game":{"a":0,"b":0},"text":"5-4"},{"profile":"bt3","setIndex":0,"set":{"a":6,"b":6},"game":{"a":4,"b":2},"text":"6-6 · 4-2"},{"profile":"bt3","setIndex":2,"set":{"a":0,"b":0},"game":{"a":7,"b":5},"text":"7-5"},{"profile":"bt3","setIndex":2,"set":{"a":1,"b":0},"game":{"a":0,"b":0},"text":"1-0"},{"profile":"bt3","setIndex":1,"set":{"a":2,"b":1},"game":{"a":3,"b":3},"text":"2-1 · 40-40"}]};
