import React from 'react';
import ConfirmSheet from '../common/ConfirmSheet';
import StatusBadge from '../common/StatusBadge';

export default function ExportDatabaseSheet({ visible, onExport, onCancel }) {
  return (
    <ConfirmSheet
      visible={visible}
      title="Export database"
      titleAccessory={<StatusBadge label="Sensitive" tone="warning" />}
      body="This will export all local data including sensitive information. Only share with Masi support staff."
      confirmLabel="Export"
      confirmVariant="destructive"
      cancelLabel="Cancel"
      onConfirm={onExport}
      onCancel={onCancel}
    />
  );
}
