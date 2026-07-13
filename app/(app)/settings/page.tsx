import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LogoutButton } from "@/components/settings/logout-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const { user } = session;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Name
            </span>
            <span className="text-sm">{user.name}</span>
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Email
            </span>
            <span className="text-sm">{user.email}</span>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>
            Sign out of your account on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}
