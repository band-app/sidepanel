import { Button } from "@band-app/ui";
import { CheckIcon, Loader2, XIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { trpc } from "../../lib/trpc-client";
import { MessageResponse } from "./message";

interface PlanApprovalProps {
  plan: string;
  approvalId: string;
}

export function PlanApproval({ plan, approvalId }: PlanApprovalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"approved" | "rejected" | null>(null);

  const handleApprove = useCallback(async () => {
    setSubmitting(true);
    try {
      await trpc.chat.answer.mutate({
        approvalId,
        answers: { plan: "approved" },
      });
      setResult("approved");
    } finally {
      setSubmitting(false);
    }
  }, [approvalId]);

  const handleReject = useCallback(async () => {
    setSubmitting(true);
    try {
      await trpc.chat.answer.mutate({
        approvalId,
        answers: { plan: "rejected" },
      });
      setResult("rejected");
    } finally {
      setSubmitting(false);
    }
  }, [approvalId]);

  const isDisabled = submitting || result !== null;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Plan Review
      </div>
      <MessageResponse>{plan}</MessageResponse>
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" disabled={isDisabled} onClick={handleApprove}>
          {submitting ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <CheckIcon className="mr-1.5 size-3.5" />
          )}
          {result === "approved" ? "Approved" : "Approve"}
        </Button>
        <Button size="sm" variant="outline" disabled={isDisabled} onClick={handleReject}>
          <XIcon className="mr-1.5 size-3.5" />
          {result === "rejected" ? "Rejected" : "Reject"}
        </Button>
        {result && (
          <span className="text-sm text-muted-foreground">
            {result === "approved" ? "Plan approved — agent continuing" : "Plan rejected"}
          </span>
        )}
      </div>
    </div>
  );
}
