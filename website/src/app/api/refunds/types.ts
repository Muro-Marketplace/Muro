// Shared response-shape types for /api/refunds.
// PURE TYPES ONLY — no server imports so the client page can import safely.

export interface RefundRequestRow {
  id: string;
  order_id: string;
  status: "pending" | "processing" | "approved" | "rejected";
  type: "full" | "partial";
  amount?: number;
  reason: string;
  created_at: string;
}

/** GET /api/refunds success body */
export interface RefundsListResponse {
  refundRequests: RefundRequestRow[];
  userType: "admin" | "artist" | "customer";
}

/** POST /api/refunds/request success body */
export interface RefundRequestCreateResponse {
  success: true;
  refundRequest: RefundRequestRow;
}
