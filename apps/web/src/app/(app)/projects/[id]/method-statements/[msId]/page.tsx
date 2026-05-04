import { redirect } from "next/navigation";

export default async function MethodStatementPage({
  params,
}: {
  params: Promise<{ id: string; msId: string }>;
}) {
  const { id, msId } = await params;
  redirect(`/draft-editor?mode=edit&projectId=${id}&msId=${msId}`);
}
