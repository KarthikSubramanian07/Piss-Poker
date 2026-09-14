const TOKEN_KEY = 'pp.token';
const NAME_KEY = 'pp.name';
const SOUND_KEY = 'pp.sound';

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode or storage disabled: the session still works, it just will not survive reloads
  }
}

let memoryToken: string | null = null;

export function deviceToken() {
  const existing = read(TOKEN_KEY) ?? memoryToken;
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
  memoryToken = token;
  write(TOKEN_KEY, token);
  return token;
}

export const savedName = () => read(NAME_KEY) ?? '';
export const saveName = (name: string) => write(NAME_KEY, name);
export const soundEnabled = () => read(SOUND_KEY) !== 'off';
export const setSoundEnabled = (on: boolean) => write(SOUND_KEY, on ? 'on' : 'off');
