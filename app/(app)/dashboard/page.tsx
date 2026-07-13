import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server";
import { PostList } from "@/components/dashboard/post-list";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  prefetch(trpc.post.list.queryOptions());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {session.user.name}.
        </p>
      </div>
      <HydrateClient>
        <PostList />
      </HydrateClient>
    </div>
  );
}
