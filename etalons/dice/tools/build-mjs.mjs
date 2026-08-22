#!/usr/bin/env node
// Локальное зеркало платформенной сборки (source-intake devРГС, §8.2).
//
// Бандл модели едет ИСХОДНИКАМИ SDK-канона; исполняемую форму dist/index.mjs
// собирает платформа esbuild-ом от исходной точки входа schema.json#entry.
// Этот скрипт повторяет ту сборку локально — чтобы verify-mjs.ts мог сверить
// собранную форму (отпечаток выплат, err.name, независимость экземпляров)
// ДО заливки, не поднимая devРГС.
//
// Сборка: esbuild, один файл, без минификации — err.name типизированных
// исключений задаётся строками, но имена классов не переименовываются.
// @playtagon/model-sdk — только типы, в собранном файле внешних импортов нет,
// кроме node:fs/node:url (ленивое чтение собственной schema.json — путь
// ../schema.json от import.meta.url работает и в срезе тома devРГС:
// dist/index.mjs → ../schema.json = корень среза).
//
// Результат — staging в dice/tools/dist/ (гит его не видит), повторяет
// раскладку среза devРГС: {schema.json, config.json, protocol.md, dist/index.mjs}.
//
// Запуск: node dice/tools/build-mjs.mjs

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const SERVER_DIR = fileURLToPath(new URL("../server", import.meta.url));
const STAGING = fileURLToPath(new URL("dist", import.meta.url));

const schema = JSON.parse(readFileSync(join(SERVER_DIR, "schema.json"), "utf8"));
const entry = schema.entry;
if (!entry?.module || !entry?.export) {
  console.error("schema.json#entry обязан объявлять {module, export} — платформе нечего собирать");
  process.exit(1);
}

rmSync(STAGING, { recursive: true, force: true });
mkdirSync(join(STAGING, "dist"), { recursive: true });

execFileSync(
  "npx",
  [
    "-y",
    "esbuild",
    join(SERVER_DIR, entry.module),
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${join(STAGING, "dist", "index.mjs")}`,
  ],
  { stdio: "inherit" },
);

for (const f of ["schema.json", "config.json", "protocol.md"]) {
  cpSync(join(SERVER_DIR, f), join(STAGING, f));
}

console.log(`Staging-срез собран: ${STAGING} (entry: ${entry.module} → dist/index.mjs)`);
console.log("Сверка исполняемой формы: npx tsx dice/tools/verify-mjs.ts");
