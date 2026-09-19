"use client";

import * as React from "react";
import { CheckCircle2, HelpCircle, ShieldCheck, ShieldQuestion, LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Matches backend LotQualitySummaryDTO (quality.service.ts#getLotQualitySummary). */
export interface LotQualitySummary {
  hasAssessment: boolean;
  currentAssessment: {
    publicId: string;
    grade: "A" | "B" | "C" | "D" | "REJECTED" | null;
    qualityScore: number | null;
    verificationStatus: "SELF_REPORTED" | "AI_ESTIMATED" | "VERIFIED" | "LAB_VERIFIED";
    confidence: number | null;
    assessedAt: string | null;
  } | null;
}

const GRADE_COPY: Record<string, { tone: "success" | "warning" | "destructive"; headline: string; meaning: string }> = {
  A: { tone: "success", headline: "Excellent quality", meaning: "Your produce is in top condition. Buyers typically pay the best prices for this grade." },
  B: { tone: "success", headline: "Good quality", meaning: "Your produce is in good condition with only minor issues. Most buyers will accept this readily." },
  C: { tone: "warning", headline: "Fair quality", meaning: "There are some quality issues. It may sell for a lower price or need extra sorting before sale." },
  D: { tone: "warning", headline: "Below average quality", meaning: "Noticeable quality issues. Consider selling quickly or discussing with buyers about pricing." },
  REJECTED: { tone: "destructive", headline: "Not fit for sale as-is", meaning: "This lot doesn't currently meet quality standards for sale. Check the notes below for what to fix." },
};

const VERIFICATION_COPY: Record<string, { label: string; icon: LucideIcon }> = {
  SELF_REPORTED: { label: "You reported this yourself — not yet checked by anyone else", icon: HelpCircle },
  AI_ESTIMATED: { label: "Estimated by AI photo analysis", icon: ShieldQuestion },
  VERIFIED: { label: "Verified", icon: ShieldCheck },
  LAB_VERIFIED: { label: "Lab verified — the most trusted check", icon: CheckCircle2 },
};

export function QualityFriendlyCard({ summary }: { summary: LotQualitySummary }) {
  if (!summary.hasAssessment || !summary.currentAssessment) {
    return (
      <div className="friendly-banner tone-neutral">
        <div className="friendly-banner-icon">
          <HelpCircle aria-hidden />
        </div>
        <div>
          <p className="friendly-banner-title">No quality check yet</p>
          <p className="friendly-banner-subtitle">
            Add an assessment below so buyers can see the quality of this lot. You can enter it yourself or request an AI-assisted check.
          </p>
        </div>
      </div>
    );
  }

  const a = summary.currentAssessment;
  const gradeCopy = a.grade ? GRADE_COPY[a.grade] : null;
  const verification = VERIFICATION_COPY[a.verificationStatus];
  const VerificationIcon = verification?.icon ?? HelpCircle;

  return (
    <div>
      {gradeCopy ? (
        <div className={`friendly-banner tone-${gradeCopy.tone}`}>
          <div className="friendly-banner-icon">
            <CheckCircle2 aria-hidden />
          </div>
          <div>
            <p className="friendly-banner-title">
              Grade {a.grade} — {gradeCopy.headline}
            </p>
            <p className="friendly-banner-subtitle">{gradeCopy.meaning}</p>
          </div>
        </div>
      ) : (
        <div className="friendly-banner tone-neutral">
          <div className="friendly-banner-icon">
            <HelpCircle aria-hidden />
          </div>
          <div>
            <p className="friendly-banner-title">Grade not set yet</p>
            <p className="friendly-banner-subtitle">A grade will appear here once an assessment includes one.</p>
          </div>
        </div>
      )}

      <div className="friendly-stat-row">
        {a.qualityScore !== null && (
          <div className="friendly-stat">
            <p className="friendly-stat-label">Quality score</p>
            <p className="friendly-stat-value">{Math.round(a.qualityScore)} / 100</p>
          </div>
        )}
        <div className="friendly-stat">
          <p className="friendly-stat-label">How it was checked</p>
          <p className="friendly-stat-value" style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <VerificationIcon className="h-5 w-5" aria-hidden />
            {verification?.label ?? "Unknown"}
          </p>
        </div>
        {a.assessedAt && (
          <div className="friendly-stat">
            <p className="friendly-stat-label">Checked on</p>
            <p className="friendly-stat-value" style={{ fontSize: 17 }}>{new Date(a.assessedAt).toLocaleDateString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}
