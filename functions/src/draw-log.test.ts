import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  appendReveal,
  genesisHash,
  revealHash,
  verifyChain,
  type DrawRevealLogEntry,
} from "./draw-log";

/** Entrada mínima de log, com os campos que entram na cadeia. */
const input = (over: Partial<Omit<DrawRevealLogEntry, "hash">> = {}) => ({
  index: 1,
  teamId: "tmA",
  destinationKey: "grupo:A",
  atMillis: 1_700_000_000_000,
  prevHash: "genesis",
  ...over,
});

describe("revealHash", () => {
  it("é determinístico para a mesma entrada", () => {
    assert.equal(revealHash(input()), revealHash(input()));
  });

  it("muda quando QUALQUER campo da entrada muda", () => {
    const base = revealHash(input());
    assert.notEqual(base, revealHash(input({teamId: "tmB"})));
    assert.notEqual(base, revealHash(input({destinationKey: "grupo:B"})));
    assert.notEqual(base, revealHash(input({index: 2})));
    assert.notEqual(base, revealHash(input({atMillis: 1_700_000_000_001})));
    assert.notEqual(base, revealHash(input({prevHash: "outro"})));
  });

  it("não confunde fronteira de campo — 'a|b' não colide com 'ab|'", () => {
    assert.notEqual(
      revealHash(input({teamId: "a", destinationKey: "b"})),
      revealHash(input({teamId: "ab", destinationKey: ""})),
    );
  });
});

describe("genesisHash", () => {
  it("depende da semente da sessão", () => {
    assert.notEqual(genesisHash("sessao-1"), genesisHash("sessao-2"));
  });
});

describe("appendReveal", () => {
  it("encadeia: prevHash da nova entrada é o hash da anterior", () => {
    const genesis = genesisHash("s1");
    const first = appendReveal([], genesis, {
      teamId: "tmA",
      destinationKey: "grupo:A",
      atMillis: 1,
    });
    const second = appendReveal([first], genesis, {
      teamId: "tmB",
      destinationKey: "grupo:B",
      atMillis: 2,
    });

    assert.equal(first.prevHash, genesis);
    assert.equal(second.prevHash, first.hash);
  });

  it("numera as revelações a partir de 1, na ordem de chegada", () => {
    const genesis = genesisHash("s1");
    const first = appendReveal([], genesis, {teamId: "tmA", destinationKey: "grupo:A", atMillis: 1});
    const second = appendReveal([first], genesis, {teamId: "tmB", destinationKey: "grupo:B", atMillis: 2});

    assert.equal(first.index, 1);
    assert.equal(second.index, 2);
  });
});

describe("verifyChain", () => {
  const genesis = genesisHash("s1");
  const build = (): DrawRevealLogEntry[] => {
    const out: DrawRevealLogEntry[] = [];
    for (const [teamId, destinationKey] of [
      ["tmA", "grupo:A"],
      ["tmB", "grupo:B"],
      ["tmC", "grupo:C"],
    ] as const) {
      out.push(appendReveal(out, genesis, {teamId, destinationKey, atMillis: out.length + 1}));
    }
    return out;
  };

  it("aceita a cadeia íntegra", () => {
    assert.deepEqual(verifyChain(genesis, build()), {ok: true});
  });

  it("acusa o índice onde a entrada foi adulterada", () => {
    const chain = build();
    chain[1] = {...chain[1]!, destinationKey: "grupo:D"};
    assert.deepEqual(verifyChain(genesis, chain), {ok: false, brokenAt: 2});
  });

  it("acusa reordenação — trocar duas revelações quebra a cadeia", () => {
    const chain = build();
    const swapped = [chain[1]!, chain[0]!, chain[2]!];
    assert.deepEqual(verifyChain(genesis, swapped), {ok: false, brokenAt: 1});
  });

  it("acusa remoção de uma revelação do meio", () => {
    const chain = build();
    assert.deepEqual(verifyChain(genesis, [chain[0]!, chain[2]!]), {ok: false, brokenAt: 2});
  });

  it("cadeia vazia é íntegra", () => {
    assert.deepEqual(verifyChain(genesis, []), {ok: true});
  });
});
