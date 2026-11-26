import { ActionIcon } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { uiStore } from '@/store/uiStore';
import { useRoute } from 'wouter';
import { FileMenu } from '@/app/file/FileMenu';
import { useDocStore } from '@/store/docStore';
import styles from './TopBar.module.scss';

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  // Collection screens are titled with the collection's name.
  const [, params] = useRoute<{ collectionId: string }>('/c/:collectionId/*?');
  const collectionName = useDocStore((s) =>
    params ? s.doc?.collections[params.collectionId]?.name : undefined,
  );
  return (
    <header className={styles.root}>
      <h1 className={styles.title}>{collectionName ?? title}</h1>
      <div className={styles.right}>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Search records"
          title="Search (⌘P)"
          onClick={() => {
            uiStore.setState({ searchOpen: true });
          }}
        >
          <IconSearch size={16} />
        </ActionIcon>
        <FileMenu />
      </div>
    </header>
  );
}
