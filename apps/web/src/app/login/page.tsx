import { LoginScreen } from '../../features/auth/login-screen';
export const metadata = { title: 'Welcome in' };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; error?: string }>;
}) {
  const query = await searchParams;
  return (
    <LoginScreen
      expired={query.expired === '1'}
      failed={Boolean(query.error)}
    />
  );
}
