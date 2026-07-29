import type { Grussnachricht } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';

export interface GrussnachrichtDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Grussnachricht;
}

export function GrussnachrichtDetails({
  record,
}: GrussnachrichtDetailsProps) {
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Vorname" value={record.fields.vorname} format="text" />
        <RecordField label="Nachname" value={record.fields.nachname} format="text" />
        <RecordField label="Nachricht" value={record.fields.nachricht} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.GRUSSNACHRICHT} recordId={record.record_id} />
    </>
  );
}
