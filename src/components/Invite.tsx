import { useState } from 'react';
import { roomUrl } from '../lib/format';
import { Icon } from './Icon';
import { Qr } from './Qr';
import { toast } from './Toast';

export function Invite({ code, qrSize = 176 }: { code: string; qrSize?: number }) {
  const url = roomUrl(code);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(url);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: `Piss Poker table ${code}`, text: `Join my poker table: ${code}`, url });
    } catch {
      // dismissed
    }
  };

  return (
    <div className="invite">
      <div className="invite-code">
        <span className="big-code" aria-label={`Table code ${code.split('').join(' ')}`}>
          {code}
        </span>
        <span className="muted invite-url mono">{url.replace(/^https?:\/\//, '')}</span>
      </div>
      <Qr value={url} size={qrSize} label={`QR code to join table ${code}`} />
      <div className="invite-actions">
        {canShare && (
          <button className="btn btn-quiet btn-md" onClick={share}>
            <Icon name="share" size={18} /> Share
          </button>
        )}
        <button className="btn btn-quiet btn-md" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={18} /> {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}
