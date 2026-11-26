import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  ExternalLink,
  Eye,
  Globe,
  Loader2,
  Monitor,
  Pin,
  Plus,
  RefreshCw,
  Smartphone,
  Square,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import {
  ideApi,
  type LivePortInfo,
  type NoteChecklistItem,
  type NoteItem,
} from '../../lib/ideApi';
import { cn, formatRelativeTime } from '../../lib/utils';
import type { Project } from '../../types/api';

interface NotesAndPortsPaneProps {
  project: Project;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

function makeChecklistId(): string {
  return `chk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function NotesAndPortsPane({
  project,
  onNotify,
}: NotesAndPortsPaneProps) {
  const [ports, setPorts] = useState<LivePortInfo[]>([]);
  const [scanningPorts, setScanningPorts] = useState(false);
  const [previewPort, setPreviewPort] = useState<LivePortInfo | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>(
    'mobile'
  );
  const [iframeTick, setIframeTick] = useState(0);

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTodoText, setNewTodoText] = useState('');
  const [draftChecklist, setDraftChecklist] = useState<NoteChecklistItem[]>([]);
  const [linkToProject, setLinkToProject] = useState(true);
  const [savingNote, setSavingNote] = useState(false);

  const [inlineTodoDrafts, setInlineTodoDrafts] = useState<
    Record<string, string>
  >({});

  const scanPorts = useCallback(async () => {
    setScanningPorts(true);
    try {
      const list = await ideApi.scanLivePorts();
      setPorts(list);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể quét cổng đang mở',
        'error'
      );
    } finally {
      setScanningPorts(false);
    }
  }, [onNotify]);

  const loadNotes = useCallback(async () => {
    setLoadingNotes(true);
    try {
      const list = await ideApi.listNotes();
      setNotes(list);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể tải ghi chú',
        'error'
      );
    } finally {
      setLoadingNotes(false);
    }
  }, [onNotify]);

  useEffect(() => {
    scanPorts();
    loadNotes();
  }, [scanPorts, loadNotes]);

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.updated_at || '').localeCompare(a.updated_at || '');
    });
  }, [notes]);

  const handleAddDraftTodo = () => {
    const clean = newTodoText.trim();
    if (!clean) return;
    setDraftChecklist((prev) => [
      ...prev,
      { id: makeChecklistId(), text: clean, done: false },
    ]);
    setNewTodoText('');
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() && !newContent.trim() && draftChecklist.length === 0) {
      onNotify('Vui lòng nhập tiêu đề, nội dung hoặc việc cần làm', 'error');
      return;
    }
    setSavingNote(true);
    try {
      const created = await ideApi.createNote({
        title: newTitle.trim() || 'Ghi chú nhanh',
        content: newContent.trim(),
        pinned: false,
        checklist: draftChecklist,
        project_id: linkToProject ? project.id : null,
      });
      setNotes((prev) => [created, ...prev]);
      setNewTitle('');
      setNewContent('');
      setDraftChecklist([]);
      onNotify('Đã thêm ghi chú mới', 'success');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể lưu ghi chú',
        'error'
      );
    } finally {
      setSavingNote(false);
    }
  };

  const updateNoteOnServer = async (
    note: NoteItem,
    patch: Partial<NoteItem>
  ) => {
    const updatedPayload = {
      title: patch.title ?? note.title,
      content: patch.content ?? note.content,
      pinned: patch.pinned ?? note.pinned,
      checklist: patch.checklist ?? note.checklist,
      project_id: patch.project_id !== undefined ? patch.project_id : note.project_id,
    };
    try {
      const saved = await ideApi.updateNote(note.id, updatedPayload);
      setNotes((prev) => prev.map((n) => (n.id === note.id ? saved : n)));
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể cập nhật ghi chú',
        'error'
      );
    }
  };

  const handleToggleChecklistItem = (note: NoteItem, itemId: string) => {
    const nextList = note.checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    updateNoteOnServer(note, { checklist: nextList });
  };

  const handleDeleteChecklistItem = (note: NoteItem, itemId: string) => {
    const nextList = note.checklist.filter((item) => item.id !== itemId);
    updateNoteOnServer(note, { checklist: nextList });
  };

  const handleAddChecklistItem = (note: NoteItem) => {
    const text = (inlineTodoDrafts[note.id] || '').trim();
    if (!text) return;
    const nextList = [
      ...note.checklist,
      { id: makeChecklistId(), text, done: false },
    ];
    setInlineTodoDrafts((prev) => ({ ...prev, [note.id]: '' }));
    updateNoteOnServer(note, { checklist: nextList });
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await ideApi.deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      onNotify('Đã xóa ghi chú', 'info');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể xóa ghi chú',
        'error'
      );
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
      {/* Notes & To-Do Checklist */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Ghi chú &amp; Danh sách To-Do
            </h3>
          </div>
          <button
            type="button"
            onClick={loadNotes}
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Làm mới ghi chú"
          >
            <RefreshCw className={cn('h-4 w-4', loadingNotes && 'animate-spin')} />
          </button>
        </div>

        {/* Create Note Form */}
        <form
          onSubmit={handleCreateNote}
          className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-[#090d16]"
        >
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Tiêu đề ghi chú..."
            className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
          />
          <textarea
            rows={2}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Nội dung ghi chú nhanh..."
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
          />

          {/* Draft Checklist Items */}
          {draftChecklist.length > 0 && (
            <div className="space-y-1">
              {draftChecklist.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs dark:bg-[#111827]"
                >
                  <span className="truncate">{item.text}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftChecklist((prev) =>
                        prev.filter((x) => x.id !== item.id)
                      )
                    }
                    className="text-slate-400 hover:text-rose-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <input
              type="text"
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddDraftTodo();
                }
              }}
              placeholder="+ Thêm mục việc cần làm..."
              className="min-h-[38px] min-w-[160px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
            />
            <button
              type="button"
              onClick={handleAddDraftTodo}
              className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Thêm mục
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={linkToProject}
                onChange={(e) => setLinkToProject(e.target.checked)}
                className="accent-cyan-500"
              />
              Gắn với dự án {project.name}
            </label>
            <button
              type="submit"
              disabled={savingNote}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-4 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {savingNote ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Lưu ghi chú
            </button>
          </div>
        </form>

        {/* Notes List */}
        {sortedNotes.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Chưa có ghi chú nào.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedNotes.map((note) => (
              <article
                key={note.id}
                className={cn(
                  'rounded-xl border p-3.5 transition',
                  note.pinned
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-slate-200/80 bg-slate-50/40 dark:border-slate-800 dark:bg-[#0d1322]'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                        {note.title}
                      </h4>
                      {note.project_id === project.id && (
                        <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700 dark:text-cyan-300">
                          {project.name}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Cập nhật {formatRelativeTime(note.updated_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        updateNoteOnServer(note, { pinned: !note.pinned })
                      }
                      className={cn(
                        'inline-flex h-8 w-8 items-center justify-center rounded-lg transition',
                        note.pinned
                          ? 'bg-amber-500/20 text-amber-500'
                          : 'text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                      )}
                      title={note.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-500"
                      title="Xóa ghi chú"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {note.content && (
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {note.content}
                  </p>
                )}

                {/* Interactive Checklist */}
                <div className="mt-2.5 space-y-1.5">
                  {note.checklist.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white/80 px-2.5 py-1.5 dark:bg-[#111827]"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleChecklistItem(note, item.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {item.done ? (
                          <CheckSquare className="h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <Square className="h-4 w-4 shrink-0 text-slate-400" />
                        )}
                        <span
                          className={cn(
                            'truncate text-xs',
                            item.done
                              ? 'text-slate-400 line-through'
                              : 'text-slate-800 dark:text-slate-200'
                          )}
                        >
                          {item.text}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteChecklistItem(note, item.id)}
                        className="text-slate-400 hover:text-rose-500"
                        title="Xóa mục"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  <div className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      value={inlineTodoDrafts[note.id] || ''}
                      onChange={(e) =>
                        setInlineTodoDrafts((prev) => ({
                          ...prev,
                          [note.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddChecklistItem(note);
                        }
                      }}
                      placeholder="+ Thêm việc cần làm..."
                      className="min-h-[34px] min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddChecklistItem(note)}
                      className="min-h-[34px] rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Live Dev Server Ports Scanner */}
      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Globe className="h-4 w-4 shrink-0 text-emerald-500" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Cổng Dev Server đang chạy
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Quét các cổng phổ biến trên localhost PC để xem trước nhanh
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={scanningPorts}
            onClick={scanPorts}
            className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', scanningPorts && 'animate-spin')}
            />
            <span>Quét lại</span>
          </button>
        </div>

        {scanningPorts && ports.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Đang quét các cổng trên PC...
          </div>
        ) : ports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Không phát hiện cổng dev server nào đang lắng nghe trên PC.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70 rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
            {ports.map((p) => (
              <div
                key={p.port}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <span className="shrink-0 font-mono text-xs font-bold text-slate-900 dark:text-white">
                      :{p.port}
                    </span>
                    <span className="max-w-full truncate whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {p.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {p.url}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewPort(p);
                      setIframeTick((t) => t + 1);
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/25 dark:text-cyan-300"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Xem trước
                  </button>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    title="Mở trong tab mới"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Live Preview Modal with Mobile / Desktop Toggle */}
      {previewPort && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#0b101b] shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">
                  Xem trước cổng :{previewPort.port} ({previewPort.label})
                </p>
                <p className="truncate font-mono text-[11px] text-slate-400">
                  {previewPort.url}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={cn(
                    'inline-flex min-h-[36px] items-center gap-1 rounded-xl px-2.5 text-xs font-semibold transition',
                    previewDevice === 'mobile'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Mobile
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={cn(
                    'inline-flex min-h-[36px] items-center gap-1 rounded-xl px-2.5 text-xs font-semibold transition',
                    previewDevice === 'desktop'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                  )}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setIframeTick((t) => t + 1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800"
                  title="Tải lại"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewPort(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800"
                  title="Đóng"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center overflow-auto bg-[#060911] p-3">
              <div
                className={cn(
                  'h-full overflow-hidden rounded-xl border border-slate-700 bg-white shadow-xl transition-all',
                  previewDevice === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
                )}
              >
                <iframe
                  key={`${previewPort.url}-${iframeTick}`}
                  src={previewPort.url}
                  title={`Live preview ${previewPort.port}`}
                  className="h-full w-full border-0 bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
