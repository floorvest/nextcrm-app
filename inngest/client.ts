import { Inngest } from "inngest";

// Fallbacks keep this module safe to evaluate during build-time page-data
// collection, where the background-job settings are not present. Real values
// are still injected at runtime; the id only needs to be stable, not secret.
export const inngest = new Inngest({
  id: process.env.INNGEST_ID || "nextcrm",
  name: process.env.INNGEST_APP_NAME || "NextCRM",
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
