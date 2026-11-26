import { clsx } from 'clsx';
import { Fragment, useMemo, type ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from '@/lib/markdown';
import styles from './Markdown.module.scss';

function renderInline(nodes: readonly Inline[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={i}>{node.text}</Fragment>;
      case 'break':
        return <br key={i} />;
      case 'code':
        return <code key={i}>{node.text}</code>;
      case 'strong':
        return <strong key={i}>{renderInline(node.children)}</strong>;
      case 'em':
        return <em key={i}>{renderInline(node.children)}</em>;
      case 'strike':
        return <s key={i}>{renderInline(node.children)}</s>;
      case 'link':
        return (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer">
            {renderInline(node.children)}
          </a>
        );
      default:
        return null;
    }
  });
}

function renderBlock(block: Block, i: number): ReactNode {
  switch (block.type) {
    case 'paragraph':
      return <p key={i}>{renderInline(block.children)}</p>;
    case 'heading': {
      const Tag = (['h3', 'h4', 'h5'] as const)[block.level - 1] ?? 'h5';
      return <Tag key={i}>{renderInline(block.children)}</Tag>;
    }
    case 'list': {
      const items = block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>);
      return block.ordered ? (
        <ol key={i} start={block.start}>
          {items}
        </ol>
      ) : (
        <ul key={i}>{items}</ul>
      );
    }
    case 'quote':
      return <blockquote key={i}>{renderInline(block.children)}</blockquote>;
    case 'code':
      return (
        <pre key={i}>
          <code>{block.text}</code>
        </pre>
      );
    case 'rule':
      return <hr key={i} />;
    default:
      return null;
  }
}

/** Rich text (the Markdown subset in `lib/markdown`) rendered as React elements. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className={clsx(styles.root, className)}>{blocks.map(renderBlock)}</div>;
}
