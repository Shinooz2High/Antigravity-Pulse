import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileCode2,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  WrapText,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { ideApi, IdeApiError } from '../../lib/ideApi';
import { cn, formatBytes, formatRelativeTime } from '../../lib/utils';
import { BreadcrumbPath } from '../library';
import type {
  ArtifactCategory,
  ArtifactModalTarget,
  FileEntry,
  Project,
  TabKey,
} from '../../types/api';

interface EditorTab {
  relPath: string;
  name: string;
  category: ArtifactCategory;
  mimeType: string;
  size: number;
  content: string;
  savedContent: string;
  modifiedAt: string;
  isBinary: boolean;
  entry?: FileEntry;
}

interface ConflictState {
  relPath: string;
  pendingContent: string;
}

interface FsModalState {
  kind: 'new_file' | 'new_folder' | 'rename' | 'delete';
  entry?: FileEntry;
  value: string;
}

interface CodeEditorPaneProps {
  project: Project;
  workspaceRefreshTick: number;
  onNavigate: (tab: TabKey) => void;
  onOpenArtifact: (target: ArtifactModalTarget) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

function joinRelPath(base: string, name: string): string {
  const cleanBase = base.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const cleanName = name.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!cleanBase) return cleanName;
  if (!cleanName) return cleanBase;
  return `${cleanBase}/${cleanName}`;
}

function getParentRelPath(relPath: string): string {
  const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

export function CodeEditorPane({
  project,
  workspaceRefreshTick,
  onNavigate,
  onOpenArtifact,
  onNotify,
}: CodeEditorPaneProps) {
  const [relPath, setRelPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileQuery, setFileQuery] = useState('');

  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeRelPath, setActiveRelPath] = useState<string | null>(null);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [savingPath, setSavingPath] = useState<string | null>(null);

  const [wordWrap, setWordWrap] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findIdx, setFindIdx] = useState(0);

  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [fsModal, setFsModal] = useState<FsModalState | null>(null);
  const [fsBusy, setFsBusy] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const editorSectionRef = useRef<HTMLDivElement>(null);

  const loadFiles = useCallback(
    async (projId: string, path: string) => {
      setLoadingFiles(true);
      setFileError(null);
      try {
        const res = await api.getProjectFiles(projId, path);
        setRelPath(res.current_path || '');
        setEntries(res.entries || []);
      } catch (err) {
        setFileError(
          err instanceof Error ? err.message : 'Không thể đọc thư mục dự án'
        );
        setEntries([]);
      } finally {
        setLoadingFiles(false);
      }
    },
    []
  );

  // Reset browser & open tabs when switching project
  useEffect(() => {
    setRelPath('');
    setTabs([]);
    setActiveRelPath(null);
    setConflict(null);
    setFindOpen(false);
    setFindQuery('');
    loadFiles(project.id, '');
  }, [project.id, loadFiles]);

  // Refresh current folder on workspace.changed
  useEffect(() => {
    if (workspaceRefreshTick > 0) {
      loadFiles(project.id, relPath);
    }
  }, [workspaceRefreshTick, project.id, relPath, loadFiles]);

  const filteredEntries = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, fileQuery]);

  const activeTab = useMemo(
    () => tabs.find((t) => t.relPath === activeRelPath) || null,
    [tabs, activeRelPath]
  );

  const isDirty = (tab: EditorTab) =>
    !tab.isBinary && tab.content !== tab.savedContent;

  const lineNumbers = useMemo(() => {
    if (!activeTab || activeTab.isBinary) return [];
    const count = activeTab.content.split('\n').length;
    return Array.from({ length: Math.max(1, count) }, (_, i) => i + 1);
  }, [activeTab]);

  // Find matches in active tab
  const findMatches = useMemo(() => {
    if (!findOpen || !findQuery || !activeTab || activeTab.isBinary) return [];
    const haystack = activeTab.content.toLowerCase();
    const needle = findQuery.toLowerCase();
    const positions: number[] = [];
    let pos = 0;
    while (needle.length > 0) {
      const found = haystack.indexOf(needle, pos);
      if (found === -1) break;
      positions.push(found);
      pos = found + Math.max(1, needle.length);
      if (positions.length >= 500) break;
    }
    return positions;
  }, [findOpen, findQuery, activeTab]);

  useEffect(() => {
    setFindIdx(0);
  }, [findQuery, activeRelPath]);

  const jumpToMatch = (idx: number) => {
    if (!findMatches.length || !textareaRef.current) return;
    const normalized =
      ((idx % findMatches.length) + findMatches.length) % findMatches.length;
    setFindIdx(normalized);
    const start = findMatches[normalized];
    const end = start + findQuery.length;
    const ta = textareaRef.current;
    ta.focus();
    ta.setSelectionRange(start, end);
    const linesBefore = ta.value.slice(0, start).split('\n').length - 1;
    ta.scrollTop = Math.max(0, linesBefore * 20 - 80);
  };

  const openFile = async (entry: FileEntry) => {
    const existing = tabs.find((t) => t.relPath === entry.rel_path);
    if (existing) {
      setActiveRelPath(existing.relPath);
      editorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    setOpeningPath(entry.rel_path);
    try {
      const data = await api.getProjectFileContent(project.id, entry.rel_path);
      const isBinary = data.text === null;
      const newTab: EditorTab = {
        relPath: data.rel_path,
        name: data.name,
        category: data.category,
        mimeType: data.mime_type,
        size: data.size,
        content: data.text ?? '',
        savedContent: data.text ?? '',
        modifiedAt: data.modified_at,
        isBinary,
        entry,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveRelPath(newTab.relPath);
      editorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể mở tệp',
        'error'
      );
    } finally {
      setOpeningPath(null);
    }
  };

  const reloadTabFromDisk = async (targetRelPath: string) => {
    setOpeningPath(targetRelPath);
    try {
      const data = await api.getProjectFileContent(project.id, targetRelPath);
      setTabs((prev) =>
        prev.map((t) =>
          t.relPath === targetRelPath
            ? {
                ...t,
                content: data.text ?? '',
                savedContent: data.text ?? '',
                modifiedAt: data.modified_at,
                size: data.size,
                isBinary: data.text === null,
              }
            : t
        )
      );
      setConflict(null);
      onNotify('Đã tải lại phiên bản mới nhất từ ổ đĩa', 'info');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể tải lại tệp',
        'error'
      );
    } finally {
      setOpeningPath(null);
    }
  };

  const saveTab = useCallback(
    async (tab: EditorTab, force = false) => {
      if (tab.isBinary) return;
      setSavingPath(tab.relPath);
      try {
        const res = await ideApi.saveFileContent(project.id, {
          path: tab.relPath,
          content: tab.content,
          expected_modified_at: force ? null : tab.modifiedAt,
          force,
        });
        setTabs((prev) =>
          prev.map((t) =>
            t.relPath === tab.relPath
              ? {
                  ...t,
                  savedContent: res.text ?? tab.content,
                  content: res.text ?? tab.content,
                  modifiedAt: res.modified_at,
                  size: res.size,
                }
              : t
          )
        );
        setConflict(null);
        onNotify(`Đã lưu ${tab.name}`, 'success');
      } catch (err) {
        if (err instanceof IdeApiError && err.status === 409) {
          setConflict({ relPath: tab.relPath, pendingContent: tab.content });
        } else {
          onNotify(
            err instanceof Error ? err.message : 'Lỗi khi lưu tệp',
            'error'
          );
        }
      } finally {
        setSavingPath(null);
      }
    },
    [project.id, onNotify]
  );

  const closeTab = (targetRelPath: string) => {
    const target = tabs.find((t) => t.relPath === targetRelPath);
    if (
      target &&
      isDirty(target) &&
      !window.confirm(`Tệp "${target.name}" có thay đổi chưa lưu. Vẫn đóng tab?`)
    ) {
      return;
    }
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.relPath === targetRelPath);
      const next = prev.filter((t) => t.relPath !== targetRelPath);
      if (activeRelPath === targetRelPath) {
        const fallback = next[Math.min(idx, next.length - 1)] || null;
        setActiveRelPath(fallback ? fallback.relPath : null);
      }
      return next;
    });
  };

  // Keyboard shortcuts inside editor (Ctrl+S, Ctrl+F)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!activeTab || activeTab.isBinary) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveTab(activeTab, false);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (document.activeElement === textareaRef.current) {
          e.preventDefault();
          setFindOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, saveTab]);

  const handleSendToChat = () => {
    if (!activeTab) return;
    let snippet = '';
    const ta = textareaRef.current;
    if (ta && ta.selectionStart !== ta.selectionEnd) {
      snippet = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    } else if (!activeTab.isBinary) {
      const lines = activeTab.content.split('\n').slice(0, 120);
      snippet = lines.join('\n').slice(0, 4000);
    }
    try {
      sessionStorage.setItem(
        'agy_ide_chat_context',
        JSON.stringify({
          projectId: project.id,
          relPath: activeTab.relPath,
          snippet,
        })
      );
      onNotify(`Đã đính kèm "${activeTab.relPath}" sang AI Chat`, 'success');
      onNavigate('prompt');
    } catch {
      onNotify('Không thể lưu ngữ cảnh sang sessionStorage', 'error');
    }
  };

  const handleFsConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fsModal) return;
    setFsBusy(true);
    try {
      if (fsModal.kind === 'new_file') {
        const cleanName = fsModal.value.trim();
        if (!cleanName) return;
        const targetPath = joinRelPath(relPath, cleanName);
        const created = await ideApi.saveFileContent(project.id, {
          path: targetPath,
          content: '',
          force: false,
        });
        onNotify(`Đã tạo tệp ${created.name}`, 'success');
        setFsModal(null);
        await loadFiles(project.id, relPath);
        const newTab: EditorTab = {
          relPath: created.rel_path,
          name: created.name,
          category: created.category,
          mimeType: created.mime_type,
          size: created.size,
          content: created.text ?? '',
          savedContent: created.text ?? '',
          modifiedAt: created.modified_at,
          isBinary: false,
        };
        setTabs((prev) => {
          const without = prev.filter((t) => t.relPath !== newTab.relPath);
          return [...without, newTab];
        });
        setActiveRelPath(newTab.relPath);
      } else if (fsModal.kind === 'new_folder') {
        const cleanName = fsModal.value.trim();
        if (!cleanName) return;
        const targetPath = joinRelPath(relPath, cleanName);
        await ideApi.mkdir(project.id, targetPath);
        onNotify(`Đã tạo thư mục ${cleanName}`, 'success');
        setFsModal(null);
        await loadFiles(project.id, relPath);
      } else if (fsModal.kind === 'rename' && fsModal.entry) {
        const newName = fsModal.value.trim();
        if (!newName) return;
        const parent = getParentRelPath(fsModal.entry.rel_path);
        const newPath = newName.includes('/') ? newName : joinRelPath(parent, newName);
        const res = await ideApi.renameEntry(
          project.id,
          fsModal.entry.rel_path,
          newPath
        );
        setTabs((prev) =>
          prev.map((t) =>
            t.relPath === res.old_path
              ? {
                  ...t,
                  relPath: res.new_path,
                  name: res.new_path.split('/').pop() || t.name,
                }
              : t
          )
        );
        if (activeRelPath === res.old_path) {
          setActiveRelPath(res.new_path);
        }
        onNotify(`Đã đổi tên thành ${res.new_path}`, 'success');
        setFsModal(null);
        await loadFiles(project.id, relPath);
      } else if (fsModal.kind === 'delete' && fsModal.entry) {
        const target = fsModal.entry;
        await ideApi.deleteEntry(project.id, target.rel_path);
        setTabs((prev) => prev.filter((t) => t.relPath !== target.rel_path));
        if (activeRelPath === target.rel_path) {
          setActiveRelPath(null);
        }
        onNotify(`Đã xóa ${target.name}`, 'success');
        setFsModal(null);
        await loadFiles(project.id, relPath);
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Thao tác tệp thất bại',
        'error'
      );
    } finally {
      setFsBusy(false);
    }
  };

  const goUp = () => {
    if (!relPath) return;
    loadFiles(project.id, getParentRelPath(relPath));
  };

  const isImageTab =
    activeTab &&
    (activeTab.category === 'image' || activeTab.mimeType.startsWith('image/'));

  return (
    <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
      {/* File Explorer */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5 dark:border-slate-800">
          <div className="min-w-0 flex-1 overflow-x-auto py-0.5">
            <BreadcrumbPath
              rootName={project.name}
              currentPath={relPath}
              subFolders={entries
                .filter((e) => e.is_dir)
                .map((e) => ({ name: e.name, path: e.rel_path }))}
              onNavigate={(p) => loadFiles(project.id, p)}
            />
          </div>

          <div className="flex items-center gap-1">
            {relPath && (
              <button
                type="button"
                onClick={goUp}
                className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                title="Thư mục cha"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => loadFiles(project.id, relPath)}
              className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              title="Làm mới"
            >
              <RefreshCw className={cn('h-4 w-4', loadingFiles && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* New File / New Folder Toolbar */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFsModal({ kind: 'new_file', value: '' })}
            className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-2.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            Tệp mới
          </button>
          <button
            type="button"
            onClick={() => setFsModal({ kind: 'new_folder', value: '' })}
            className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Thư mục mới
          </button>
        </div>

        <div className="relative mt-2.5">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={fileQuery}
            onChange={(e) => setFileQuery(e.target.value)}
            placeholder="Tìm tệp trong thư mục..."
            className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
          />
        </div>

        {fileError ? (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-300">
            {fileError}
          </div>
        ) : loadingFiles && entries.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Đang tải danh sách tệp...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Thư mục trống hoặc không khớp từ khóa.
          </div>
        ) : (
          <div className="mt-2.5 max-h-[420px] divide-y divide-slate-200/70 overflow-y-auto rounded-xl border border-slate-200/80 lg:max-h-[560px] dark:divide-slate-800 dark:border-slate-800">
            {filteredEntries.map((entry) => {
              const isSelected = activeRelPath === entry.rel_path;
              const isLoadingThis = openingPath === entry.rel_path;
              return (
                <div
                  key={entry.rel_path}
                  className={cn(
                    'group flex min-h-[46px] items-center justify-between gap-2 px-2.5 py-1.5 transition',
                    isSelected
                      ? 'bg-cyan-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/70'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (entry.is_dir) {
                        loadFiles(project.id, entry.rel_path);
                      } else {
                        openFile(entry);
                      }
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    {isLoadingThis ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-500" />
                    ) : entry.is_dir ? (
                      <Folder className="h-4 w-4 shrink-0 text-amber-400" />
                    ) : entry.category === 'image' ? (
                      <FileImage className="h-4 w-4 shrink-0 text-cyan-500" />
                    ) : entry.category === 'markdown' ? (
                      <FileText className="h-4 w-4 shrink-0 text-indigo-400" />
                    ) : (
                      <FileCode2 className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                        {entry.name}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {entry.is_dir ? 'Thư mục' : formatBytes(entry.size)} •{' '}
                        {formatRelativeTime(entry.modified_at)}
                      </p>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setFsModal({
                          kind: 'rename',
                          entry,
                          value: entry.name,
                        })
                      }
                      className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      title="Đổi tên"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFsModal({
                          kind: 'delete',
                          entry,
                          value: entry.name,
                        })
                      }
                      className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-500"
                      title="Xóa"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Multi-Tab Code Editor */}
      <section
        ref={editorSectionRef}
        className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111827]"
      >
        {/* Tab Bar */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/80 px-2 pt-2 dark:border-slate-800 dark:bg-[#0b101b]">
          {tabs.length === 0 ? (
            <div className="px-2 pb-2 text-xs text-slate-500 dark:text-slate-400">
              Chưa mở tệp nào
            </div>
          ) : (
            tabs.map((tab) => {
              const active = tab.relPath === activeRelPath;
              const dirty = isDirty(tab);
              return (
                <div
                  key={tab.relPath}
                  className={cn(
                    'flex max-w-[200px] shrink-0 items-center gap-1.5 rounded-t-xl border border-b-0 px-2.5 py-1.5 text-xs transition',
                    active
                      ? 'border-slate-200 bg-white font-semibold text-slate-900 dark:border-slate-700 dark:bg-[#111827] dark:text-white'
                      : 'border-transparent text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/50'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveRelPath(tab.relPath)}
                    className="min-w-0 truncate text-left"
                    title={tab.relPath}
                  >
                    {tab.name}
                    {dirty && (
                      <span className="ml-1 font-bold text-amber-500">*</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeTab(tab.relPath)}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                    title="Đóng tab"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {!activeTab ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <FileCode2 className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Chọn một tệp bên cây thư mục để xem hoặc chỉnh sửa
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Hỗ trợ mở nhiều tab, Ctrl+S lưu nhanh, tìm kiếm trong tệp và gửi đoạn mã sang AI Chat.
            </p>
          </div>
        ) : (
          <>
            {/* Editor Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {activeTab.relPath}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {formatBytes(activeTab.size)} • {activeTab.mimeType}
                  {isDirty(activeTab) && ' • Chưa lưu'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {!activeTab.isBinary && (
                  <>
                    <button
                      type="button"
                      onClick={() => setFindOpen((v) => !v)}
                      className={cn(
                        'inline-flex min-h-[36px] items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition',
                        findOpen
                          ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      )}
                      title="Tìm trong tệp (Ctrl+F)"
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Tìm</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setWordWrap((v) => !v)}
                      className={cn(
                        'inline-flex min-h-[36px] items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition',
                        wordWrap
                          ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      )}
                      title="Bật/tắt xuống dòng tự động"
                    >
                      <WrapText className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Wrap</span>
                    </button>

                    <button
                      type="button"
                      disabled={savingPath === activeTab.relPath || !isDirty(activeTab)}
                      onClick={() => saveTab(activeTab, false)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-45"
                      title="Lưu tệp (Ctrl+S)"
                    >
                      {savingPath === activeTab.relPath ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Lưu
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={handleSendToChat}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300"
                  title="Gửi tệp hoặc đoạn code đang chọn sang AI Chat"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Gửi sang AI Chat
                </button>
              </div>
            </div>

            {/* Find-in-File Bar */}
            {findOpen && !activeTab.isBinary && (
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-[#090d16]">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={findQuery}
                  onChange={(e) => setFindQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      jumpToMatch(e.shiftKey ? findIdx - 1 : findIdx + 1);
                    } else if (e.key === 'Escape') {
                      setFindOpen(false);
                    }
                  }}
                  placeholder="Tìm trong tệp hiện tại..."
                  autoFocus
                  className="min-h-[34px] min-w-[160px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                />
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {findMatches.length > 0
                    ? `${findIdx + 1}/${findMatches.length}`
                    : '0/0'}
                </span>
                <button
                  type="button"
                  onClick={() => jumpToMatch(findIdx - 1)}
                  disabled={findMatches.length === 0}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Kết quả trước"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => jumpToMatch(findIdx + 1)}
                  disabled={findMatches.length === 0}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Kết quả tiếp"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setFindOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Editor Body or Binary/Image Fallback */}
            {isImageTab ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-slate-950/40 p-6">
                <img
                  src={api.getProjectFileRawUrl(project.id, activeTab.relPath)}
                  alt={activeTab.name}
                  className="max-h-[420px] max-w-full rounded-xl border border-slate-200 object-contain shadow-md dark:border-slate-700"
                />
                <div className="flex flex-wrap gap-2">
                  {activeTab.entry && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenArtifact({
                          kind: 'project_file',
                          projectId: project.id,
                          projectName: project.name,
                          entry: activeTab.entry!,
                        })
                      }
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Phóng to ảnh
                    </button>
                  )}
                  <a
                    href={api.getProjectFileRawUrl(project.id, activeTab.relPath, true)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/25 dark:text-cyan-300"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tải xuống
                  </a>
                </div>
              </div>
            ) : activeTab.isBinary ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <FileCode2 className="h-10 w-10 text-amber-500" />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Tệp nhị phân — không thể chỉnh sửa trực tiếp dạng văn bản
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Định dạng: {activeTab.mimeType} • Dung lượng:{' '}
                  {formatBytes(activeTab.size)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeTab.entry && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenArtifact({
                          kind: 'project_file',
                          projectId: project.id,
                          projectName: project.name,
                          entry: activeTab.entry!,
                        })
                      }
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Xem thử trong trình xem
                    </button>
                  )}
                  <a
                    href={api.getProjectFileRawUrl(project.id, activeTab.relPath, true)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-4 text-xs font-semibold text-white"
                  >
                    <Download className="h-4 w-4" />
                    Tải về máy
                  </a>
                </div>
              </div>
            ) : (
              <div className="relative flex h-[440px] flex-1 overflow-hidden bg-slate-50 font-mono text-[13px] leading-[20px] dark:bg-[#090d16]">
                {/* Line numbers gutter */}
                <div
                  ref={gutterRef}
                  aria-hidden="true"
                  className="w-12 shrink-0 select-none overflow-hidden border-r border-slate-200 bg-slate-100/80 py-3 pr-2 text-right font-mono text-[11px] leading-[20px] tabular-nums text-slate-400 dark:border-slate-800 dark:bg-[#0d1322] dark:text-slate-500"
                >
                  {lineNumbers.map((num) => (
                    <div key={num}>{num}</div>
                  ))}
                </div>

                {/* Code Textarea */}
                <textarea
                  ref={textareaRef}
                  value={activeTab.content}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                  wrap={wordWrap ? 'soft' : 'off'}
                  onScroll={(e) => {
                    if (gutterRef.current) {
                      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const ta = e.currentTarget;
                      const start = ta.selectionStart;
                      const end = ta.selectionEnd;
                      const nextVal =
                        ta.value.slice(0, start) + '  ' + ta.value.slice(end);
                      setTabs((prev) =>
                        prev.map((t) =>
                          t.relPath === activeTab.relPath
                            ? { ...t, content: nextVal }
                            : t
                        )
                      );
                      requestAnimationFrame(() => {
                        if (textareaRef.current) {
                          textareaRef.current.selectionStart =
                            textareaRef.current.selectionEnd = start + 2;
                        }
                      });
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTabs((prev) =>
                      prev.map((t) =>
                        t.relPath === activeTab.relPath
                          ? { ...t, content: val }
                          : t
                      )
                    );
                  }}
                  className={cn(
                    'h-full w-full flex-1 resize-none border-0 bg-transparent p-3 font-mono text-[13px] leading-[20px] text-slate-900 outline-none dark:text-slate-100',
                    wordWrap ? 'whitespace-pre-wrap' : 'overflow-x-auto whitespace-pre'
                  )}
                />
              </div>
            )}
          </>
        )}
      </section>

      {/* 409 Conflict Dialog */}
      {conflict && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-white p-5 shadow-2xl dark:bg-[#111827]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Xung đột phiên bản tệp (409)
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  Tệp <span className="font-mono font-semibold">{conflict.relPath}</span> đã
                  bị thay đổi trên ổ đĩa PC sau khi bạn mở. Bạn muốn làm gì?
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConflict(null)}
                className="min-h-[42px] rounded-xl border border-slate-200 px-3.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => reloadTabFromDisk(conflict.relPath)}
                className="min-h-[42px] rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300"
              >
                Tải lại từ ổ đĩa
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = tabs.find((t) => t.relPath === conflict.relPath);
                  if (target) {
                    saveTab(
                      { ...target, content: conflict.pendingContent },
                      true
                    );
                  }
                }}
                className="min-h-[42px] rounded-xl bg-amber-500 px-4 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                Ghi đè bản trên ổ đĩa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Rename / Delete Modal */}
      {fsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleFsConfirm}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-[#111827]"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {fsModal.kind === 'new_file'
                  ? 'Tạo tệp mới'
                  : fsModal.kind === 'new_folder'
                    ? 'Tạo thư mục mới'
                    : fsModal.kind === 'rename'
                      ? 'Đổi tên'
                      : 'Xác nhận xóa'}
              </h3>
              <button
                type="button"
                onClick={() => setFsModal(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              {fsModal.kind === 'delete' ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Bạn có chắc muốn xóa{' '}
                  <span className="font-mono font-semibold text-rose-500">
                    {fsModal.entry?.rel_path}
                  </span>{' '}
                  trên ổ đĩa PC không?
                </p>
              ) : (
                <>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    {fsModal.kind === 'new_file'
                      ? `Tên tệp (trong /${relPath || ''})`
                      : fsModal.kind === 'new_folder'
                        ? `Tên thư mục (trong /${relPath || ''})`
                        : 'Tên mới'}
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={fsModal.value}
                    onChange={(e) =>
                      setFsModal({ ...fsModal, value: e.target.value })
                    }
                    placeholder={
                      fsModal.kind === 'new_file'
                        ? 'VD: notes.md hoặc utils/helper.ts'
                        : fsModal.kind === 'new_folder'
                          ? 'VD: components'
                          : 'Nhập tên mới...'
                    }
                    className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 font-mono text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                  />
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFsModal(null)}
                className="min-h-[42px] rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={fsBusy}
                className={cn(
                  'min-h-[42px] rounded-xl px-4 text-xs font-semibold text-white disabled:opacity-50',
                  fsModal.kind === 'delete'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-gradient-to-r from-cyan-500 to-indigo-600 hover:brightness-110'
                )}
              >
                {fsBusy
                  ? 'Đang xử lý...'
                  : fsModal.kind === 'delete'
                    ? 'Xóa vĩnh viễn'
                    : 'Xác nhận'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
