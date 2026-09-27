import {
  addCommentBody,
  addEvidenceBody,
  createDisputeBody,
  listDisputesQuery,
  resolveDisputeBody,
} from "../../src/modules/disputes/dispute.schemas";

describe("dispute schemas", () => {
  it("accepts a minimal valid transaction dispute", () => {
    const result = createDisputeBody.safeParse({
      type: "QUALITY_DISPUTE",
      title: "Quality lower than agreed",
      description: "The delivered produce did not match the agreed grade.",
      lotId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown field (strict)", () => {
    const result = createDisputeBody.safeParse({
      type: "QUALITY_DISPUTE",
      title: "Quality issue",
      description: "Something is wrong with the produce quality here.",
      lotId: "11111111-1111-1111-1111-111111111111",
      notAField: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a title that is too short", () => {
    const result = createDisputeBody.safeParse({
      type: "OTHER",
      title: "Hi",
      description: "A description that is long enough to pass validation.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a description that is too short", () => {
    const result = createDisputeBody.safeParse({
      type: "OTHER",
      title: "A valid title",
      description: "short",
    });
    expect(result.success).toBe(false);
  });

  it("defaults category to TRANSACTION and evidence to an empty array", () => {
    const result = createDisputeBody.parse({
      type: "OTHER",
      title: "A valid dispute title",
      description: "A sufficiently long description of the issue at hand.",
    });
    expect(result.category).toBe("TRANSACTION");
    expect(result.evidence).toEqual([]);
  });

  it("caps evidence at 10 items", () => {
    const evidence = Array.from({ length: 11 }, (_, i) => ({
      evidenceType: "DOCUMENT",
      storageProvider: "s3",
      externalId: `file-${i}`,
      secureUrl: "https://example.com/file",
      fileName: `file-${i}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1000,
    }));
    const result = createDisputeBody.safeParse({
      type: "OTHER",
      title: "A valid dispute title",
      description: "A sufficiently long description of the issue at hand.",
      evidence,
    });
    expect(result.success).toBe(false);
  });

  it("defaults a comment's internal flag to false", () => {
    const result = addCommentBody.parse({ message: "Some update on the dispute." });
    expect(result.internal).toBe(false);
  });

  it("rejects an empty comment message", () => {
    expect(addCommentBody.safeParse({ message: "" }).success).toBe(false);
  });

  it("requires all resolution fields", () => {
    const result = resolveDisputeBody.safeParse({
      resolutionCode: "CLAIM_ACCEPTED",
      resolutionSummary: "Investigated the evidence and found the claim valid.",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a complete resolution", () => {
    const result = resolveDisputeBody.safeParse({
      resolutionCode: "CLAIM_ACCEPTED",
      resolutionSummary: "Investigated the evidence and found the claim valid.",
      finalResolution: "Buyer to receive a partial refund via Module 19.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an evidence URL that is not a valid URL", () => {
    const result = addEvidenceBody.safeParse({
      evidenceType: "IMAGE",
      storageProvider: "s3",
      externalId: "abc",
      secureUrl: "not-a-url",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a `from` date after `to` in list filters", () => {
    const result = listDisputesQuery.safeParse({ from: "2026-05-01", to: "2026-01-01" });
    expect(result.success).toBe(false);
  });

  it("defaults pagination to page 1, limit 20", () => {
    const result = listDisputesQuery.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });
});
