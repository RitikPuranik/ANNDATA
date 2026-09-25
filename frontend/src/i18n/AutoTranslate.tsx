"use client";

import * as React from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { translateBatch } from "@/i18n/translateClient";
import { hasLetters } from "@/i18n/scriptDetection";

/**
 * Whole-page auto-translator.
 *
 * Walks the rendered DOM and translates visible text and accessible attributes
 * in place. Safe around React:
 * - Never adds/removes/reorders DOM nodes.
 * - Always preserves the immutable original English source text for every node
 *   in a WeakMap, ensuring switching languages NEVER translates already-translated text.
 * - Restores original English before translating into a new language.
 * - Fully debounced, deduplicated, and cached to prevent network lag.
 */

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "TEXTAREA"]);
const ATTRS = ["placeholder", "aria-label", "title"];
const DEBOUNCE_MS = 250;

function isSkippable(start: Element | null): boolean {
  let el = start;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.getAttribute?.("translate") === "no" || el.hasAttribute?.("data-i18n-skip")) return true;
    el = el.parentElement;
  }
  return false;
}

export function AutoTranslate() {
  const { language } = useI18n();

  // Immutable mapping: Text node -> original English text
  // Once set, this is NEVER overwritten or cleared, guaranteeing translations
  // are always based on the original English text.
  const textOriginals = React.useRef(new WeakMap<Text, string>()).current;

  // Active nodes and elements currently modified in the DOM
  const activeNodesRef = React.useRef<Set<Text>>(new Set());
  const activeElementsRef = React.useRef<Set<Element>>(new Set());

  const applyingRef = React.useRef(false);
  const currentLangRef = React.useRef(language);
  const generationRef = React.useRef(0);
  const scheduledRef = React.useRef<number | null>(null);

  const revertAll = React.useCallback(() => {
    applyingRef.current = true;

    for (const node of activeNodesRef.current) {
      if (node.isConnected) {
        const orig = textOriginals.get(node);
        if (orig !== undefined) {
          node.nodeValue = orig;
        }
      }
      (node as unknown as { __i18n_lang?: string }).__i18n_lang = "en";
      (node as unknown as { __i18n_pending?: string | null }).__i18n_pending = null;
    }
    activeNodesRef.current.clear();

    for (const el of activeElementsRef.current) {
      if (el.isConnected) {
        ATTRS.forEach((attr) => {
          const orig = el.getAttribute(`data-i18n-orig-${attr}`);
          if (orig !== null) {
            el.setAttribute(attr, orig);
            el.removeAttribute(`data-i18n-lang-${attr}`);
            el.removeAttribute(`data-i18n-pending-${attr}`);
          }
        });
      }
    }
    activeElementsRef.current.clear();

    applyingRef.current = false;
  }, [textOriginals]);

  const collectAndTranslate = React.useCallback(
    async (targetLang: string, expectedGeneration: number) => {
      if (typeof document === "undefined" || targetLang === "en") return;

      const nodesToTranslate: { node: Text; orig: string; trimmed: string }[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const raw = node.nodeValue;
          if (!raw || !raw.trim()) return NodeFilter.FILTER_REJECT;

          const parent = (node as Text).parentElement;
          if (!parent || isSkippable(parent)) return NodeFilter.FILTER_REJECT;

          const customNode = node as unknown as { __i18n_lang?: string; __i18n_pending?: string | null };
          if (customNode.__i18n_lang === targetLang) return NodeFilter.FILTER_REJECT;
          if (customNode.__i18n_pending === targetLang) return NodeFilter.FILTER_REJECT;

          // Retrieve or lock the authentic original English text
          let orig = textOriginals.get(node as Text);
          if (orig === undefined) {
            // First time seeing this text node. Since the app is in English by default
            // and we revertAll() on language switch, this is the authentic original text.
            orig = raw;
            textOriginals.set(node as Text, orig);
          }

          const trimmed = orig.trim();
          if (!hasLetters(trimmed)) return NodeFilter.FILTER_REJECT;

          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let current: Node | null;
      while ((current = walker.nextNode())) {
        const textNode = current as Text;
        const orig = textOriginals.get(textNode) || textNode.nodeValue || "";
        const trimmed = orig.trim();
        (textNode as unknown as { __i18n_pending?: string | null }).__i18n_pending = targetLang;
        nodesToTranslate.push({ node: textNode, orig, trimmed });
      }

      const attrTargets: { el: Element; attr: string; orig: string; trimmed: string }[] = [];
      document.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(",")).forEach((el) => {
        if (isSkippable(el)) return;

        ATTRS.forEach((attr) => {
          const val = el.getAttribute(attr);
          if (!val || !val.trim()) return;

          let orig = el.getAttribute(`data-i18n-orig-${attr}`);
          if (!orig) {
            orig = val;
            el.setAttribute(`data-i18n-orig-${attr}`, orig);
          }

          const trimmed = orig.trim();
          if (!hasLetters(trimmed)) return;

          if (el.getAttribute(`data-i18n-lang-${attr}`) === targetLang) return;
          if (el.getAttribute(`data-i18n-pending-${attr}`) === targetLang) return;

          el.setAttribute(`data-i18n-pending-${attr}`, targetLang);
          attrTargets.push({ el, attr, orig, trimmed });
        });
      });

      if (nodesToTranslate.length === 0 && attrTargets.length === 0) return;

      // Extract unique trimmed English strings to translate
      const uniqueTrimmed = Array.from(
        new Set([
          ...nodesToTranslate.map((item) => item.trimmed),
          ...attrTargets.map((item) => item.trimmed),
        ]),
      );

      const translatedUnique = await translateBatch(uniqueTrimmed, targetLang, "en");

      // Discard stale results if the language changed while this request was in flight
      if (
        currentLangRef.current !== targetLang ||
        generationRef.current !== expectedGeneration
      ) {
        // Clear pending flags
        nodesToTranslate.forEach(({ node }) => {
          (node as unknown as { __i18n_pending?: string | null }).__i18n_pending = null;
        });
        attrTargets.forEach(({ el, attr }) => {
          el.removeAttribute(`data-i18n-pending-${attr}`);
        });
        return;
      }

      const translationMap = new Map<string, string>();
      uniqueTrimmed.forEach((origText, idx) => {
        translationMap.set(origText, translatedUnique[idx] || origText);
      });

      applyingRef.current = true;

      nodesToTranslate.forEach(({ node, orig, trimmed }) => {
        (node as unknown as { __i18n_pending?: string | null }).__i18n_pending = null;
        if (!node.isConnected) return;

        const translated = translationMap.get(trimmed);
        if (translated) {
          const leading = orig.match(/^(\s*)/)?.[1] ?? "";
          const trailing = orig.match(/(\s*)$/)?.[1] ?? "";
          node.nodeValue = `${leading}${translated}${trailing}`;
          (node as unknown as { __i18n_lang?: string }).__i18n_lang = targetLang;
          activeNodesRef.current.add(node);
        }
      });

      attrTargets.forEach(({ el, attr, orig, trimmed }) => {
        el.removeAttribute(`data-i18n-pending-${attr}`);
        if (!el.isConnected) return;

        const translated = translationMap.get(trimmed);
        if (translated) {
          const leading = orig.match(/^(\s*)/)?.[1] ?? "";
          const trailing = orig.match(/(\s*)$/)?.[1] ?? "";
          el.setAttribute(attr, `${leading}${translated}${trailing}`);
          el.setAttribute(`data-i18n-lang-${attr}`, targetLang);
          activeElementsRef.current.add(el);
        }
      });

      requestAnimationFrame(() => {
        applyingRef.current = false;
      });
    },
    [textOriginals],
  );

  const scheduleTranslate = React.useCallback(
    (targetLang: string) => {
      if (scheduledRef.current) return;
      scheduledRef.current = window.setTimeout(() => {
        scheduledRef.current = null;
        collectAndTranslate(targetLang, generationRef.current);
      }, DEBOUNCE_MS);
    },
    [collectAndTranslate],
  );

  // Language switch handler:
  // 1. Invalidate any in-flight translations for old language
  // 2. Revert DOM back to authentic original English
  // 3. If new language is not English, translate directly from English originals
  React.useEffect(() => {
    currentLangRef.current = language;
    generationRef.current += 1;

    if (scheduledRef.current) {
      window.clearTimeout(scheduledRef.current);
      scheduledRef.current = null;
    }

    revertAll();

    if (language !== "en") {
      collectAndTranslate(language, generationRef.current);
    }
  }, [language, collectAndTranslate, revertAll]);

  // Observe newly mounted or dynamic content (async data, page navigation, dialogs)
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => {
      if (applyingRef.current || currentLangRef.current === "en") return;
      scheduleTranslate(currentLangRef.current);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [scheduleTranslate]);

  return null;
}
