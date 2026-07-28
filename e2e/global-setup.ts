import { clerkSetup } from '@clerk/testing/playwright';

/**
 * Fetches a Clerk Testing Token once for the whole run via the Backend API.
 * Without it, Clerk's bot detection can silently stall the Frontend API
 * calls an authenticated session makes to sync client-side — reproducible
 * from a CI runner's datacenter IP but not from a developer's own machine,
 * which is why this never showed up locally. `setupClerkTestingToken`
 * (called per-test — see `e2e/fixtures.ts` and `e2e/support/clerk-sign-in.ts`)
 * applies the token this fetches.
 */
export default async function globalSetup() {
  await clerkSetup({
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  });
}
