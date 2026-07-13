import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/lib/trpc/init";

/**
 * Sample CRUD router demonstrating the tRPC + Prisma + Zod pattern.
 * Delete once you have real routers to replace it with.
 */
export const postRouter = createTRPCRouter({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.post.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { name: true, image: true } } },
    }),
  ),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.db.post.findUniqueOrThrow({ where: { id: input.id } })),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        content: z.string().max(10_000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.post.create({
        data: { ...input, authorId: ctx.session.user.id },
      }),
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.post.delete({
        where: { id: input.id, authorId: ctx.session.user.id },
      });
      return { success: true };
    }),
});
