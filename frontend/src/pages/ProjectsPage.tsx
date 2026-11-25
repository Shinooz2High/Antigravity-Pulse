import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  ChevronRight,
  Edit3,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderGit2,
  GitBranch,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  EmptyProjectsState,
  BreadcrumbPath,
  TypeToConfirmDeleteModal,
} from '../components/library';
import {
  cn,
  formatBytes,
  formatRelativeTime,
  getEngineLabel,
  getPolicyLabel,
} from '../lib/utils';
import type {
  ArtifactModalTarget,
  EngineMode,
  ExecutionPolicy,
  FileEntry,
  Project,
  TabKey,
} from '../types/api';

interface ProjectsPageProps {
  projects: Project[];
  selectedProjectId: string;
  workspaceRefreshTick: number;
  onSelectProject: (projectId: string) => void;
  onRefreshProjects: () => Promise<void>;
  onNavigate: (tab: TabKey) => void;
  onOpenArtifact: (target: ArtifactModalTarget) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

export function ProjectsPage({
  projects,
  selectedProjectId,
  workspaceRefreshTick,
  onSelectProject,
  onRefreshProjects,
  onNavigate,
  onOpenArtifact,
  onNotify,
}: ProjectsPageProps) {
  const [relPath, setRelPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileQuery, setFileQuery] = useState('');

  // Modal state for Add/Edit Project
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formName, setFormName] = useState('');
  const [formPath, setFormPath] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formEngine, setFormEngine] = useState<EngineMode>('antigravity_sdk');
  const [formPolicy, setFormPolicy] = useState<ExecutionPolicy>('ask_mobile');
  const [saving, setSaving] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId]
  );

  const loadFiles = async (projId: string, path: string) => {
    setLoadingFiles(true);
    setFileError(null);
    try {
      const res = await api.getProjectFiles(projId, path);
      setRelPath(res.current_path || '');
      setEntries(res.entries || []);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Không thể đọc thư mục dự án');
      setEntries([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (!selectedProject) {
      setEntries([]);
      setRelPath('');
      return;
    }
    setRelPath('');
    loadFiles(selectedProject.id, '');
  }, [selectedProject?.id]);

  // Refresh current folder when watcher emits workspace.changed
  useEffect(() => {
    if (workspaceRefreshTick > 0 && selectedProject) {
      loadFiles(selectedProject.id, relPath);
    }
  }, [workspaceRefreshTick]);

  const filteredEntries = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, fileQuery]);

  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const openCreateModal = () => {
    setEditingProject(null);
    setFormName('');
    setFormPath('');
    setFormDesc('');
    setFormEngine('antigravity_sdk');
    setFormPolicy('ask_mobile');
    setModalOpen(true);
  };

  const openEditModal = (p: Project) => {
    setEditingProject(p);
    setFormName(p.name);
    setFormPath(p.path);
    setFormDesc(p.description || '');
    setFormEngine(p.engine_mode);
    setFormPolicy(p.execution_policy);
    setModalOpen(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPath.trim()) {
      onNotify('Tên dự án và đường dẫn thư mục không được để trống', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingProject) {
        await api.updateProject(editingProject.id, {
          name: formName.trim(),
          path: formPath.trim(),
          description: formDesc.trim(),
          engine_mode: formEngine,
          execution_policy: formPolicy,
        });
        onNotify('Đã cập nhật dự án', 'success');
      } else {
        const created = await api.createProject({
          name: formName.trim(),
          path: formPath.trim(),
          description: formDesc.trim(),
          engine_mode: formEngine,
          execution_policy: formPolicy,
        });
        onSelectProject(created.id);
        onNotify('Đã thêm dự án mới', 'success');
      }
      setModalOpen(false);
      await onRefreshProjects();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Lỗi lưu dự án', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = (p: Project) => {
    setProjectToDelete(p);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      await api.deleteProject(projectToDelete.id);
      onNotify('Đã xóa dự án khỏi danh sách', 'success');
      setProjectToDelete(null);
      await onRefreshProjects();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể xóa dự án', 'error');
    }
  };

  const goUp = () => {
    if (!selectedProject || !relPath) return;
    const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
    parts.pop();
    loadFiles(selectedProject.id, parts.join('/'));
  };

  return (
    <div className="space-y-5">
      {/* Header + Add */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Dự án Workspace trên PC
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Quản lý thư mục mã nguồn và duyệt tệp trực tiếp từ điện thoại
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-4 text-sm font-semibold text-white shadow-md shadow-cyan-500/20 hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Thêm dự án
        </button>
      </div>

      {/* Project Cards */}
      {projects.length === 0 ? (
        <EmptyProjectsState onCreateProject={openCreateModal} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => {
            const active = selectedProject?.id === p.id;
            return (
              <div
                key={p.id}
                onClick={() => onSelectProject(p.id)}
                className={cn(
                  'cursor-pointer rounded-2xl border p-4 transition',
                  active
                    ? 'border-cyan-500 bg-cyan-500/5 shadow-sm'
                    : 'border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-[#111827] dark:hover:border-slate-700'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FolderGit2 className="h-4 w-4 shrink-0 text-cyan-500" />
                      <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                        {p.name}
                      </h3>
                      {!p.exists && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-300">
                          <AlertTriangle className="h-3 w-3" />
                          Không tồn tại
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {p.path}
                    </p>
                    {p.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                        {p.description}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openEditModal(p)}
                      className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      title="Chỉnh sửa dự án"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(p)}
                      className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/15 hover:text-rose-500 dark:text-slate-400"
                      title="Xóa dự án"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2.5 dark:border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {p.git_branch && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono font-medium',
                          p.git_dirty
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        )}
                      >
                        <GitBranch className="h-3 w-3" />
                        {p.git_branch}
                        {p.git_dirty ? ' *' : ''}
                      </span>
                    )}
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {getEngineLabel(p.engine_mode)}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {getPolicyLabel(p.execution_policy)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectProject(p.id);
                      onNavigate('prompt');
                    }}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-cyan-500/15 px-2.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/25 dark:text-cyan-300"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Chạy Prompt
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* File Browser */}
      {selectedProject && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
            <div className="min-w-0 flex-1 overflow-x-auto py-1">
              <BreadcrumbPath
                rootName={selectedProject.name}
                currentPath={relPath}
                subFolders={entries
                  .filter((e) => e.is_dir)
                  .map((e) => ({ name: e.name, path: e.rel_path }))}
                onNavigate={(path) => loadFiles(selectedProject.id, path)}
              />
            </div>

            <div className="flex items-center gap-1.5">
              {relPath && (
                <button
                  type="button"
                  onClick={goUp}
                  className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  Lên
                </button>
              )}
              <button
                type="button"
                onClick={() => loadFiles(selectedProject.id, relPath)}
                className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                title="Làm mới thư mục"
              >
                <RefreshCw className={cn('h-4 w-4', loadingFiles && 'animate-spin')} />
              </button>
            </div>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={fileQuery}
              onChange={(e) => setFileQuery(e.target.value)}
              placeholder="Lọc tệp trong thư mục hiện tại..."
              className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
            />
          </div>

          {fileError ? (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-600 dark:text-rose-300">
              {fileError}
            </div>
          ) : loadingFiles && entries.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">Đang tải danh sách tệp...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              Thư mục trống hoặc không khớp từ khóa tìm kiếm.
            </div>
          ) : (
            <div className="mt-3 divide-y divide-slate-200/70 rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
              {filteredEntries.map((entry) => (
                <button
                  key={entry.rel_path}
                  type="button"
                  onClick={() => {
                    if (entry.is_dir) {
                      loadFiles(selectedProject.id, entry.rel_path);
                    } else {
                      onOpenArtifact({
                        kind: 'project_file',
                        projectId: selectedProject.id,
                        projectName: selectedProject.name,
                        entry,
                      });
                    }
                  }}
                  className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/70"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {entry.is_dir ? (
                      <Folder className="h-5 w-5 shrink-0 text-amber-400" />
                    ) : entry.category === 'image' ? (
                      <FileImage className="h-5 w-5 shrink-0 text-cyan-500" />
                    ) : entry.category === 'markdown' ? (
                      <FileText className="h-5 w-5 shrink-0 text-indigo-400" />
                    ) : (
                      <FileCode2 className="h-5 w-5 shrink-0 text-slate-400" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {entry.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {entry.is_dir ? 'Thư mục' : formatBytes(entry.size)} •{' '}
                        {formatRelativeTime(entry.modified_at)}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveProject}
            className="pb-safe w-full max-w-lg rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-2xl dark:border-slate-800 dark:bg-[#111827]"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold">
                {editingProject ? 'Chỉnh sửa dự án' : 'Thêm dự án workspace'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Tên dự án
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="VD: My App"
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-base text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Đường dẫn tuyệt đối trên PC
                </label>
                <input
                  type="text"
                  required
                  value={formPath}
                  onChange={(e) => setFormPath(e.target.value)}
                  placeholder="VD: D:\Projects\my-app"
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 font-mono text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Mô tả ngắn (tùy chọn)
                </label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Mô tả nhanh repo..."
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-base text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Engine mặc định
                  </label>
                  <select
                    value={formEngine}
                    onChange={(e) => setFormEngine(e.target.value as EngineMode)}
                    className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                  >
                    <option value="antigravity_sdk">Antigravity SDK</option>
                    <option value="cli">CLI Runner</option>
                    <option value="demo">Demo Simulator</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Quyền thực thi
                  </label>
                  <select
                    value={formPolicy}
                    onChange={(e) => setFormPolicy(e.target.value as ExecutionPolicy)}
                    className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                  >
                    <option value="ask_mobile">Hỏi duyệt trên ĐT</option>
                    <option value="read_only">Chỉ đọc</option>
                    <option value="auto_workspace">Tự động trong workspace</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[44px] rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : 'Lưu dự án'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Lucian Danger Delete Modal */}
      <TypeToConfirmDeleteModal
        isOpen={!!projectToDelete}
        targetName={projectToDelete?.name || ''}
        title={`Xóa dự án "${projectToDelete?.name || ''}"`}
        description="Thao tác này sẽ gỡ bỏ dự án khỏi danh sách theo dõi trên Antigravity Pulse (không xóa tệp trên ổ đĩa PC). Hãy nhập đúng tên dự án bên dưới để xác nhận:"
        onConfirm={confirmDeleteProject}
        onCancel={() => setProjectToDelete(null)}
      />
    </div>
  );
}
