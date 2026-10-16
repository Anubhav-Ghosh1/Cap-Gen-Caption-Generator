import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, getSessionUser } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";

export const runtime = "nodejs";

export default async function SignupPage() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token && (await getSessionUser(token))) redirect("/studio");
  return <AuthForm mode="signup" />;
}
