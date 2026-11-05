import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/serverUser";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  return <AdminClient selfId={user.id} />;
}
