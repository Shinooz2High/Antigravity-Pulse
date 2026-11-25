import type { PromptRun } from '../types/api';

export const DEFAULT_CONVERSATION_ID = 'main-conversation';
const CONV_MAP_KEY = 'agy_pulse_conv_map_v1';

export interface ConversationThread {
  id: string;
  title: string;
  projectName: string;
  runs: PromptRun[];
  latestRun: PromptRun;
  updatedAt: string;
  status: PromptRun['status'];
}

export function loadConversationMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CONV_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Ignore storage errors
  }
  return {};
}

export function saveConversationMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(CONV_MAP_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function getRunConversationId(
  runId: string,
  map: Record<string, string>
): string {
  return map[runId] || DEFAULT_CONVERSATION_ID;
}

export function groupRunsIntoConversations(
  runs: PromptRun[],
  map: Record<string, string>
): ConversationThread[] {
  const buckets = new Map<string, PromptRun[]>();

  for (const run of runs) {
    const convId = getRunConversationId(run.id, map);
    const list = buckets.get(convId);
    if (list) {
      list.push(run);
    } else {
      buckets.set(convId, [run]);
    }
  }

  const threads: ConversationThread[] = [];
  for (const [id, group] of buckets.entries()) {
    const sorted = [...group].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const first = sorted[0];
    const latest = sorted[sorted.length - 1];
    threads.push({
      id,
      title: first?.prompt?.trim() || 'Cuộc trò chuyện',
      projectName: latest?.project_name || first?.project_name || 'Workspace',
      runs: sorted,
      latestRun: latest,
      updatedAt: latest.finished_at || latest.started_at || latest.created_at,
      status: latest.status,
    });
  }

  threads.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return threads;
}
