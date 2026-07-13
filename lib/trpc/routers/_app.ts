import { createTRPCRouter } from "@/lib/trpc/init";
import { postRouter } from "@/lib/trpc/routers/post";

export const appRouter = createTRPCRouter({
  post: postRouter,
});

export type AppRouter = typeof appRouter;
