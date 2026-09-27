/**
 * Stub for `@tanstack/match-sorter-utils`, mapped in jest.config.cjs.
 *
 * `@tanstack/vue-query`'s CJS build eagerly requires its devtools module (even when devtools are
 * never used — nothing here opts into them), which in turn `require()`s `@tanstack/match-sorter-
 * utils`. That package ships ESM-only (`"type": "module"`, no CJS export). Node loads it anyway
 * (it supports `require()` of an ES module), but Jest resolves modules with its own CommonJS
 * loader, which does not — so under Jest the require fails to parse, and this stub stands in.
 *
 * `rankItem` is the only export devtools' query-filtering panel calls, purely for a browser
 * devtools inspector UI that never runs under Jest — a no-op stand-in is correct here, not a loss
 * of coverage.
 */
module.exports = {
    rankItem: () => ({ passed: true, rank: 0, keyIndex: 0, keyThreshold: 0 })
};
