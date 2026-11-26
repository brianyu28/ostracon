import { Button, Popover, SegmentedControl, Textarea } from '@mantine/core';
import { clsx } from 'clsx';
import { useState } from 'react';
import { Markdown } from '@/components/Markdown/Markdown';
import { markdownText } from '@/lib/markdown';
import { useEditorSession } from './useEditorSession';
import type { EditorChange, EditorProps } from './types';
import styles from './Editors.module.scss';

/** Rich text: a Markdown text area with a preview. ⌘Enter saves, Esc cancels. */
export function RichTextEditor(props: EditorProps) {
  const { field, value, initial, variant, onCommit, onCancel } = props;
  const original = typeof value === 'string' ? value : '';
  const [text, setText] = useState(initial ?? original);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const change: EditorChange | null =
    text.trimEnd() === original ? null : { kind: 'value', value: text };
  const session = useEditorSession(change, onCommit, onCancel, props.saveOnClose);
  return (
    <Popover
      opened
      position="bottom-start"
      offset={2}
      withinPortal
      trapFocus={false}
      shadow="md"
      closeOnEscape={false}
      onDismiss={() => {
        // A click outside saves, like Enter.
        session.commit(change);
      }}
    >
      <Popover.Target>
        <div className={clsx(styles.anchor, variant === 'cell' && styles.cellAnchor)}>
          {markdownText(text)}
        </div>
      </Popover.Target>
      <Popover.Dropdown className={clsx(styles.dropdown, styles.richDropdown)}>
        <SegmentedControl
          size="xs"
          value={tab}
          data={[
            { value: 'write', label: 'Write' },
            { value: 'preview', label: 'Preview' },
          ]}
          onChange={(v) => {
            setTab(v);
          }}
        />
        {tab === 'write' ? (
          <Textarea
            autosize
            minRows={6}
            maxRows={18}
            value={text}
            autoFocus
            aria-label={field.name}
            classNames={{ input: styles.richInput }}
            onFocus={(e) => {
              const el = e.currentTarget;
              el.setSelectionRange(el.value.length, el.value.length);
            }}
            onChange={(e) => {
              setText(e.currentTarget.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                session.cancel();
              } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                session.commit(change);
              }
            }}
          />
        ) : (
          <div className={styles.richPreview}>
            {text.trim() ? (
              <Markdown text={text} />
            ) : (
              <span className={styles.empty}>Nothing yet</span>
            )}
          </div>
        )}
        <div className={styles.formActions}>
          <span className={styles.hint}>**bold** *italic* - list [link](https://…)</span>
          <Button
            size="xs"
            variant="default"
            onClick={() => {
              session.cancel();
            }}
          >
            Cancel
          </Button>
          <Button
            size="xs"
            onClick={() => {
              session.commit(change);
            }}
          >
            Save
          </Button>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
