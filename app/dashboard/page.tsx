import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/serverUser";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  return (
    <DashboardClient
      initialUser={{
        name: user.name,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode,
        referredBy: user.referredBy,
        mustChangePassword: user.mustChangePassword === 1,
      }}
    />
  );
}
