// Платформенный вход модели — адаптер конвенции приёма devРГС (source-intake):
// schema.json#entry указывает сюда, платформа собирает исполняемую форму
// esbuild-ом от этого файла и зовёт createModel(values) со значениями ручек
// версии конфига (§1.5.1). SDK-канонический default-export (model/index.ts)
// сюда НЕ импортируется: в собранной форме нет ни дефолтных значений, ни
// чтений файлов на загрузке модуля — только фабрика и её типизированные отказы.
// Пара конвенции (§11.1, вердикт (б′) 2026-08-19): рядом с фабрикой
// экспортируется buildModel — сборка из заведомо-валидных значений без чтения
// схемы и без валидации; её вызывает только генерируемый bake-адаптер.
export { createModel, buildModel } from "./factory.js";
export { ConfigValidationError } from "./config.js";
export { RequestValidationError } from "./request.js";
export type { DiceGameTypes } from "./types.js";
