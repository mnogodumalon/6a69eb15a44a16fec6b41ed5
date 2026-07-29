import { useDashboardData } from '@/hooks/useDashboardData';
import type { Grussnachricht } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { useState, useCallback, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatCard, StatCardRow } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import {
  RecordOverlay,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { GrussnachrichtDetails } from '@/components/details/GrussnachrichtDetails';
import { GrussnachrichtDialog } from '@/components/dialogs/GrussnachrichtDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { formatDate } from '@/lib/formatters';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconAlertCircle, IconTool, IconRefresh, IconCheck,
  IconPlus, IconMail, IconTrash, IconPencil, IconUsers,
} from '@tabler/icons-react';

const APPGROUP_ID = '6a69eb15a44a16fec6b41ed5';
const REPAIR_ENDPOINT = '/claude/build/repair';

export default function DashboardOverview() {
  const {
    grussnachricht,
    setGrussnachricht,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<Grussnachricht>();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Grussnachricht | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Grussnachricht | null>(null);
  const [filter, setFilter] = useState<'all' | 'recent'>('all');

  // ALL hooks before early returns
  const recentIds = useMemo(() => {
    const cutoff = new Date(clock);
    cutoff.setDate(cutoff.getDate() - 7);
    return new Set(
      grussnachricht
        .filter(r => new Date(r.createdat) >= cutoff)
        .map(r => r.record_id)
    );
  }, [grussnachricht, clock]);

  const filtered = useMemo(() => {
    if (filter === 'recent') return grussnachricht.filter(r => recentIds.has(r.record_id));
    return grussnachricht;
  }, [grussnachricht, filter, recentIds]);

  const handleCreate = useCallback(async (fields: Grussnachricht['fields']) => {
    await LivingAppsService.createGrussnachrichtEntry(fields);
    fetchAll();
    undoToast(`Nachricht von ${fields.vorname ?? ''} ${fields.nachname ?? ''} gespeichert`);
  }, [fetchAll]);

  const handleEdit = useCallback(async (fields: Grussnachricht['fields']) => {
    if (!editRecord) return;
    const snapshot = editRecord;
    setGrussnachricht(prev => prev.map(r => r.record_id === snapshot.record_id ? { ...r, fields: { ...r.fields, ...fields } } : r));
    setEditRecord(null);
    try {
      await LivingAppsService.updateGrussnachrichtEntry(snapshot.record_id, fields);
      undoToast('Nachricht aktualisiert', async () => {
        setGrussnachricht(prev => prev.map(r => r.record_id === snapshot.record_id ? snapshot : r));
        await LivingAppsService.updateGrussnachrichtEntry(snapshot.record_id, snapshot.fields);
      });
    } catch {
      fetchAll();
    }
  }, [editRecord, setGrussnachricht, fetchAll]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const snapshot = deleteTarget;
    setGrussnachricht(prev => prev.filter(r => r.record_id !== snapshot.record_id));
    setDeleteTarget(null);
    try {
      await LivingAppsService.deleteGrussnachrichtEntry(snapshot.record_id);
      undoToast('Nachricht gelöscht', async () => {
        await fetchAll();
      });
    } catch {
      fetchAll();
    }
  }, [deleteTarget, setGrussnachricht, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const total = grussnachricht.length;
  const recentCount = recentIds.size;
  const latestNames = grussnachricht
    .slice()
    .sort((a, b) => (b.createdat ?? '').localeCompare(a.createdat ?? ''))
    .slice(0, 3)
    .map(r => `${r.fields.vorname ?? ''} ${r.fields.nachname ?? ''}`.trim())
    .filter(Boolean);

  const contextLine = total === 0
    ? 'Noch keine Nachrichten eingegangen — starte das Gästebuch!'
    : latestNames.length > 0
      ? `Zuletzt ${namen(latestNames)} ${recentCount > 0 ? `— ${recentCount} neu diese Woche` : ''}`
      : 'Alle Nachrichten im Überblick';

  const overlayRecord = overlay.top;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{contextLine}</p>
        </div>
        <Button
          onClick={() => { setEditRecord(null); setDialogOpen(true); }}
          className="shrink-0 gap-1.5"
        >
          <IconPlus size={16} className="shrink-0" />
          Neue Nachricht
        </Button>
      </div>

      <DashboardGrid
        variant="split"
        kpis={
          <StatCardRow>
            <StatCard
              title="Alle Einträge"
              value={total}
              description={filter === 'recent' ? 'Filter aktiv — alle anzeigen' : 'Vollständiges Gästebuch'}
              icon={<IconMail size={18} className="text-muted-foreground" />}
              tone="default"
              onClick={() => setFilter('all')}
              active={filter === 'all'}
            />
            <StatCard
              title="Diese Woche neu"
              value={recentCount}
              description={recentCount > 0 ? 'In den letzten 7 Tagen' : 'Noch keine neue diese Woche'}
              icon={<IconUsers size={18} className="text-muted-foreground" />}
              tone={recentCount > 0 ? 'success' : 'default'}
              onClick={() => setFilter(f => f === 'recent' ? 'all' : 'recent')}
              active={filter === 'recent'}
            />
          </StatCardRow>
        }
        aside={
          <WorkList
            title="Neueste Nachrichten"
            icon={<IconMail size={14} />}
            items={grussnachricht
              .slice()
              .sort((a, b) => (b.createdat ?? '').localeCompare(a.createdat ?? ''))
              .slice(0, 8)
              .map(r => ({
                id: r.record_id,
                title: `${r.fields.vorname ?? ''} ${r.fields.nachname ?? ''}`.trim() || '—',
                secondLine: (
                  <span className="text-muted-foreground">{formatDate(r.createdat)}</span>
                ),
                action: {
                  label: <IconPencil size={13} />,
                  onClick: () => { setEditRecord(r); setDialogOpen(true); },
                },
              }))}
            onItemClick={id => {
              const rec = grussnachricht.find(r => r.record_id === id);
              if (rec) overlay.replace(rec);
            }}
            empty={{
              text: 'Noch keine Grußnachrichten vorhanden.',
              action: { label: 'Erste Nachricht schreiben', onClick: () => { setEditRecord(null); setDialogOpen(true); } },
            }}
            max={8}
          />
        }
        primary={
          total === 0 ? (
            <EmptyState onOpen={() => { setEditRecord(null); setDialogOpen(true); }} />
          ) : (
            <GruessbuchGalerie
              records={filtered}
              onOpen={r => overlay.replace(r)}
              onEdit={r => { setEditRecord(r); setDialogOpen(true); }}
              onDelete={r => setDeleteTarget(r)}
            />
          )
        }
      />

      {/* Record overlay */}
      <RecordOverlay
        open={overlay.open}
        onClose={overlay.close}
        onEdit={() => {
          if (overlayRecord) {
            setEditRecord(overlayRecord);
            setDialogOpen(true);
            overlay.close();
          }
        }}
        editLabel="Bearbeiten"
      >
        {overlayRecord && (
          <>
            <RecordHeader
              title={`${overlayRecord.fields.vorname ?? ''} ${overlayRecord.fields.nachname ?? ''}`.trim() || 'Nachricht'}
              subtitle={formatDate(overlayRecord.createdat)}
            />
            <GrussnachrichtDetails record={overlayRecord} />
          </>
        )}
      </RecordOverlay>

      {/* Create / Edit dialog */}
      <GrussnachrichtDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditRecord(null); }}
        onSubmit={editRecord ? handleEdit : handleCreate}
        defaultValues={editRecord?.fields}
        recordId={editRecord?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Grussnachricht']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Grussnachricht']}
      />

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Nachricht löschen"
        description={`Soll die Nachricht von ${deleteTarget?.fields.vorname ?? ''} ${deleteTarget?.fields.nachname ?? ''} wirklich gelöscht werden?`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── Gästebuch-Galerie ───────────────────────────────────────────────────────

function GruessbuchGalerie({
  records,
  onOpen,
  onEdit,
  onDelete,
}: {
  records: Grussnachricht[];
  onOpen: (r: Grussnachricht) => void;
  onEdit: (r: Grussnachricht) => void;
  onDelete: (r: Grussnachricht) => void;
}) {
  const sorted = [...records].sort((a, b) => (b.createdat ?? '').localeCompare(a.createdat ?? ''));

  return (
    <div className="rounded-[27px] bg-card shadow-lg p-5 overflow-hidden">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Gästebuch — {records.length} {records.length === 1 ? 'Eintrag' : 'Einträge'}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {sorted.map(r => (
          <NachrichtKarte
            key={r.record_id}
            record={r}
            onOpen={onOpen}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function NachrichtKarte({
  record,
  onOpen,
  onEdit,
  onDelete,
}: {
  record: Grussnachricht;
  onOpen: (r: Grussnachricht) => void;
  onEdit: (r: Grussnachricht) => void;
  onDelete: (r: Grussnachricht) => void;
}) {
  const fullName = `${record.fields.vorname ?? ''} ${record.fields.nachname ?? ''}`.trim() || '—';
  const initials = [record.fields.vorname, record.fields.nachname]
    .filter(Boolean)
    .map(s => s![0].toUpperCase())
    .join('');

  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 text-left hover:bg-muted/40 hover:border-primary/30 transition-all"
    >
      {/* Avatar + Name + Datum */}
      <div className="flex items-center gap-3 min-w-0">
        <span
          aria-hidden
          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary text-sm font-semibold"
        >
          {initials || '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{fullName}</p>
          <p className="text-xs text-muted-foreground">{formatDate(record.createdat)}</p>
        </div>
      </div>

      {/* Nachricht */}
      {record.fields.nachricht ? (
        <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
          &ldquo;{record.fields.nachricht}&rdquo;
        </p>
      ) : (
        <p className="text-sm text-muted-foreground/50 italic">Keine Nachricht hinterlassen</p>
      )}

      {/* Aktionen */}
      <div className="flex gap-2 justify-end mt-auto pt-1">
        <span
          role="button"
          tabIndex={0}
          onClick={e => { e.stopPropagation(); onEdit(record); }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onEdit(record);
            }
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <IconPencil size={12} className="shrink-0" />
          Bearbeiten
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={e => { e.stopPropagation(); onDelete(record); }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onDelete(record);
            }
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
        >
          <IconTrash size={12} className="shrink-0" />
          Löschen
        </span>
      </div>
    </button>
  );
}

// ─── Leerzustand ─────────────────────────────────────────────────────────────

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="rounded-[27px] bg-card shadow-lg p-10 flex flex-col items-center justify-center text-center gap-5 min-h-[320px]">
      <IconMail size={48} className="text-muted-foreground" stroke={1.5} />
      <div>
        <h2 className="font-semibold text-foreground text-lg">Dein Gästebuch wartet</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Noch keine Grußnachrichten vorhanden. Trag die erste Nachricht ein und begrüße deine Besucher!
        </p>
      </div>
      <Button onClick={onOpen} className="gap-1.5">
        <IconPlus size={16} className="shrink-0" />
        Erste Nachricht schreiben
      </Button>
    </div>
  );
}

// ─── Skeleton & Error ─────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) {
        setRepairing(false);
        setRepairFailed(true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          }
          if (content.startsWith('[DONE]')) {
            setRepairDone(true);
            setRepairing(false);
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            setRepairFailed(true);
          }
        }
      }
    } catch {
      setRepairing(false);
      setRepairFailed(true);
    }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte lade die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktiere den Support.</p>}
    </div>
  );
}
