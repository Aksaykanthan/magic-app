import "server-only";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { TRPCQueryOptions } from "@trpc/tanstack-react-query";
import { headers } from "next/headers";
import { cache } from "react";
import { createTRPCContext } from "@/lib/trpc/init";
import { makeQueryClient } from "@/lib/trpc/query-client";
import { appRouter } from "@/lib/trpc/routers/_app";

export const getQueryClient = cache(makeQueryClient);

/**
 * Server-side proxy — call `trpc.post.list.queryOptions()` from a Server
 * Component and pass the result to `prefetch()`.
 */
export const trpc = createTRPCOptionsProxy({
  ctx: async () => createTRPCContext({ headers: await headers() }),
  router: appRouter,
  queryClient: getQueryClient,
});

export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {props.children}
    </HydrationBoundary>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TRPCQueryOptions requires `any` as its generic bound (library constraint, per the official trpc/tanstack-react-query App Router skill).
export function prefetch<TOptions extends ReturnType<TRPCQueryOptions<any>>>(
  queryOptions: TOptions,
) {
  const queryClient = getQueryClient();
  const key = queryOptions.queryKey[1];
  if (key && "type" in key && key.type === "infinite") {
    void queryClient.prefetchInfiniteQuery(
      queryOptions as unknown as Parameters<typeof queryClient.prefetchInfiniteQuery>[0],
    );
  } else {
    void queryClient.prefetchQuery(queryOptions);
  }
}
