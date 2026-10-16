import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, getSessionUser } from "@/lib/auth";
import Studio from "@/components/Studio";

export const runtime = "nodejs";

export default async function StudioPage() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const username = token ? await getSessionUser(token) : null;
  if (!username) redirect("/login");
  return <Studio username={username} />;
}
