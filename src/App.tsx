import { useCallback, useEffect, useState } from 'react';
import { isRoomCode } from '../shared/protocol';
import { Toaster } from './components/Toast';
import { Home } from './screens/Home';
import { Room } from './screens/Room';

function parse(url: string) {
  const { pathname, searchParams } = new URL(url, location.origin);
  const match = pathname.match(/^\/t\/([A-Za-z]{4})\/?$/);
  const code = match?.[1].toUpperCase();
  if (code && isRoomCode(code)) return { code, display: searchParams.get('view') === 'display' };
  return null;
}

export function App() {
  const [href, setHref] = useState(() => location.pathname + location.search);

  useEffect(() => {
    const onPop = () => setHref(location.pathname + location.search);
    window.addEventListener('popstate', onPop);
    if (location.pathname !== '/' && !parse(location.href)) history.replaceState(null, '', '/');
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    history.pushState(null, '', to);
    setHref(to);
    window.scrollTo(0, 0);
  }, []);

  const route = parse(href);

  return (
    <>
      {route ? <Room key={route.code} code={route.code} display={route.display} navigate={navigate} /> : <Home navigate={navigate} />}
      <Toaster />
    </>
  );
}
