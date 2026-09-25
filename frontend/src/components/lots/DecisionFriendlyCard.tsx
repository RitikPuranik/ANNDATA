"use client";

import * as React from "react";
import { CheckCircle2, Warehouse, HelpCircle, AlertTriangle, LucideIcon } from "lucide-react";

interface AiAdvisory {
  summary: string;
  reasoning: string[];
  risks: string[];
  considerations: string[];
}

/** Matches the sell-vs-store orchestration service's SellStoreDecisionDTO. */
export interface SellStoreDecision {
  result: "SELL_NOW" | "STORE" | "INSUFFICIENT_DATA";
  confidenceScore: number | null;
  aiAdvisory: AiAdvisory | null;
}

const RESULT_COPY: Record<
  string,
  { tone: "success" | "warning" | "neutral"; icon: LucideIcon; title: string; fallback: string }
> = {
  SELL_NOW: {
    tone: "success",
    icon: CheckCircle2,
    title: "Sell now",
    fallback: "Prices, quality, and storage all point the same way — this looks like a good time to sell.",
  },
  STORE: {
    tone: "warning",
    icon: Warehouse,
    title: "Wait a bit and store it",
    fallback: "Holding on to this lot a little longer looks like the better option right now.",
  },
  INSUFFICIENT_DATA: {
    tone: "neutral",
    icon: HelpCircle,
    title: "Not enough information yet",
    fallback: "We don't have enough recent information about this lot to say for sure yet. Try again after adding a quality check.",
  },
};

/** Short, plain label for the result — used in compact history rows. */
export const RESULT_SHORT_LABEL: Record<string, string> = {
  SELL_NOW: "Sell now",
  STORE: "Wait and store",
  INSUFFICIENT_DATA: "Not enough info",
};

/** Turns a 0–1 confidence score into a plain word instead of a raw percentage. */
export function confidenceWord(score: number | null | undefined) {
  if (score === null || score === undefined) return "";
  if (score >= 0.8) return "Very sure";
  if (score >= 0.5) return "Fairly sure";
  return "Not very sure";
}

export function DecisionFriendlyCard({ decision }: { decision: SellStoreDecision }) {
  const copy = RESULT_COPY[decision.result] ?? RESULT_COPY.INSUFFICIENT_DATA;
  const Icon = copy.icon;
  const summary = decision.aiAdvisory?.summary ?? copy.fallback;

  return (
    <div>
      <div className={`friendly-banner tone-${copy.tone}`}>
        <div className="friendly-banner-icon">
          <Icon aria-hidden />
        </div>
        <div>
          <p className="friendly-banner-title">{copy.title}</p>
          <p className="friendly-banner-subtitle">{summary}</p>
        </div>
      </div>

      {decision.confidenceScore !== null && (
        <div className="friendly-stat-row">
          <div className="friendly-stat">
            <p className="friendly-stat-label">How sure we are</p>
            <p className="friendly-stat-value" style={{ fontSize: 20 }}>
              {confidenceWord(decision.confidenceScore)}
            </p>
          </div>
        </div>
      )}

      {decision.aiAdvisory && decision.aiAdvisory.reasoning?.length > 0 && (
        <ul className="friendly-reasons">
          {decision.aiAdvisory.reasoning.map((r, i) => (
            <li key={i}>
              <CheckCircle2 aria-hidden /> {r}
            </li>
          ))}
        </ul>
      )}

      {decision.aiAdvisory && decision.aiAdvisory.risks?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p className="friendly-stat-label" style={{ marginBottom: 6 }}>
            Worth keeping in mind
          </p>
          <ul className="friendly-reasons">
            {decision.aiAdvisory.risks.map((r, i) => (
              <li key={i}>
                <AlertTriangle aria-hidden /> {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
