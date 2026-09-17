import { PrismaClient, QualityGrade } from "@prisma/client";
import { QualityStandardRepository } from "../quality/quality.repository";
import { AgreedMetricThreshold } from "./delivery-quality-reconciliation.engine";

/** Shape of BuyerDemand.qualityRequirements as written by the buyer-matching
 * module (buyer-matching.schemas.ts's own demandBody) — a fixed, known set
 * of fields, not an open per-crop metric map. */
interface BuyerDemandQualityRequirements {
  grade?: QualityGrade;
  moistureMax?: number;
  foreignMatterMax?: number;
  sizeRequirements?: string;
}

export interface AgreedQuality {
  grade: QualityGrade | null;
  thresholds: AgreedMetricThreshold[];
  /** Human-readable provenance for the reconciliation explanation (Step 7:
   * "make comparison ... explainable"). */
  source: "BUYER_DEMAND" | "QUALITY_STANDARD" | "LOT_ASSESSMENT" | "NONE";
}

/**
 * Step 6/23 — resolves what quality was actually agreed for a delivery's
 * commercial transaction, without ever recreating or copying Module 5's
 * own grading logic (Step 23). Priority order:
 *
 *  1. The accepted TradeOffer's own BuyerDemand.qualityRequirements/grade,
 *     when the offer came from a demand — this is the buyer's own
 *     explicit, negotiated ask (Step 6's own "Agreed: Grade A, Moisture
 *     <= 12%" example).
 *  2. Module 5's existing QualityStandard rows for the lot's crop at the
 *     resolved agreed grade (a grade may be agreed without explicit
 *     numeric thresholds — the crop's own configured standard for that
 *     grade fills the gap; Step 4: "Do not hardcode crop-specific quality
 *     parameters if Module 5 already provides a configurable structure").
 *  3. The lot's own latest VERIFIED QualityAssessment.overallGrade as an
 *     implicit baseline ("what the lot was represented as at listing"),
 *     when no explicit commercial agreement carries a grade at all.
 *  4. NONE — nothing to compare against; the reconciliation engine reports
 *     PENDING quality rather than fabricating a result.
 */
export class DeliveryQualityAgreementResolver {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly qualityStandards: QualityStandardRepository,
  ) {}

  async resolve(lotId: string, cropId: string, tradeOfferId: string | null): Promise<AgreedQuality> {
    let requirements: BuyerDemandQualityRequirements | null = null;

    if (tradeOfferId) {
      const offer = await this.prisma.tradeOffer.findUnique({
        where: { id: tradeOfferId },
        select: { demand: { select: { qualityRequirements: true, grade: true } } },
      });
      if (offer?.demand) {
        requirements = (offer.demand.qualityRequirements as BuyerDemandQualityRequirements | null) ?? {};
        if (offer.demand.grade && !requirements.grade) {
          requirements = { ...requirements, grade: offer.demand.grade };
        }
      }
    }

    const explicitThresholds: AgreedMetricThreshold[] = [];
    if (requirements?.moistureMax !== undefined) {
      explicitThresholds.push({ metricCode: "moisture", metricName: "Moisture", min: null, max: requirements.moistureMax });
    }
    if (requirements?.foreignMatterMax !== undefined) {
      explicitThresholds.push({
        metricCode: "foreignMatter",
        metricName: "Foreign matter",
        min: null,
        max: requirements.foreignMatterMax,
      });
    }

    let grade: QualityGrade | null = requirements?.grade ?? null;
    let source: AgreedQuality["source"] = requirements && (requirements.grade || explicitThresholds.length) ? "BUYER_DEMAND" : "NONE";

    if (!grade) {
      const lot = await this.prisma.cropLot.findUnique({
        where: { id: lotId },
        select: {
          qualityAssessments: {
            where: { status: "VERIFIED" },
            orderBy: { createdAt: "desc" as const },
            take: 1,
            select: { overallGrade: true },
          },
        },
      });
      const latestVerified = lot?.qualityAssessments[0]?.overallGrade ?? null;
      if (latestVerified) {
        grade = latestVerified;
        source = "LOT_ASSESSMENT";
      }
    }

    // Fill in any metric this transaction has no explicit threshold for
    // from Module 5's own configured QualityStandard rows at the resolved
    // grade — never overriding an explicit BuyerDemand figure.
    let standardThresholds: AgreedMetricThreshold[] = [];
    if (grade) {
      const rows = await this.qualityStandards.findByCropId(cropId);
      standardThresholds = rows
        .filter((r) => r.grade === grade)
        .map((r) => ({ metricCode: r.metricCode, metricName: r.metricCode, min: r.minValue, max: r.maxValue }));
      if (source === "NONE" && standardThresholds.length > 0) source = "QUALITY_STANDARD";
    }

    const explicitCodes = new Set(explicitThresholds.map((t) => t.metricCode));
    const thresholds = [...explicitThresholds, ...standardThresholds.filter((t) => !explicitCodes.has(t.metricCode))];

    return { grade, thresholds, source };
  }
}
