'use strict';

/**
 * Bounded cache of compiled matchers.
 *
 * Why this exists: picomatch() parses the glob, expands braces, builds a regex
 * source and instantiates a RegExp on every call. micromatch() amortises that
 * cost across the list it is given, but its per-item helpers
 * (isMatch/some/every/all/matcher) call picomatch() once per invocation, so a
 * `list.filter(file => mm.isMatch(file, pattern))` loop recompiles the same
 * pattern once per file.
 *
 * Only "data only" options are cacheable: if an option holds a function
 * (onResult/onMatch/onIgnore/format/expandRange) the matcher closes over that
 * specific callback, so sharing the compiled matcher would leak one caller's
 * callback into another. Those calls take the uncached path unchanged.
 */

const picomatch = require('picomatch');

const DEFAULT_MAX_ENTRIES = 256;

const isPlainObject = value => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const isDataOnly = value => {
  if (value === null) return true;
  const type = typeof value;
  if (type === 'function' || type === 'symbol') return false;
  if (type !== 'object') return true;
  if (Array.isArray(value)) return value.every(isDataOnly);
  if (!isPlainObject(value)) return false;
  return Object.keys(value).every(key => isDataOnly(value[key]));
};

const canCacheOptions = options => {
  if (options === undefined || options === null) return true;
  if (typeof options !== 'object' || Array.isArray(options)) return false;
  return isPlainObject(options) && isDataOnly(options);
};

// Deterministic serialisation: property order must not create duplicate keys.
const stableStringify = value => {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'undefined') return 'null';
  if (type !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
  return '{' + keys.map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
};

const toKey = (pattern, options) => {
  // Length prefix makes the pattern/options boundary unambiguous even if the
  // pattern itself contains the separator character.
  const head = typeof pattern === 'string'
    ? 's' + pattern.length + ':' + pattern
    : 'j' + stableStringify(pattern);

  if (options === undefined || options === null) return head;
  return head + '|' + stableStringify(options);
};

const stats = { hits: 0, misses: 0, evictions: 0, rejected: 0 };
const map = new Map();
// Keys seen exactly once. One-shot patterns (the common case for dynamically
// generated globs) are compiled and thrown away instead of being retained:
// keeping thousands of short-lived matchers alive promotes them to old space
// and costs more in GC than the cache saves.
const seenOnce = new Set();
let maxEntries = DEFAULT_MAX_ENTRIES;
let maxSeen = DEFAULT_MAX_ENTRIES * 4;

/**
 * Returns a compiled matcher for `pattern`, reusing a previous compilation
 * when the pattern and the (data only) options are identical.
 */

const get = (pattern, options) => {
  if (maxEntries === 0) {
    return picomatch(pattern, options);
  }

  if (!canCacheOptions(options) || (typeof pattern !== 'string' && !Array.isArray(pattern))) {
    return picomatch(pattern, options);
  }

  const key = toKey(pattern, options);
  const cached = map.get(key);

  if (cached !== undefined) {
    stats.hits++;
    // Re-insert to keep Map iteration order as LRU order.
    map.delete(key);
    map.set(key, cached);
    return cached;
  }

  stats.misses++;

  // First sighting: compile, but do not retain. A pattern that is used once
  // must not push a useful entry out of the cache or add GC pressure.
  if (!seenOnce.has(key)) {
    seenOnce.add(key);
    if (seenOnce.size > maxSeen) {
      seenOnce.delete(seenOnce.values().next().value);
    }
    stats.rejected++;
    return picomatch(pattern, options);
  }

  seenOnce.delete(key);
  // Compile before inserting: a throwing pattern must not poison the cache.
  const matcher = picomatch(pattern, options);
  map.set(key, matcher);

  if (map.size > maxEntries) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
    stats.evictions++;
  }

  return matcher;
};

const clear = () => {
  map.clear();
  seenOnce.clear();
  stats.hits = 0;
  stats.misses = 0;
  stats.evictions = 0;
  stats.rejected = 0;
};

module.exports = {
  get,
  clear,
  get size() {
    return map.size;
  },
  get stats() {
    return { ...stats, size: map.size, seen: seenOnce.size, max: maxEntries };
  },
  setMaxEntries(value) {
    if (Number.isInteger(value) && value >= 0) {
      maxEntries = value;
      maxSeen = value * 4;
      if (value === 0) {
        map.clear();
        seenOnce.clear();
        stats.hits = 0;
        stats.misses = 0;
        stats.evictions = 0;
        stats.rejected = 0;
      }
    }
  }
};
