"use client";

import { useRouter } from "next/navigation";
// MAGIC:captcha:start
import { useState } from "react";
// MAGIC:captcha:end
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
import { signIn } from "@/lib/auth-client";
// MAGIC:google:end
import { signUp } from "@/lib/auth-client";
// MAGIC:captcha:start
import { env } from "@/lib/env";
// MAGIC:captcha:end

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Enter a valid email address."),
  // MAGIC:username:start
  username: z
    .string()
    .min(3, "Username must be at least 3 characters.")
    .max(30, "Username must be 30 characters or fewer.")
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only."),
  // MAGIC:username:end
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  // MAGIC:captcha:start
  const [captchaToken, setCaptchaToken] = useState("");
  // MAGIC:captcha:end

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      // MAGIC:username:start
      username: "",
      // MAGIC:username:end
      password: "",
    },
  });

  const onSubmit = async (values: RegisterValues) => {
    const fetchOptions = {
      onSuccess: () => {
        router.push("/dashboard");
        router.refresh();
      },
      onError: (ctx: { error: { message: string } }) => {
        toast.error(ctx.error.message);
      },
      // MAGIC:captcha:start
      headers: captchaToken ? { "x-captcha-response": captchaToken } : undefined,
      // MAGIC:captcha:end
    };

    await signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
      // MAGIC:username:start
      username: values.username,
      // MAGIC:username:end
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
          <Label htmlFor="register-name">Name</Label>
          <Input
            id="register-name"
            type="text"
            autoComplete="name"
            aria-invalid={!!form.formState.errors.name}
            {...form.register("name")}
          />
          {form.formState.errors.name ? (
            <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-email">Email</Label>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            aria-invalid={!!form.formState.errors.email}
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
          ) : null}
        </div>

        {/* MAGIC:username:start */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-username">Username</Label>
          <Input
            id="register-username"
            type="text"
            autoComplete="username"
            aria-invalid={!!form.formState.errors.username}
            {...form.register("username")}
          />
          {form.formState.errors.username ? (
            <p className="text-sm text-destructive">{form.formState.errors.username.message}</p>
          ) : null}
        </div>
        {/* MAGIC:username:end */}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-password">Password</Label>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
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
          Create account
        </Button>
      </form>
    </div>
  );
}
