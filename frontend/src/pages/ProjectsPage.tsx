import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Code2,
  Edit3,
  FolderGit2,
  GitBranch,
  Play,
  Plus,
  StickyNote,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  EmptyProjectsState,
  TypeToConfirmDeleteModal,
} from '../components/library';
import { CodeEditorPane } from '../components/ide/CodeEditorPane';
import { GitSourceControlPane } from '../components/ide/GitSourceControlPane';
import { CheckpointsPane } from '../components/ide/CheckpointsPane';
import { TerminalPane } from '../components/ide/TerminalPane';
import { NotesAndPortsPane } from '../components/ide/NotesAndPortsPane';
import {
  cn,
  getEngineLabel,
  getPolicyLabel,
} from '../lib/utils';
import type {
  ArtifactModalTarget,
  EngineMode,
  ExecutionPolicy,
  Project,
  TabKey,
} from '../types/api';

type IdeTabKey = 'files' | 'git' | 'checkpoints' | 'terminal' | 'notes_ports';

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

const IDE_TABS: Array<{
  id: IdeTabKey;
  label: string;
  icon: typeof Code2;
}> = [
  { id: 'files', label: 'Tệp & Trình soạn', icon: Code2 },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'checkpoints', label: 'Checkpoints', icon: Camera },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'notes_ports', label: 'Ghi chú & Ports', icon: StickyNote },
];

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
  const [ideTab, setIdeTab] = useState<IdeTabKey>('files');
  const [localRefreshTick, setLocalRefreshTick] = useState(0);

  // Modal state for Add/Edit Project
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formName, setFormName] = useState('');
  const [formPath, setFormPath] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formEngine, setFormEngine] = useState<EngineMode>('antigravity_sdk');
  const [formPolicy, setFormPolicy] = useState<ExecutionPolicy>('ask_mobile');
  const [saving, setSaving] = useState(false);

  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId]
  );

  const combinedRefreshTick = workspaceRefreshTick + localRefreshTick;

  const handleWorkspaceMutated = async () => {
    setLocalRefreshTick((t) => t + 1);
    await onRefreshProjects();
  };

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
      onNotify(
        err instanceof Error ? err.message : 'Không thể xóa dự án',
        'error'
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* Header + Add */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Pocket IDE &amp; Dự án Workspace
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Chỉnh sửa mã nguồn, quản lý Git, chụp Checkpoint, chạy Terminal và xem cổng trực tiếp từ điện thoại
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

                  <div
                    className="flex shrink-0 items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
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

      {/* 5-Tab Pocket IDE */}
      {selectedProject && (
        <div className="space-y-4">
          {/* IDE Tab Bar */}
          <nav
            aria-label="Pocket IDE tabs"
            className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-[#111827]"
          >
            {IDE_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = ideTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setIdeTab(tab.id)}
                  className={cn(
                    'inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition',
                    active
                      ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Active Tab Content */}
          {ideTab === 'files' && (
            <CodeEditorPane
              project={selectedProject}
              workspaceRefreshTick={combinedRefreshTick}
              onNavigate={onNavigate}
              onOpenArtifact={onOpenArtifact}
              onNotify={onNotify}
            />
          )}

          {ideTab === 'git' && (
            <GitSourceControlPane
              project={selectedProject}
              workspaceRefreshTick={combinedRefreshTick}
              onWorkspaceMutated={handleWorkspaceMutated}
              onNotify={onNotify}
            />
          )}

          {ideTab === 'checkpoints' && (
            <CheckpointsPane
              project={selectedProject}
              onWorkspaceMutated={handleWorkspaceMutated}
              onNotify={onNotify}
            />
          )}

          {ideTab === 'terminal' && (
            <TerminalPane project={selectedProject} onNotify={onNotify} />
          )}

          {ideTab === 'notes_ports' && (
            <NotesAndPortsPane project={selectedProject} onNotify={onNotify} />
          )}
        </div>
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
                    <option value="claude_code">Claude Code</option>
                    <option value="codex">OpenAI Codex</option>
                    <option value="opencode">OpenCode</option>
                    <option value="demo">Demo Simulator</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Quyền thực thi
                  </label>
                  <select
                    value={formPolicy}
                    onChange={(e) =>
                      setFormPolicy(e.target.value as ExecutionPolicy)
                    }
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
