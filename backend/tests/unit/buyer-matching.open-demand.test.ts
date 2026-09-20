/**
 * Unit tests for BuyerMatchingService.searchOpenDemand — the account-less,
 * lot-less search used by the WhatsApp guest flow.
 *
 * Uses a lightweight Prisma mock (no database). What matters here:
 *  - it only ever asks the database for ACTIVE, unexpired demand of VERIFIED
 *    buyers for the requested crop (the same pool matches() scores against);
 *  - it needs no user, lot or farmer collaborator at all;
 *  - location ranks but never excludes; score breaks ties within a location tier;
 *  - nothing private leaks (no target price, no buyer contact details).
 */
import { BuyerMatchingService } from "../../src/modules/buyer-matching/buyer-matching.service";
import { FakeAuditService } from "../testUtils/fakeAuditService";

const demand = (o: Record<string, any> = {}) => ({
  publicId: "d-1",
  title: "Wheat wanted",
  requiredQuantity: 100,
  minimumQuantity: null,
  quantityUnit: "QTL",
  targetPrice: 2600, // must never be returned
  grade: null,
  state: "Madhya Pradesh",
  district: "Indore",
  buyer: { publicId: "b-1", organizationName: "ABC Foods", verificationStatus: "VERIFIED", contactPhone: "9999999999", userId: "secret-user" },
  ...o,
});

function makeService(rows: any[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = { buyerDemand: { findMany } } as any;
  // A guest has no user, lot or farmer: every collaborator is a stub that fails if touched.
  const boom = new Proxy({}, { get: () => () => { throw new Error("collaborator must not be used by an open-demand search"); } }) as any;
  const svc = new BuyerMatchingService(prisma, boom, boom, boom, new FakeAuditService() as any);
  return { svc, findMany };
}

describe("BuyerMatchingService.searchOpenDemand", () => {
  it("queries only ACTIVE, unexpired demand of VERIFIED buyers for the crop", async () => {
    const { svc, findMany } = makeService([]);
    await svc.searchOpenDemand({ cropId: "crop-wheat", quantity: 20, unit: "QTL" });
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ cropId: "crop-wheat", status: "ACTIVE", buyer: { verificationStatus: "VERIFIED" } });
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gte: expect.any(Date) } }]);
  });

  it("returns the same public shape as matches(), without the target price or buyer contact data", async () => {
    const { svc } = makeService([demand()]);
    const { matches } = await svc.searchOpenDemand({ cropId: "crop-wheat", quantity: 20, unit: "QTL" });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      buyer: { publicId: "b-1", organizationName: "ABC Foods" },
      demand: { publicId: "d-1", requiredQuantity: 100, quantityUnit: "QTL", state: "Madhya Pradesh", district: "Indore" },
    });
    expect(typeof matches[0]!.matchScore).toBe("number");
    const flat = JSON.stringify(matches);
    expect(flat).not.toContain("2600"); // targetPrice
    expect(flat).not.toContain("9999999999"); // contact
    expect(flat).not.toContain("secret-user"); // internal user id
  });

  it("ranks by location first (district → state → elsewhere), then by score — and never drops a buyer for location", async () => {
    const { svc } = makeService([
      demand({ publicId: "far", state: "Punjab", district: "Ludhiana", requiredQuantity: 20 }), // best quantity fit, wrong state
      demand({ publicId: "state", state: "Madhya Pradesh", district: "Indore", requiredQuantity: 40 }),
      demand({ publicId: "local", state: "Madhya Pradesh", district: "Sehore", requiredQuantity: 400 }), // weaker fit, but same district
    ]);
    const { matches } = await svc.searchOpenDemand({ cropId: "crop-wheat", quantity: 20, unit: "QTL", state: "Madhya Pradesh", district: "Sehore" });
    expect(matches.map((m: any) => m.demand.publicId)).toEqual(["local", "state", "far"]);
  });

  it("without a resolvable location it ranks purely by score", async () => {
    const { svc } = makeService([
      demand({ publicId: "small", requiredQuantity: 1000 }), // 20 of 1000 wanted → low quantity score
      demand({ publicId: "fit", requiredQuantity: 20 }), // exactly what the seller has
    ]);
    const { matches } = await svc.searchOpenDemand({ cropId: "crop-wheat", quantity: 20, unit: "QTL" });
    expect(matches.map((m: any) => m.demand.publicId)).toEqual(["fit", "small"]);
    expect(matches[0]!.matchScore).toBeGreaterThan(matches[1]!.matchScore);
  });

  it("converts the seller's quantity to kg with the shared unit conversion (20 qtl = 2000 kg = 2 t)", async () => {
    const rows = [demand({ requiredQuantity: 2, quantityUnit: "TONNE" })];
    const a = await makeService(rows).svc.searchOpenDemand({ cropId: "c", quantity: 20, unit: "QTL" });
    const b = await makeService(rows).svc.searchOpenDemand({ cropId: "c", quantity: 2000, unit: "KG" });
    const c = await makeService(rows).svc.searchOpenDemand({ cropId: "c", quantity: 2, unit: "TONNE" });
    expect(a.matches[0]!.matchScore).toBe(b.matches[0]!.matchScore);
    expect(a.matches[0]!.matchScore).toBe(c.matches[0]!.matchScore);
  });

  it("caps the result size", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => demand({ publicId: `d-${i}` }));
    const { svc } = makeService(rows);
    expect((await svc.searchOpenDemand({ cropId: "c", quantity: 20, unit: "QTL" })).matches).toHaveLength(30);
    expect((await svc.searchOpenDemand({ cropId: "c", quantity: 20, unit: "QTL", limit: 5 })).matches).toHaveLength(5);
  });
});
