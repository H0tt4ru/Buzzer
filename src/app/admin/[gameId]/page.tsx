import { AdminGateway } from '@/components/admin/AdminGateway';

export const dynamic = 'force-dynamic';

export default async function AdminGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gameId } = await params;
  const query = await searchParams;

  const raw = query.t;
  const tokenFromUrl = typeof raw === 'string' && raw.length >= 8 ? raw : null;

  return <AdminGateway gameId={gameId} tokenFromUrl={tokenFromUrl} />;
}
