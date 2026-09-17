import { StudentGame } from '@/components/student/StudentGame';

export const dynamic = 'force-dynamic';

/**
 * The student's page. Nothing is rendered on the server: the token in the URL
 * is the student's identity and it is resolved by the database on the client's
 * first call, so there is no server-side session to establish and no game data
 * baked into the HTML.
 */
export default async function PlayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <StudentGame token={token} />;
}
