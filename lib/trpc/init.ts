import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** tRPC request context — session + db handle, available in every procedure. */
export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth.api.getSession({ headers: opts.headers });
  return { session, db: prisma };
}

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create({
    transformer: superjson,
    errorFormatter({ shape }) {
      return shape;
    },
  });

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Public procedure — no auth required. */
export const publicProcedure = t.procedure;

/** Protected procedure — throws UNAUTHORIZED if there is no session. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});
