"use client";

import { Suspense } from "react";
// MAGIC:captcha:start
import { useState } from "react";
// MAGIC:captcha:end
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
// MAGIC:captcha:start
import { Turnstile } from "@marsidev/react-turnstile";
// MAGIC:captcha:end
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// MAGIC:google:start
import { Separator } from "@/components/ui/separator";
// MAGIC:google:end
import { signIn } from "@/lib/auth-client";
// MAGIC:captcha:start
import { env } from "@/lib/env";
// MAGIC:captcha:end

const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your email or username."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // MAGIC:captcha:start
  const [captchaToken, setCaptchaToken] = useState("");
  // MAGIC:captcha:end

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const redirectTo = () => {
    router.push(searchParams.get("redirectTo") ?? "/dashboard");
    router.refresh();
  };

  const onSubmit = async (values: LoginValues) => {
    const fetchOptions = {
      onSuccess: redirectTo,
      onError: (ctx: { error: { message: string } }) => {
        toast.error(ctx.error.message);
      },
      // MAGIC:captcha:start
      headers: captchaToken ? { "x-captcha-response": captchaToken } : undefined,
      // MAGIC:captcha:end
    };

    // MAGIC:username:start
    if (!values.identifier.includes("@")) {
      await signIn.username({
        username: values.identifier,
        password: values.password,
        fetchOptions,
      });
      return;
    }
    // MAGIC:username:end

    await signIn.email({
      email: values.identifier,
      password: values.password,
      fetchOptions,
    });
  };

  // MAGIC:google:start
  const onGoogleSignIn = async () => {
    await signIn.social({ provider: "google", callbackURL: "/dashboard" });
  };
  // MAGIC:google:end

  const isPending = form.formState.isSubmitting;

  return (
    <div className="flex flex-col gap-4">
      {/* MAGIC:google:start */}
      <Button type="button" variant="outline" className="w-full" onClick={onGoogleSignIn}>
        Continue with Google
      </Button>
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>
      {/* MAGIC:google:end */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-identifier">Email or username</Label>
          <Input
            id="login-identifier"
            type="text"
            autoComplete="username"
            aria-invalid={!!form.formState.errors.identifier}
            {...form.register("identifier")}
          />
          {form.formState.errors.identifier ? (
            <p className="text-sm text-destructive">{form.formState.errors.identifier.message}</p>
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

        {/* MAGIC:captcha:start */}
        <Turnstile
          siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
          onSuccess={setCaptchaToken}
          onExpire={() => setCaptchaToken("")}
          options={{ size: "flexible" }}
        />
        {/* MAGIC:captcha:end */}

        <Button type="submit" disabled={isPending} className="mt-1.5 w-full">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Log in
        </Button>
      </form>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}>
      <LoginFormInner />
    </Suspense>
  );
}
