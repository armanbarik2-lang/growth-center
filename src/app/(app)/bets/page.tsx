import { redirect } from "next/navigation";
export default async function Bets({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  redirect(id ? `/strategies?id=${encodeURIComponent(id)}` : "/strategies");
}
