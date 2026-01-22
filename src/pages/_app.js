import '@/styles/globals.css';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import AIChat from '@/components/AIChat';

function AppContent({ Component, pageProps }) {
  const { user } = useAuth();

  return (
    <>
      <Component {...pageProps} />
      {user && <AIChat userId={user.id} />}
    </>
  );
}

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AppContent Component={Component} pageProps={pageProps} />
    </AuthProvider>
  );
}
