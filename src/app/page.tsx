import { redirect } from "next/navigation";
import { getActor, homeFor } from "@/server/session";

export default async function Home() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  redirect(homeFor(actor.role));
}
