import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  parseShowcase,
  saveArenaClassShowcaseCore,
  validateShowcaseInput,
} from "./class-showcase";
import {getArenaClassDirectoryCore, getCenterClassDirectoryCore, searchClassDirectoryCore} from "./class-directory";

const NOW = new Date(Date.UTC(2026, 9, 22, 18, 0, 0));
const COVER = "https://firebasestorage.googleapis.com/v0/b/x/o/arenas%2Fcfc%2Fclasses-cover?alt=media";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedArena(fake: FakeFirestore): void {
  fake.seedDoc("arenas/cfc", {name: "Arena CFC", managerUserId: "dono", description: "Perfil da arena", coverUrl: "https://x/perfil.jpg"});
  fake.seedDoc("arenaClasses/t1", {arenaId: "cfc", status: "active", type: "turma", name: "Iniciante", level: "iniciante", weekdays: [1], startTime: "19:00", capacity: 8, studentCount: 2});
}

describe("class-showcase · validação", () => {
  it("aceita o formato completo e arredonda o preço", () => {
    const s = validateShowcaseInput({
      coverUrl: COVER,
      description: "Turmas do iniciante ao avançado.",
      trial: {enabled: true, priceReais: 49.999, note: "1 aula"},
    });
    assert.equal(s.coverUrl, COVER);
    assert.equal(s.trial.priceReais, 50);
    assert.equal(s.trial.enabled, true);
  });

  it("capa vazia vira null; sem trial = desligada e grátis", () => {
    const s = validateShowcaseInput({coverUrl: "", description: ""});
    assert.equal(s.coverUrl, null);
    assert.deepEqual(s.trial, {enabled: false, priceReais: 0, note: ""});
  });

  it("recusa capa sem https, descrição longa e preço fora da faixa", () => {
    assert.throws(() => validateShowcaseInput({coverUrl: "http://x/a.jpg"}), {code: "invalid-argument"});
    assert.throws(() => validateShowcaseInput({description: "x".repeat(401)}), {code: "invalid-argument"});
    assert.throws(() => validateShowcaseInput({trial: {enabled: true, priceReais: -1}}), {code: "invalid-argument"});
    assert.throws(() => validateShowcaseInput({trial: {enabled: true, priceReais: 5000}}), {code: "invalid-argument"});
    assert.throws(() => validateShowcaseInput({trial: {note: "x".repeat(121)}}), {code: "invalid-argument"});
  });

  it("leitura tolerante: lixo vira o padrão", () => {
    assert.deepEqual(parseShowcase({coverUrl: 3, trial: {enabled: "sim", priceReais: "10"}}), {
      coverUrl: null,
      description: "",
      trial: {enabled: false, priceReais: 0, note: ""},
    });
  });
});

describe("class-showcase · gravação da arena", () => {
  it("dono grava; quem não é da equipe não", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    await saveArenaClassShowcaseCore(db(fake), "dono", {arenaId: "cfc", coverUrl: COVER, trial: {enabled: true, priceReais: 0}});
    const doc = await db(fake).doc("arenas/cfc/classSettings/showcase").get();
    assert.equal(doc.data()?.["coverUrl"], COVER);
    await assert.rejects(
      saveArenaClassShowcaseCore(db(fake), "estranho", {arenaId: "cfc"}),
      {code: "permission-denied"},
    );
  });
});

describe("class-showcase · diretório", () => {
  it("arena: vitrine manda na capa e na descrição; experimental ligada aparece", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    fake.seedDoc("arenas/cfc/classSettings/showcase", {coverUrl: COVER, description: "Vitrine", trial: {enabled: true, priceReais: 0, note: "1 aula"}});
    const d = await getArenaClassDirectoryCore(db(fake), "cfc", null, NOW);
    assert.equal(d.coverUrl, COVER);
    assert.equal(d.description, "Vitrine");
    assert.deepEqual(d.trial, {enabled: true, priceReais: 0, note: "1 aula"});
    const [item] = await searchClassDirectoryCore(db(fake), {}, NOW);
    assert.equal(item.trial?.priceReais, 0);
  });

  it("arena sem vitrine cai no perfil; experimental desligada = null", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    fake.seedDoc("arenas/cfc/classSettings/showcase", {trial: {enabled: false, priceReais: 30}});
    const d = await getArenaClassDirectoryCore(db(fake), "cfc", null, NOW);
    assert.equal(d.coverUrl, "https://x/perfil.jpg");
    assert.equal(d.description, "Perfil da arena");
    assert.equal(d.trial, null);
  });

  it("CT: vitrine no doc do centro", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("trainingCenters/elv", {name: "CT Elevação", status: "active", showcase: {coverUrl: COVER, description: "Alto rendimento", trial: {enabled: true, priceReais: 50, note: "abatida na 1ª mensalidade"}}});
    fake.seedDoc("trainingCenters/elv/classes/c1", {name: "Competição", status: "active", weekdays: [1], startTime: "06:00", capacity: 10, seatsTaken: 2});
    const d = await getCenterClassDirectoryCore(db(fake), "elv", NOW);
    assert.equal(d.coverUrl, COVER);
    assert.equal(d.description, "Alto rendimento");
    assert.equal(d.trial?.priceReais, 50);
    const [item] = await searchClassDirectoryCore(db(fake), {}, NOW);
    assert.equal(item.trial?.note, "abatida na 1ª mensalidade");
  });
});
