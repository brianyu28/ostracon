import { describe, expect, it } from 'vitest';
import { markdownText, parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
  it('reads emphasis, code and links', () => {
    expect(parseInline('a **b** *c* ~~d~~ `e`')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'strong', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'c' }] },
      { type: 'text', text: ' ' },
      { type: 'strike', children: [{ type: 'text', text: 'd' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'e' },
    ]);
    expect(parseInline('[site](https://example.com) and https://a.org/x.')).toEqual([
      { type: 'link', href: 'https://example.com', children: [{ type: 'text', text: 'site' }] },
      { type: 'text', text: ' and ' },
      {
        type: 'link',
        href: 'https://a.org/x',
        children: [{ type: 'text', text: 'https://a.org/x' }],
      },
      { type: 'text', text: '.' },
    ]);
  });

  it('leaves unsafe links and unmatched markers as text', () => {
    expect(parseInline('[x](javascript:alert(1))')).toEqual([
      { type: 'text', text: '[x](javascript:alert(1))' },
    ]);
    expect(parseInline('2 * 3 * 4 and snake_case_name')).toEqual([
      { type: 'text', text: '2 * 3 * 4 and snake_case_name' },
    ]);
    expect(parseInline('_em_ here')[0]).toEqual({
      type: 'em',
      children: [{ type: 'text', text: 'em' }],
    });
    expect(parseInline('\\*not em\\*')).toEqual([{ type: 'text', text: '*not em*' }]);
  });
});

describe('parseMarkdown', () => {
  it('reads blocks', () => {
    const blocks = parseMarkdown(
      '# Title\n\nLine one\nline two\n\n- a\n- b\n\n1. x\n2. y\n\n> quoted\n\n---\n\n```\ncode\n```',
    );
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'quote',
      'rule',
      'code',
    ]);
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'text', text: 'Line one' },
        { type: 'break' },
        { type: 'text', text: 'line two' },
      ],
    });
    expect(blocks[3]).toMatchObject({ type: 'list', ordered: true, start: 1 });
  });

  it('gives plain text', () => {
    expect(markdownText('## Notes\n\n**Great** pasta\n\n- one\n- two')).toBe(
      'Notes Great pasta one · two',
    );
  });
});
