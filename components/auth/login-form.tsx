"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    await signIn.email(
      { email: values.email, password: values.password },
      {
        onSuccess: () => {
          router.push(searchParams.get("redirectTo") ?? "/dashboard");
          router.refresh();
        },
        onError: (ctx) => {
          toast.error(ctx.error.message);
        },
      }
    );
  };

  const isPending = form.formState.isSubmitting;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!form.formState.errors.email}
          {...form.register("email")}
        />
        {form.formState.errors.email ? (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!form.formState.errors.password}
          {...form.register("password")}
        />
        {form.formState.errors.password ? (
          <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={isPending} className="mt-1.5 w-full">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Log in
      </Button>
    </form>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}>
      <LoginFormInner />
    </Suspense>
  );
}
