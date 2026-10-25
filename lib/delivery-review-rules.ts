import { z } from "zod";

export const deliveryKinds = ["booking", "telegram", "assignment", "chat"] as const;
export type DeliveryKind = typeof deliveryKinds[number];
export const reviewReasonLabels = {
  confirmed_absent: "Checked provider: message absent",
  configuration_corrected: "Configuration corrected; message absent",
  verified_in_provider: "Checked provider: delivery receipt found",
  not_required: "Notification no longer required",
  duplicate_notification: "Another notification already covers this event",
  expired_trip: "Trip or conversation expired",
  unrecoverable_legacy: "Legacy message cannot safely be recovered",
} as const;
export const deliveryReviewSchema = z.object({
  requestId: z.string().uuid(), kind: z.enum(deliveryKinds), jobId: z.string().min(1).max(500),
  expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
  action: z.enum(["retry", "confirm_delivered", "close"]),
  reason: z.enum(Object.keys(reviewReasonLabels) as [keyof typeof reviewReasonLabels, ...(keyof typeof reviewReasonLabels)[]]),
  confirmedAbsent: z.boolean().default(false), providerMessageId: z.string().max(200).default(""),
  destinationType: z.enum(["group", "private"]).optional(), destinationId: z.string().max(32).default(""), useAsRoot: z.boolean().default(false),
}).strict().superRefine((value, ctx) => {
  if (value.action !== "confirm_delivered" && !value.confirmedAbsent) ctx.addIssue({ code: "custom", message: "Confirm that the message was not delivered." });
  const allowed = value.action === "retry" ? ["confirmed_absent", "configuration_corrected"] : value.action === "confirm_delivered" ? ["verified_in_provider"] : ["not_required", "duplicate_notification", "expired_trip", "unrecoverable_legacy"];
  if (!allowed.includes(value.reason)) ctx.addIssue({ code: "custom", message: "Choose a reason for this decision." });
  if (value.action === "confirm_delivered" && !/^[a-zA-Z0-9_-]{1,200}$/.test(value.providerMessageId)) ctx.addIssue({ code: "custom", message: "Enter the observed provider message ID." });
  if (value.action !== "confirm_delivered" && value.providerMessageId) ctx.addIssue({ code: "custom", message: "Only a delivered decision records a provider receipt." });
  if(value.kind==="chat" && value.action==="confirm_delivered"){
    if(!value.destinationType || !/^-?\d{1,20}$/.test(value.destinationId))ctx.addIssue({code:"custom",message:"Identify the chat that contains the receipt."});
    if(value.useAsRoot && value.destinationType!=="group")ctx.addIssue({code:"custom",message:"Only a group message can establish a conversation card."});
  }else if(value.destinationType || value.destinationId || value.useAsRoot)ctx.addIssue({code:"custom",message:"Routing evidence only applies to a delivered chat message."});
});
export type DeliveryReviewInput = z.infer<typeof deliveryReviewSchema>;
export const REVIEW_PAGE_SIZE = 50;
const safeFailures=new Set([
  "configuration","prepare_failed","snapshot_invalid","legacy_payload_missing","queue_age_exceeded","retry_budget_exceeded","network_unknown","unverified_response","rate_limited","provider_unavailable","request_in_progress","payload_conflict","request_rejected","conflict_unknown",
  "Telegram: rate limited","Telegram: request rejected","Telegram: bot blocked","Telegram: delivery outcome unknown","Telegram: quote rejected",
  "Provider acknowledgment is invalid; check Telegram","Private evidence changed; review the original notification","Stored notification payload is invalid",
  "Stored notification snapshot is invalid","Legacy attempted message has no recoverable snapshot","Destination changed; review before resending",
  "Driver link or booking version changed; review the original message","Conversation routing changed; review before resending",
  "Owner confirmed provider receipt","Owner closed after confirming absence","Telegram bot token or destination missing",
  "Assignment or driver link is no longer active","Interrupted send; check Telegram before retrying",
]);
export function deliveryFailureLabel(value:unknown){return typeof value==="string"&&value?safeFailures.has(value)?value:"Previous delivery failure; check the provider.":null;}
