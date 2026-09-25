"use client";

/**
 * Dynamic, on-demand translation client.
 *
 * English (`en.json` + DOM text) is the single source of truth. Every other
 * language is translated on the fly with multi-level caching (in-memory +
 * localStorage) and indexed batching to ensure switches are fast, reliable,
 * and resilient against rate limits.
 */

const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const CLIENT_CANDIDATES = ["dict-chrome-ex", "gtx"];
const BATCH_SIZE = 40;
const CONCURRENCY = 4;
const STORAGE_PREFIX = "anndata.i18n.v3.";

// In-memory cache: "source:target:trimmedText" -> translatedText
const memoryCache = new Map<string, string>();

function getCacheKey(source: string, target: string, text: string): string {
  return `${source}:${target}:${text.trim()}`;
}

function loadLocalCache(target: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${target}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalCache(target: string, entries: Record<string, string>) {
  if (typeof window === "undefined" || Object.keys(entries).length === 0) return;
  try {
    const existing = loadLocalCache(target);
    const merged = { ...existing, ...entries };
    const keys = Object.keys(merged);
    const MAX_ENTRIES = 2000;
    if (keys.length > MAX_ENTRIES) {
      const trimmed: Record<string, string> = {};
      keys.slice(-MAX_ENTRIES).forEach((k) => {
        trimmed[k] = merged[k];
      });
      window.localStorage.setItem(`${STORAGE_PREFIX}${target}`, JSON.stringify(trimmed));
    } else {
      window.localStorage.setItem(`${STORAGE_PREFIX}${target}`, JSON.stringify(merged));
    }
  } catch {
    // If quota exceeded, do not throw
  }
}

// Matches our own `{{varName}}` interpolation tokens
const PLACEHOLDER_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

function protectPlaceholders(text: string): { safeText: string; restore: (translated: string) => string } {
  const tokens: string[] = [];
  const safeText = text
    .replace(PLACEHOLDER_PATTERN, (match) => {
      tokens.push(match);
      return `[[${tokens.length - 1}]]`;
    })
    .replace(/\r?\n+/g, " __NL__ ");

  const restore = (translated: string) => {
    const restoredNewlines = translated.replace(/\s*__NL__\s*/g, "\n");
    return restoredNewlines.replace(/\[\[\s*(\d+)\s*\]\]/g, (_, i) => tokens[Number(i)] ?? "");
  };

  return { safeText, restore };
}

async function fetchFromEndpoint(text: string, target: string, source: string, clientIndex = 0): Promise<string> {
  const client = CLIENT_CANDIDATES[clientIndex] || "dict-chrome-ex";
  const params = new URLSearchParams({
    client,
    sl: source,
    tl: target,
    dt: "t",
    q: text,
  });

  try {
    const res = await fetch(`${TRANSLATE_ENDPOINT}?${params.toString()}`);
    if (!res.ok) {
      if (clientIndex + 1 < CLIENT_CANDIDATES.length) {
        return fetchFromEndpoint(text, target, source, clientIndex + 1);
      }
      throw new Error(`Translation status: ${res.status}`);
    }
    const data = await res.json();
    const segments = Array.isArray(data?.[0]) ? data[0] : [];
    return segments.map((segment: unknown[]) => (Array.isArray(segment) ? segment[0] ?? "" : "")).join("");
  } catch (err) {
    if (clientIndex + 1 < CLIENT_CANDIDATES.length) {
      return fetchFromEndpoint(text, target, source, clientIndex + 1);
    }
    throw err;
  }
}

async function translateOne(text: string, target: string, source: string, attempt = 0): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const cacheKey = getCacheKey(source, target, trimmed);
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey)!;

  const { safeText, restore } = protectPlaceholders(text);
  try {
    const translated = await fetchFromEndpoint(safeText, target, source);
    const result = translated ? restore(translated) : text;
    memoryCache.set(cacheKey, result);
    return result;
  } catch {
    if (attempt < 1) {
      return translateOne(text, target, source, attempt + 1);
    }
    return text;
  }
}

/**
 * Translates a indexed chunk of strings in a single network request.
 * Uses index markers (`${i}::: ${text}`) separated by newlines so lines
 * never get scrambled or lost.
 */
async function translateIndexedChunk(
  texts: string[],
  target: string,
  source: string,
): Promise<(string | null)[]> {
  const protections = texts.map(protectPlaceholders);
  const joined = protections.map((p, i) => `${i}::: ${p.safeText}`).join("\n");

  try {
    const translatedJoined = await fetchFromEndpoint(joined, target, source);
    const lines = translatedJoined.split("\n");
    const resultMap = new Map<number, string>();
    let currentIndex = -1;

    for (const line of lines) {
      const match = line.match(/^(\d+)\s*:::\s*(.*)$/);
      if (match) {
        currentIndex = parseInt(match[1], 10);
        resultMap.set(currentIndex, match[2].trim());
      } else if (currentIndex >= 0 && line.trim()) {
        resultMap.set(currentIndex, `${resultMap.get(currentIndex) || ""} ${line.trim()}`);
      }
    }

    return texts.map((_, i) => {
      if (resultMap.has(i)) {
        return protections[i].restore(resultMap.get(i)!);
      }
      return null;
    });
  } catch {
    return texts.map(() => null);
  }
}

async function withConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    const current = cursor++;
    if (current >= items.length) return;
    results[current] = await worker(items[current]);
    return runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  return results;
}

/**
 * Translates an arbitrary list of strings with automatic caching,
 * deduplication, and indexed batching.
 */
export async function translateBatch(texts: string[], target: string, source = "en"): Promise<string[]> {
  if (!target || target === source || texts.length === 0) return texts;

  // Preload local storage cache into memoryCache for target if not loaded
  const localCache = loadLocalCache(target);
  for (const [k, v] of Object.entries(localCache)) {
    const key = getCacheKey(source, target, k);
    if (!memoryCache.has(key)) {
      memoryCache.set(key, v);
    }
  }

  // Identify which unique strings need translation
  const neededUnique = new Set<string>();
  for (const text of texts) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    const key = getCacheKey(source, target, trimmed);
    if (!memoryCache.has(key)) {
      neededUnique.add(trimmed);
    }
  }

  const missingList = Array.from(neededUnique);

  if (missingList.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < missingList.length; i += BATCH_SIZE) {
      chunks.push(missingList.slice(i, i + BATCH_SIZE));
    }

    const newLocalEntries: Record<string, string> = {};

    await withConcurrency(chunks, CONCURRENCY, async (chunk) => {
      const chunkResults = await translateIndexedChunk(chunk, target, source);

      for (let i = 0; i < chunk.length; i++) {
        const originalText = chunk[i];
        let translated = chunkResults[i];

        // Fall back to single-item translation if the batch didn't return this index
        if (!translated) {
          translated = await translateOne(originalText, target, source);
        }

        if (translated) {
          const key = getCacheKey(source, target, originalText);
          memoryCache.set(key, translated);
          newLocalEntries[originalText] = translated;
        }
      }
    });

    saveLocalCache(target, newLocalEntries);
  }

  // Reconstruct the output matching the input order
  return texts.map((text) => {
    const trimmed = text.trim();
    if (!trimmed) return text;
    const key = getCacheKey(source, target, trimmed);
    const translated = memoryCache.get(key);
    if (!translated) return text;

    // Preserve leading and trailing whitespace
    const leading = text.match(/^(\s*)/)?.[1] ?? "";
    const trailing = text.match(/(\s*)$/)?.[1] ?? "";
    return `${leading}${translated}${trailing}`;
  });
}
