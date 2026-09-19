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
    title: "Recommendation: Sell now",
    fallback: "Based on current market prices, quality, and storage conditions, selling now looks like the better option.",
  },
  STORE: {
    tone: "warning",
    icon: Warehouse,
    title: "Recommendation: Store for now",
    fallback: "Based on current market prices, quality, and storage conditions, holding onto this lot a bit longer looks like the better option.",
  },
  INSUFFICIENT_DATA: {
    tone: "neutral",
    icon: HelpCircle,
    title: "Not enough information yet",
    fallback: "We don't have enough recent market, quality, or storage data to give a confident recommendation for this lot yet.",
  },
};

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
            <p className="friendly-stat-label">How confident</p>
            <p className="friendly-stat-value">{Math.round(decision.confidenceScore * 100)}%</p>
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
