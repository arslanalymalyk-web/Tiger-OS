import { redirect } from "next/navigation";
import { requireActor } from "@/server/web";

export default async function Home() {
  const a = await requireActor();
  redirect(a.role === "platform_admin" ? "/app/platform" : a.role === "field_technician" ? "/app/cases?mine=1" : a.role === "customer_approver" ? "/app/portal" : "/app/dashboard");
}
