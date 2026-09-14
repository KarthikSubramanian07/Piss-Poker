import { fmt } from '../lib/format';
import { useTweened } from '../lib/motion';

export function Num({ value, className }: { value: number; className?: string }) {
  const shown = useTweened(value);
  return <span className={className ? `num ${className}` : 'num'}>{fmt(shown)}</span>;
}
