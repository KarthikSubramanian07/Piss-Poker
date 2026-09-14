import { useEffect, useState } from 'react';
import { AWAY_AFTER_MS, type MemberView } from '../../shared/protocol';

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Mirrors the server rule: no phone, or no socket heard from recently. */
export function isAway(member: MemberView | undefined, serverNow: number) {
  if (!member) return true;
  if (member.manual) return true;
  return member.connections === 0 || serverNow - member.lastSeen > AWAY_AFTER_MS + 15_000;
}
