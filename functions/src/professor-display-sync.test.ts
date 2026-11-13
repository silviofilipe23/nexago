import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  professorCopyPatch,
  professorDisplayChange,
  professorDisplayOf,
} from "./professor-display-sync";

const OLD_URL = "https://firebasestorage.googleapis.com/v0/b/x/o/profiles%2Fu1%2Favatar.jpg?alt=media&token=old";
const NEW_URL = "https://firebasestorage.googleapis.com/v0/b/x/o/profiles%2Fu1%2Favatar_2.jpg?alt=media&token=new";

describe("professorDisplayOf", () => {
  it("segue a precedência do perfil: fullName e profilePhotoUrl primeiro", () => {
    assert.deepEqual(
      professorDisplayOf({fullName: " Ana Lima ", name: "Ana", profilePhotoUrl: NEW_URL, avatarUrl: OLD_URL}),
      {name: "Ana Lima", photoUrl: NEW_URL},
    );
  });

  it("cai para avatarUrl/photoURL e trata vazio como sem foto", () => {
    assert.deepEqual(professorDisplayOf({name: "Ana", avatarUrl: OLD_URL}), {name: "Ana", photoUrl: OLD_URL});
    assert.deepEqual(professorDisplayOf({nickname: "Aninha", profilePhotoUrl: "  "}), {name: "Aninha", photoUrl: null});
  });

  it("doc ausente não tem display", () => {
    assert.equal(professorDisplayOf(undefined), null);
  });
});

describe("professorDisplayChange", () => {
  it("troca de foto propaga", () => {
    assert.deepEqual(
      professorDisplayChange({fullName: "Ana", profilePhotoUrl: OLD_URL}, {fullName: "Ana", profilePhotoUrl: NEW_URL}),
      {name: "Ana", photoUrl: NEW_URL},
    );
  });

  it("troca de nome propaga", () => {
    assert.deepEqual(
      professorDisplayChange({fullName: "Ana", profilePhotoUrl: OLD_URL}, {fullName: "Ana Lima", profilePhotoUrl: OLD_URL}),
      {name: "Ana Lima", photoUrl: OLD_URL},
    );
  });

  it("foto removida propaga null", () => {
    assert.deepEqual(
      professorDisplayChange({fullName: "Ana", profilePhotoUrl: OLD_URL}, {fullName: "Ana"}),
      {name: "Ana", photoUrl: null},
    );
  });

  it("escrita que não mexe em nome nem foto não propaga", () => {
    assert.equal(
      professorDisplayChange(
        {fullName: "Ana", profilePhotoUrl: OLD_URL, lastActiveAt: 1},
        {fullName: "Ana", profilePhotoUrl: OLD_URL, lastActiveAt: 2},
      ),
      null,
    );
  });

  it("criação e exclusão do usuário não propagam", () => {
    assert.equal(professorDisplayChange(undefined, {fullName: "Ana", profilePhotoUrl: NEW_URL}), null);
    assert.equal(professorDisplayChange({fullName: "Ana", profilePhotoUrl: OLD_URL}, undefined), null);
  });
});

describe("professorCopyPatch", () => {
  const display = {name: "Ana Lima", photoUrl: NEW_URL};

  it("classTeachers e publicProfessors usam name/photoUrl", () => {
    const copy = {userId: "u1", name: "Ana", photoUrl: OLD_URL};
    assert.deepEqual(professorCopyPatch("classTeacher", copy, display), {name: "Ana Lima", photoUrl: NEW_URL});
    assert.deepEqual(
      professorCopyPatch("publicProfessor", {professorUserId: "u1", name: "Ana Lima", photoUrl: OLD_URL}, display),
      {photoUrl: NEW_URL},
    );
  });

  it("vínculo usa professorName/professorPhotoUrl", () => {
    assert.deepEqual(
      professorCopyPatch("professorLink", {professorName: "Ana", professorPhotoUrl: OLD_URL, name: "x"}, display),
      {professorName: "Ana Lima", professorPhotoUrl: NEW_URL},
    );
  });

  it("cópia já igual não gera escrita", () => {
    assert.equal(professorCopyPatch("classTeacher", {name: "Ana Lima", photoUrl: NEW_URL}, display), null);
    assert.equal(professorCopyPatch("classTeacher", {name: "Ana", photoUrl: null}, {name: "Ana", photoUrl: null}), null);
  });

  it("cópia sem campo de foto recebe a foto do perfil", () => {
    assert.deepEqual(professorCopyPatch("publicProfessor", {name: "Ana Lima"}, display), {photoUrl: NEW_URL});
    assert.equal(professorCopyPatch("publicProfessor", {name: "Ana Lima"}, {name: "Ana Lima", photoUrl: null}), null);
  });

  it("perfil sem nome não apaga o nome da cópia", () => {
    assert.deepEqual(
      professorCopyPatch("classTeacher", {name: "Ana", photoUrl: OLD_URL}, {name: "", photoUrl: NEW_URL}),
      {photoUrl: NEW_URL},
    );
  });

  it("nome longo respeita o limite de cada cópia", () => {
    const long = {name: "A".repeat(100), photoUrl: NEW_URL};
    const teacher = professorCopyPatch("classTeacher", {photoUrl: NEW_URL}, long);
    const mirror = professorCopyPatch("publicProfessor", {photoUrl: NEW_URL}, long);
    assert.equal((teacher?.["name"] as string).length, 60);
    assert.equal((mirror?.["name"] as string).length, 80);
    assert.equal(professorCopyPatch("classTeacher", {name: "A".repeat(60), photoUrl: NEW_URL}, long), null);
  });
});
