import { Button, Group, Modal, Text } from '@mantine/core';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  opened: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** A small yes/no dialog; the confirm button has focus so Enter confirms. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { opened, title, children, confirmLabel, danger, onConfirm, onClose } = props;
  return (
    <Modal opened={opened} onClose={onClose} title={title} size="sm">
      <Text size="sm" component="div">
        {children}
      </Text>
      <Group justify="flex-end" mt="md" gap="xs">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          {...(danger ? { color: 'red' } : {})}
          data-autofocus
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
