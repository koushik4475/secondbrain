import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('Markdown link sanitization', () => {
  it('removes executable javascript hrefs', () => {
    const rendered = renderMarkdown('[unsafe](javascript:alert(1))');
    expect(rendered).not.toMatch(/href\\s*=\\s*["']?javascript:/i);
  });
  it('retains safe HTTPS links', () => {
    const rendered = renderMarkdown('[docs](https://example.com/docs)');
    expect(rendered).toContain('href="https://example.com/docs"');
  });
});
