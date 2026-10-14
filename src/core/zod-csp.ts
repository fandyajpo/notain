import { z } from 'zod';

/**
 * Zod v4's JIT compiler probes `new Function` once, on first parse. Under a
 * strict CSP the probe throws, Zod swallows it and falls back to the
 * interpreted path — but the browser still reports the blocked eval, so every
 * page that validates anything would file a violation. `jitless` skips the
 * probe and the JIT outright: parsing stays correct, just not compiled.
 * (zod/v4/core/util.js — `allowsEval` — documents this exact scenario.)
 *
 * Imported for side effects by every module that defines schemas, which
 * guarantees it runs before the first parse in each island.
 */
z.config({ jitless: true });
