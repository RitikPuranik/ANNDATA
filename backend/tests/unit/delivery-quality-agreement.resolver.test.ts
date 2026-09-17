import { DeliveryQualityAgreementResolver } from "../../src/modules/deliveries/delivery-quality-agreement.resolver";

/**
 * Step 6/23 — verifies the priority order documented on the resolver
 * itself: BuyerDemand.qualityRequirements/grade > Module 5's own
 * QualityStandard rows at the resolved grade > the lot's own latest
 * VERIFIED QualityAssessment grade > NONE. Uses fakes for PrismaClient and
 * QualityStandardRepository — no database required.
 */

function buildResolver(options: {
  demand?: { qualityRequirements: Record<string, unknown> | null; grade: string | null } | null;
  standards?: Array<{ grade: string; metricCode: string; minValue: number | null; maxValue: number | null }>;
  latestVerifiedGrade?: string | null;
}) {
  const prisma = {
    tradeOffer: {
      findUnique: jest.fn(async () => (options.demand !== undefined ? { demand: options.demand } : { demand: null })),
    },
    cropLot: {
      findUnique: jest.fn(async () => ({
        qualityAssessments: options.latestVerifiedGrade ? [{ overallGrade: options.latestVerifiedGrade }] : [],
      })),
    },
  } as never;
  const qualityStandards = { findByCropId: jest.fn(async () => options.standards ?? []) } as never;
  return new DeliveryQualityAgreementResolver(prisma, qualityStandards);
}

describe("DeliveryQualityAgreementResolver", () => {
  it("uses the BuyerDemand's own explicit grade + moisture/foreignMatter thresholds when present", async () => {
    const resolver = buildResolver({ demand: { qualityRequirements: { moistureMax: 12, foreignMatterMax: 2 }, grade: "A" } });
    const result = await resolver.resolve("lot-1", "crop-1", "offer-1");

    expect(result.source).toBe("BUYER_DEMAND");
    expect(result.grade).toBe("A");
    expect(result.thresholds).toEqual(
      expect.arrayContaining([
        { metricCode: "moisture", metricName: "Moisture", min: null, max: 12 },
        { metricCode: "foreignMatter", metricName: "Foreign matter", min: null, max: 2 },
      ]),
    );
  });

  it("falls back to Module 5's QualityStandard rows for metrics the BuyerDemand didn't specify", async () => {
    const resolver = buildResolver({
      demand: { qualityRequirements: { moistureMax: 12 }, grade: "A" },
      standards: [
        { grade: "A", metricCode: "moisture", minValue: null, maxValue: 10 }, // should be ignored — explicit wins
        { grade: "A", metricCode: "brokenGrains", minValue: null, maxValue: 5 },
      ],
    });
    const result = await resolver.resolve("lot-1", "crop-1", "offer-1");

    const moisture = result.thresholds.find((t) => t.metricCode === "moisture");
    const broken = result.thresholds.find((t) => t.metricCode === "brokenGrains");
    expect(moisture?.max).toBe(12); // explicit BuyerDemand value, not the standard's 10
    expect(broken?.max).toBe(5); // filled in from the standard
  });

  it("falls back to the lot's own latest VERIFIED assessment grade when no commercial agreement carries a grade", async () => {
    const resolver = buildResolver({ demand: null, latestVerifiedGrade: "B" });
    const result = await resolver.resolve("lot-1", "crop-1", null);

    expect(result.grade).toBe("B");
    expect(result.source).toBe("LOT_ASSESSMENT");
  });

  it("returns NONE with a null grade and no thresholds when nothing at all is resolvable", async () => {
    const resolver = buildResolver({ demand: null, latestVerifiedGrade: null });
    const result = await resolver.resolve("lot-1", "crop-1", null);

    expect(result.grade).toBeNull();
    expect(result.thresholds).toHaveLength(0);
    expect(result.source).toBe("NONE");
  });

  it("never lets a BuyerDemand with no grade at all block the QUALITY_STANDARD fallback (grade resolved via lot assessment)", async () => {
    const resolver = buildResolver({
      demand: { qualityRequirements: {}, grade: null },
      latestVerifiedGrade: "A",
      standards: [{ grade: "A", metricCode: "moisture", minValue: null, maxValue: 14 }],
    });
    const result = await resolver.resolve("lot-1", "crop-1", "offer-1");

    expect(result.grade).toBe("A");
    expect(result.thresholds.find((t) => t.metricCode === "moisture")?.max).toBe(14);
  });
});
