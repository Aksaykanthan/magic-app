"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PostList() {
  const trpc = useTRPC();
  const { data: posts, isLoading } = useQuery(trpc.post.list.queryOptions());

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["a", "b", "c"].map((key) => (
          <Card key={key}>
            <CardHeader>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No posts yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <Card key={post.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>{post.title}</CardTitle>
              <Badge variant={post.published ? "default" : "secondary"}>
                {post.published ? "Published" : "Draft"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              By {post.author.name}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
