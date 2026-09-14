import { TableProvider } from '../lib/table';
import { useRoom } from '../lib/useRoom';
import { Display } from './Display';
import { Join } from './Join';
import { Table } from './Table';

const CLOSED_COPY = {
  expired: { title: 'This table closed', body: 'Tables close after 12 quiet hours. Start a new one any time.' },
  kicked: { title: 'You were removed', body: 'The host took you off this table.' },
  replaced: { title: 'Seat moved', body: 'Your seat is now on another device.' },
} as const;

export function Room({ code, display, navigate }: { code: string; display: boolean; navigate: (to: string) => void }) {
  const conn = useRoom(code);
  const toDisplay = () => navigate(`/t/${code}?view=display`);
  const toTable = () => navigate(`/t/${code}`);

  if (conn.status === 'missing') {
    return (
      <Notice
        title={`No table called ${code}`}
        body="Double check the code. Or maybe it folded."
        action="Back home"
        onAction={() => navigate('/')}
      />
    );
  }
  if (conn.status === 'closed' && conn.closedReason) {
    const copy = CLOSED_COPY[conn.closedReason];
    return <Notice title={copy.title} body={copy.body} action="Back home" onAction={() => navigate('/')} />;
  }
  if (!conn.state) {
    return (
      <main className="notice" aria-busy="true">
        <p className="big-code">{code}</p>
        <p className="muted">{conn.status === 'reconnecting' ? 'Reconnecting…' : 'Pulling up a chair…'}</p>
      </main>
    );
  }

  return (
    <TableProvider conn={conn}>
      {display ? (
        <Display onExit={toTable} />
      ) : conn.state.you.id ? (
        <Table onDisplay={toDisplay} onLeft={() => navigate('/')} />
      ) : (
        <Join onDisplay={toDisplay} />
      )}
    </TableProvider>
  );
}

function Notice({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <main className="notice">
      <h1 className="notice-title">{title}</h1>
      <p className="muted">{body}</p>
      <button className="btn btn-primary btn-lg" onClick={onAction}>
        {action}
      </button>
    </main>
  );
}
