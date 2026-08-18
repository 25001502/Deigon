"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, name: string) {
  const input = formData.get(name);
  return typeof input === "string" ? input.trim() : "";
}

export async function logIn(formData: FormData) {
  const email = value(formData, "email");
  const password = value(formData, "password");

  if (!email || !password) {
    redirect("/login?error=Email%20and%20password%20are%20required");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/account");
}

export async function signUp(formData: FormData) {
  const email = value(formData, "email");
  const password = value(formData, "password");

  if (!email || !password) {
    redirect("/signup?error=Email%20and%20password%20are%20required");
  }

  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  if (data.session) {
    redirect("/account");
  }

  redirect("/login?message=Check%20your%20email%20to%20confirm%20your%20account");
}

export async function logOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?message=You%20have%20been%20logged%20out");
}