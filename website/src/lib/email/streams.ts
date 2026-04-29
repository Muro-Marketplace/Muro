// Sending streams. Each stream can map to its own verified domain in Resend
// so reputation stays isolated (a newsletter complaint can't poison password resets).
//
// For MVP you can point all three at the same verified domain. As volume grows,
// verify `tx.wallplace.co.uk`, `notify.wallplace.co.uk`, `news.wallplace.co.uk`
// separately in Resend and flip the env vars, nothing else has to change.

export type EmailStream = "tx" | "notify" | "news";

export interface StreamConfig {
  from: string;
  replyTo?: string;
  /** User cannot opt out of this stream (security, legal, orders). */
  unsuppressible: boolean;
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
void SITE;

export const STREAMS: Record<EmailStream, StreamConfig> = {
  tx: {
    from:
      process.env.EMAIL_FROM_TX ||
      "Wallplace <noreply@wallplace.co.uk>",
    replyTo: process.env.EMAIL_REPLY_TO || "hello@wallplace.co.uk",
    unsuppressible: true,
  },
  notify: {
    from:
      process.env.EMAIL_FROM_NOTIFY ||
      "Wallplace <notifications@wallplace.co.uk>",
    replyTo: process.env.EMAIL_REPLY_TO || "hello@wallplace.co.uk",
    unsuppressible: false,
  },
  news: {
    from:
      process.env.EMAIL_FROM_NEWS ||
      "Wallplace <hello@wallplace.co.uk>",
    replyTo: process.env.EMAIL_REPLY_TO || "hello@wallplace.co.uk",
    unsuppressible: false,
  },
};
