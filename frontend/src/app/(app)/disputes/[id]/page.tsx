"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, MessageSquare, XCircle } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/stat-card";
import { Card, Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/StateBlocks";
import { useAuth } from "@/hooks/useAuth";
import { disputeApi, DisputeResolutionCode } from "@/services/disputeApi";
import { ApiRequestError } from "@/types/api";

const RESOLUTION_CODES: DisputeResolutionCode[] = [
  "NO_ACTION_REQUIRED",
  "CLAIM_REJECTED",
  "CLAIM_ACCEPTED",
  "PARTIAL_CLAIM_ACCEPTED",
  "REFUND_REQUIRED",
  "PAYMENT_ADJUSTMENT_REQUIRED",
  "QUANTITY_ADJUSTMENT",
  "QUALITY_ADJUSTMENT",
  "DELIVERY_ADJUSTMENT",
  "LOGISTICS_ADJUSTMENT",
  "OTHER",
];

/**
 * Module 21 frontend detail/investigation view. Comments and internal
 * notes are visually separated (internal notes only ever come back from
 * the API for an ADMIN caller — see NotificationController's own
 * `listComments(disputeId, includeInternal)` filtering — so no client-side
 * hiding is needed here). ADMIN-only actions (assign/status/resolve/
 * reject/reopen/close) are gated the same way the backend gates them:
 * shown only for ADMIN, and the backend re-checks regardless.
 */
function DisputeDetailContent({ id }: { id: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [comment, setComment] = React.useState("");
  const [internalNote, setInternalNote] = React.useState(false);
  const [resolutionCode, setResolutionCode] = React.useState<DisputeResolutionCode>("NO_ACTION_REQUIRED");
  const [resolutionSummary, setResolutionSummary] = React.useState("");
  const [finalResolution, setFinalResolution] = React.useState("");
  const [rejectSummary, setRejectSummary] = React.useState("");

  const disputeQuery = useQuery({ queryKey: ["disputes", id], queryFn: () => disputeApi.get(id) });
  const commentsQuery = useQuery({ queryKey: ["disputes", id, "comments"], queryFn: () => disputeApi.listComments(id) });
  const historyQuery = useQuery({ queryKey: ["disputes", id, "history"], queryFn: () => disputeApi.listHistory(id) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["disputes", id] });
    queryClient.invalidateQueries({ queryKey: ["disputes", id, "comments"] });
    queryClient.invalidateQueries({ queryKey: ["disputes", id, "history"] });
  };

  const onErr = (fallback: string) => (e: unknown) => setActionError(e instanceof ApiRequestError ? e.message : fallback);

  const addComment = useMutation({
    mutationFn: () => disputeApi.addComment(id, comment.trim(), internalNote),
    onSuccess: () => { setComment(""); setInternalNote(false); invalidate(); },
    onError: onErr("Couldn't add that comment."),
  });

  const resolve = useMutation({
    mutationFn: () => disputeApi.resolve(id, { resolutionCode, resolutionSummary: resolutionSummary.trim(), finalResolution: finalResolution.trim() }),
    onSuccess: invalidate,
    onError: onErr("Couldn't resolve this dispute."),
  });

  const reject = useMutation({
    mutationFn: () => disputeApi.reject(id, rejectSummary.trim()),
    onSuccess: () => { setRejectSummary(""); invalidate(); },
    onError: onErr("Couldn't reject this dispute."),
  });

  const close = useMutation({ mutationFn: () => disputeApi.close(id), onSuccess: invalidate, onError: onErr("Couldn't close this dispute.") });
  const cancel = useMutation({ mutationFn: () => disputeApi.cancel(id), onSuccess: invalidate, onError: onErr("Couldn't cancel this dispute.") });
  const startReview = useMutation({ mutationFn: () => disputeApi.changeStatus(id, "UNDER_REVIEW"), onSuccess: invalidate, onError: onErr("Couldn't update this dispute's status.") });
  const startInvestigation = useMutation({ mutationFn: () => disputeApi.changeStatus(id, "INVESTIGATION"), onSuccess: invalidate, onError: onErr("Couldn't update this dispute's status.") });

  if (disputeQuery.isLoading) return <LoadingBlock />;
  if (disputeQuery.isError || !disputeQuery.data) return <ErrorBlock message="Couldn't load this dispute." onRetry={() => disputeQuery.refetch()} />;

  const d = disputeQuery.data;
  const isRaiser = user?.id === d.raisedByUserId;
  const canCancel = (isRaiser || isAdmin) && ["OPEN", "UNDER_REVIEW"].includes(d.status);
  const canResolveOrReject = isAdmin && ["UNDER_REVIEW", "INVESTIGATION", "AWAITING_PARTY_RESPONSE", "RESOLUTION_PROPOSED"].includes(d.status);
  const canClose = isAdmin && ["RESOLVED", "REJECTED"].includes(d.status);

  return (
    <div>
      <PageHeader
        title={d.title}
        breadcrumb={
          <a href="/disputes" className="hover:underline">
            ← Back to disputes
          </a>
        }
      />

      {actionError && <Alert variant="error" className="mb-4">{actionError}</Alert>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{d.disputeNumber} · {d.type.replace(/_/g, " ")} · {d.category}</p>
            <p className="mt-2 whitespace-pre-wrap text-[15px]">{d.description}</p>
            {d.requestedResolution && (
              <p className="mt-3 text-sm text-muted-foreground">
                <b>Requested resolution:</b> {d.requestedResolution}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Badge tone={toneForStatus(d.status)}>{d.status.replace(/_/g, " ")}</Badge>
            {(d.priority === "CRITICAL" || d.priority === "HIGH") && <Badge tone="destructive">{d.priority}</Badge>}
          </div>
        </div>

        {d.finalResolution && (
          <div className="mt-4 rounded-xl bg-secondary/60 p-4">
            <p className="text-sm font-semibold">Final resolution</p>
            <p className="mt-1 text-sm text-muted-foreground">{d.finalResolution}</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {isAdmin && d.status === "OPEN" && (
            <Button variant="outline" className="w-auto px-4" isLoading={startReview.isPending} onClick={() => startReview.mutate()}>
              Start review
            </Button>
          )}
          {isAdmin && d.status === "UNDER_REVIEW" && (
            <Button variant="outline" className="w-auto px-4" isLoading={startInvestigation.isPending} onClick={() => startInvestigation.mutate()}>
              Move to investigation
            </Button>
          )}
          {canClose && (
            <Button variant="outline" className="w-auto px-4" isLoading={close.isPending} onClick={() => close.mutate()}>
              Close dispute
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" className="w-auto px-4" isLoading={cancel.isPending} onClick={() => cancel.mutate()}>
              <XCircle className="h-4 w-4" aria-hidden /> Cancel
            </Button>
          )}
        </div>
      </Card>

      {canResolveOrReject && (
        <Card className="mt-6">
          <h3 className="mb-3 section-title">Resolve or reject</h3>
          <div className="space-y-3">
            <select
              className="flex h-12 w-full appearance-none rounded-lg border border-input bg-card px-4 text-base"
              value={resolutionCode}
              onChange={(e) => setResolutionCode(e.target.value as DisputeResolutionCode)}
            >
              {RESOLUTION_CODES.map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
              ))}
            </select>
            <textarea
              rows={2}
              placeholder="Resolution summary"
              className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-[15px] outline-none ring-ring focus:ring-2"
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
            />
            <textarea
              rows={2}
              placeholder="Final resolution (what was actually decided)"
              className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-[15px] outline-none ring-ring focus:ring-2"
              value={finalResolution}
              onChange={(e) => setFinalResolution(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                className="w-auto px-4"
                isLoading={resolve.isPending}
                disabled={resolutionSummary.trim().length < 10 || finalResolution.trim().length < 3}
                onClick={() => resolve.mutate()}
              >
                Resolve
              </Button>
            </div>
            <div className="border-t border-border pt-3">
              <textarea
                rows={2}
                placeholder="Why this claim is being rejected"
                className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-[15px] outline-none ring-ring focus:ring-2"
                value={rejectSummary}
                onChange={(e) => setRejectSummary(e.target.value)}
              />
              <Button
                variant="destructive"
                className="mt-2 w-auto px-4"
                isLoading={reject.isPending}
                disabled={rejectSummary.trim().length < 10}
                onClick={() => reject.mutate()}
              >
                Reject claim
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="mt-6">
        <h3 className="mb-3 flex items-center gap-2 section-title">
          <MessageSquare className="h-[18px] w-[18px]" aria-hidden /> Comments
        </h3>
        {commentsQuery.isLoading ? (
          <LoadingBlock />
        ) : (
          <div className="space-y-3">
            {(commentsQuery.data ?? []).map((c) => (
              <div
                key={c.id}
                className={`rounded-xl border p-3 ${c.visibility === "INTERNAL_NOTE" ? "border-warning/40 bg-warning/5" : "border-border bg-card"}`}
              >
                <p className="text-xs font-semibold text-muted-foreground">
                  {c.authorRole} {c.visibility === "INTERNAL_NOTE" ? "· Internal note" : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{c.message}</p>
              </div>
            ))}
            {(commentsQuery.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
          </div>
        )}

        <div className="mt-4 space-y-2">
          <textarea
            rows={2}
            placeholder="Add a comment…"
            className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-[15px] outline-none ring-ring focus:ring-2"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            {isAdmin && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} /> Internal note (admin only)
              </label>
            )}
            <Button
              className="w-auto px-4"
              isLoading={addComment.isPending}
              disabled={comment.trim().length === 0}
              onClick={() => addComment.mutate()}
            >
              Post
            </Button>
          </div>
        </div>
      </Card>

      <Card className="mt-6">
        <h3 className="mb-3 flex items-center gap-2 section-title">
          <History className="h-[18px] w-[18px]" aria-hidden /> History
        </h3>
        {historyQuery.isLoading ? (
          <LoadingBlock />
        ) : (
          <div className="space-y-2">
            {(historyQuery.data ?? []).map((h, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <div>
                  <p className="font-medium">{h.eventType.replace(/_/g, " ")}</p>
                  {h.description && <p className="text-muted-foreground">{h.description}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <ProtectedRoute>
      <DisputeDetailContent id={params.id} />
    </ProtectedRoute>
  );
}
