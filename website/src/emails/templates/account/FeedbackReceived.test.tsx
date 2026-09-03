// The feedback and feature-request acknowledgement.
//
// Email audit, 2026-09-04: both forms stored the submission and told the
// sender nothing. SupportRequestReceived was the obvious model and the wrong
// one to reuse verbatim: it promises a reply within N working days, which is
// true of a support request and not of feedback. This one promises only what
// actually happens.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { FeedbackReceived, mock } from "./FeedbackReceived";

describe("FeedbackReceived", () => {
  it("quotes back what was sent, with the reference", async () => {
    const html = await render(FeedbackReceived(mock));
    expect(html).toContain("Calendar sync");
    expect(html).toContain(mock.referenceId);
  });

  it("promises no reply time, because nobody is committing to one", async () => {
    const html = await render(FeedbackReceived(mock));
    expect(html).not.toContain("working days");
    expect(html).toContain("We don");
    expect(html).toContain("contact support");
  });

  it("reads differently for feedback than for a feature request", async () => {
    const request = await render(FeedbackReceived(mock));
    const feedback = await render(
      FeedbackReceived({ ...mock, submittedType: "feedback", messageExcerpt: "Loving the new panel" }),
    );
    expect(request).toContain("shape what we build next");
    expect(feedback).toContain("we read all of it");
    expect(feedback).not.toContain("shape what we build next");
    // React splits the interpolated label with a comment node, so match the
    // words rather than the joined string.
    expect(feedback).toContain("Loving the new panel");
  });

  it("uses no em or en dashes", async () => {
    const html = await render(FeedbackReceived(mock));
    expect(html).not.toContain("—");
    expect(html).not.toContain("–");
  });
});
