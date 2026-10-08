import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendVaryAccept,
  isRoomPath,
  markdownPath,
  NOT_FOUND_MARKDOWN,
  preferredType,
} from '../functions/lib/negotiate';

describe('preferredType', () => {
  it('defaults to HTML when Accept is missing or */*', () => {
    expect(preferredType(null, ['text/html', 'text/markdown'])).toBe('text/html');
    expect(preferredType('*/*', ['text/html', 'text/markdown'])).toBe('text/html');
  });

  it('selects markdown when it is the highest-q match', () => {
    expect(preferredType('text/markdown', ['text/html', 'text/markdown'])).toBe('text/markdown');
    expect(preferredType('text/markdown, text/html;q=0.8', ['text/html', 'text/markdown'])).toBe('text/markdown');
  });

  it('keeps HTML when the client prefers it', () => {
    expect(preferredType('text/html', ['text/html', 'text/markdown'])).toBe('text/html');
    expect(preferredType('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', ['text/html', 'text/markdown'])).toBe(
      'text/html',
    );
  });

  it('honors q=0 rejection and returns null when nothing is acceptable', () => {
    expect(preferredType('text/markdown;q=0, text/html', ['text/html', 'text/markdown'])).toBe('text/html');
    expect(preferredType('text/markdown;q=0, text/html;q=0', ['text/html', 'text/markdown'])).toBeNull();
    expect(preferredType('application/pdf', ['text/html', 'text/markdown'])).toBeNull();
  });
});

describe('path helpers', () => {
  it('maps pages to markdown siblings', () => {
    expect(markdownPath('/')).toBe('/index.md');
    expect(markdownPath('/about')).toBe('/about/index.md');
    expect(markdownPath('/about/')).toBe('/about/index.md');
    expect(markdownPath('/contact/')).toBe('/contact/index.md');
  });

  it('detects live table codes', () => {
    expect(isRoomPath('/t/ABCD')).toBe(true);
    expect(isRoomPath('/t/abcd/')).toBe(true);
    expect(isRoomPath('/t/ABC')).toBe(false);
    expect(isRoomPath('/about/')).toBe(false);
  });

  it('appends Vary: Accept without duplicating', () => {
    const headers = new Headers({ Vary: 'Accept-Encoding' });
    appendVaryAccept(headers);
    expect(headers.get('Vary')).toBe('Accept-Encoding, Accept');
    appendVaryAccept(headers);
    expect(headers.get('Vary')).toBe('Accept-Encoding, Accept');
  });
});

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

describe('agent-facing published content', () => {
  const root = join(process.cwd());

  it('ships homepage HTML with 500+ characters of meaningful body text and a clear H1', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).toMatch(/<h1[\s\S]*?Piss[\s\S]*?Poker[\s\S]*?tracker/i);
    expect(html).toMatch(/"@type": "Organization"/);
    expect(html).toMatch(/"contactPoint"/);
    expect(html).toMatch(/"PostalAddress"/);
    expect(visibleText(html).length).toBeGreaterThanOrEqual(500);
  });

  it('ships trust pages with 500+ characters each', () => {
    for (const page of ['about', 'contact', 'privacy']) {
      const html = readFileSync(join(root, 'public', page, 'index.html'), 'utf8');
      expect(visibleText(html).length).toBeGreaterThanOrEqual(500);
      const md = readFileSync(join(root, 'public', page, 'index.md'), 'utf8');
      expect(md.length).toBeGreaterThanOrEqual(500);
    }
  });

  it('ships llms.txt with when-to-use guidance', () => {
    const llms = readFileSync(join(root, 'public/llms.txt'), 'utf8');
    expect(llms.startsWith('# Piss Poker')).toBe(true);
    expect(llms).toMatch(/## When to use this/i);
    expect(llms).toMatch(/Best fit:/i);
    expect(llms).toMatch(/Not a fit:/i);
    expect(llms).toMatch(/How to call it:/i);
  });

  it('ships a markdown 404 body long enough for agents', () => {
    const md = readFileSync(join(root, 'public/404.md'), 'utf8');
    expect(md.length).toBeGreaterThanOrEqual(20);
    expect(md).toMatch(/llms\.txt/);
    expect(NOT_FOUND_MARKDOWN.length).toBeGreaterThanOrEqual(20);
  });

  it('keeps markdown mirrors next to every public HTML page', () => {
    const htmlPages = walk(join(root, 'public')).filter((p) => p.endsWith('.html') && !p.endsWith('404.html'));
    for (const html of htmlPages) {
      const md = html.replace(/\.html$/, '.md');
      expect(readFileSync(md, 'utf8').trim().length).toBeGreaterThan(0);
    }
    expect(readFileSync(join(root, 'public/index.md'), 'utf8')).toMatch(/Piss Poker tracker/);
  });
});
