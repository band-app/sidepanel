import { createTRPCClient, httpBatchLink } from "@trpc/client";

// biome-ignore lint/suspicious/noExplicitAny: untyped tRPC client (can't import AppRouter from apps/web)
export const trpc: any = createTRPCClient({
  links: [httpBatchLink({ url: "/trpc" })],
});
