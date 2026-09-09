import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {deSeedSlots, groupCapacities, potIndexAt} from "./draw-plan";

describe("groupCapacities", () => {
  it("16 duplas de 4 em 4 dão quatro grupos cheios", () => {
    assert.deepEqual(groupCapacities(16, 4), [
      {groupId: "A", capacity: 4, teamIds: []},
      {groupId: "B", capacity: 4, teamIds: []},
      {groupId: "C", capacity: 4, teamIds: []},
      {groupId: "D", capacity: 4, teamIds: []},
    ]);
  });

  it("14 duplas em grupos de 4 viram 4/4/3/3 — os maiores primeiro", () => {
    assert.deepEqual(
      groupCapacities(14, 4).map((g) => g.capacity),
      [4, 4, 3, 3],
    );
  });

  it("10 duplas em grupos de 4 viram três grupos: 4/3/3", () => {
    assert.deepEqual(
      groupCapacities(10, 4).map((g) => g.capacity),
      [4, 3, 3],
    );
  });

  it("a soma das capacidades é sempre o total de duplas", () => {
    for (let teams = 4; teams <= 40; teams++) {
      for (const per of [3, 4, 5]) {
        const total = groupCapacities(teams, per).reduce((s, g) => s + g.capacity, 0);
        assert.equal(total, teams, `${teams} duplas em grupos de ${per}`);
      }
    }
  });

  it("nomeia os grupos por letra, na ordem", () => {
    assert.deepEqual(
      groupCapacities(12, 3).map((g) => g.groupId),
      ["A", "B", "C", "D"],
    );
  });

  it("sem duplas não há grupo", () => {
    assert.deepEqual(groupCapacities(0, 4), []);
  });
});

describe("potIndexAt", () => {
  const pots = [
    {index: 1, teamIds: ["a", "b", "c", "d"]},
    {index: 2, teamIds: ["e", "f", "g", "h"]},
    {index: 3, teamIds: ["i", "j"]},
  ];

  it("a primeira revelação é do pote 1", () => {
    assert.equal(potIndexAt(pots, 1), 1);
  });

  it("a quinta revelação já é do pote 2", () => {
    assert.equal(potIndexAt(pots, 5), 2);
  });

  it("a última revelação é do último pote", () => {
    assert.equal(potIndexAt(pots, 10), 3);
  });

  it("revelação além do fim devolve 0 — o sorteio acabou", () => {
    assert.equal(potIndexAt(pots, 11), 0);
  });

  it("índice zero ou negativo devolve 0", () => {
    assert.equal(potIndexAt(pots, 0), 0);
  });
});

describe("deSeedSlots", () => {
  it("as cabeças travadas ficam com os primeiros seeds, na ordem do ranking", () => {
    const slots = deSeedSlots(16, 4);
    assert.deepEqual(slots.locked, [1, 2, 3, 4]);
    assert.deepEqual(slots.open, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("sem cabeças travadas, todo seed é sorteado", () => {
    const slots = deSeedSlots(8, 0);
    assert.deepEqual(slots.locked, []);
    assert.equal(slots.open.length, 8);
  });

  it("travar mais cabeças do que há duplas não deixa nada pra sortear", () => {
    const slots = deSeedSlots(4, 8);
    assert.deepEqual(slots.locked, [1, 2, 3, 4]);
    assert.deepEqual(slots.open, []);
  });
});
