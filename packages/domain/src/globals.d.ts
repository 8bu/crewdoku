/**
 * Minimal ambient for the one Web/Node-shared global the domain uses.
 * `lib` is bare ES2022 (no DOM, no node types) to keep the package
 * environment-neutral; `crypto.randomUUID` exists in every runtime the
 * engine targets (browsers, workers, node >= 19).
 */
declare const crypto: { randomUUID(): string }
