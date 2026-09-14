import { useState, type FormEvent } from 'react';
import { CODE_LENGTH, normalizeCode } from '../../shared/protocol';
import { createRoom, roomInfo } from '../lib/api';
import { unlockAudio } from '../lib/device-features';

export function Home({ navigate }: { navigate: (to: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'new' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    unlockAudio();
    setBusy('new');
    setError(null);
    try {
      navigate(`/t/${await createRoom()}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    if (code.length !== CODE_LENGTH) return;
    setBusy('join');
    setError(null);
    try {
      const info = await roomInfo(code);
      if (!info) {
        setError(`No table called ${code}. Check the code on the host's screen.`);
        setBusy(null);
        return;
      }
      navigate(`/t/${code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <main className="home">
      <section className="home-hero">
        <h1 className="wordmark">
          <mark>Piss</mark> Poker
        </h1>
        <p className="home-tagline">Chips on your phone. Cards on the table.</p>
      </section>

      <section className="home-actions">
        <button className="btn btn-primary btn-xl" onClick={start} disabled={busy !== null}>
          {busy === 'new' ? 'Setting up…' : 'Start a table'}
        </button>

        <form className="join-form" onSubmit={join}>
          <label htmlFor="code" className="field-label">
            Have a code?
          </label>
          <div className="join-row">
            <input
              id="code"
              className="code-input"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="ABCD"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              maxLength={CODE_LENGTH + 4}
              aria-describedby={error ? 'home-error' : undefined}
            />
            <button className="btn btn-quiet btn-lg" disabled={code.length !== CODE_LENGTH || busy !== null}>
              {busy === 'join' ? 'Finding…' : 'Join'}
            </button>
          </div>
        </form>
        {error && (
          <p id="home-error" className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <ol className="home-how">
        <li>Start a table and share the code.</li>
        <li>Everyone joins on their own phone.</li>
        <li>Deal real cards. The app keeps every chip honest.</li>
      </ol>
    </main>
  );
}
