"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const handleLogOut = async () => {
    setIsPending(true);
    await signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <Button variant="destructive" onClick={handleLogOut} disabled={isPending}>
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      Log out
    </Button>
  );
}
