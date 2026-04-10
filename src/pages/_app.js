import '@/styles/globals.css';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

function AppContent({ Component, pageProps }) {
  const { user } = useAuth();

  return (
    <>
      <Component {...pageProps} />
    </>
  );
}

export default function App({ Component, pageProps }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent SSR prerendering — this app is fully client-side
  if (!mounted) return null;

  return (
    <AuthProvider>
      <AppContent Component={Component} pageProps={pageProps} />
    </AuthProvider>
  );
}

App.getInitialProps = async (context) => {
  let pageProps = {};
  if (context.Component.getInitialProps) {
    pageProps = await context.Component.getInitialProps(context.ctx);
  }
  return { pageProps };
};
