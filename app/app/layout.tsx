import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/serverUser";
import AppShell from "./AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();
  if (!user) redirect("/login");
  return <AppShell userName={user.name} isAdmin={user.role === "admin"}>{children}</AppShell>;
}
