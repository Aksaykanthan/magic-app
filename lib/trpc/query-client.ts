import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import superjson from "superjson";

/** Shared QueryClient factory for both the server (RSC) and browser client. */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30 * 1000 },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
