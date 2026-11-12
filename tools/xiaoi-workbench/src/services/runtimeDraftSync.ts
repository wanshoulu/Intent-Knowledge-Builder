import type { WorkbenchState } from '../domain/types';
import { upgradeRuleModel } from './workbenchRepository';
import {
  getRuntimeDraft,
  saveRuntimeDraft,
  XiaoiRuntimeApiError,
  type RuntimeDraft
} from './xiaoiRuntimeApi';

export interface RuntimeDraftClient {
  getDraft: (workspaceId: string, projectId: string) => Promise<RuntimeDraft>;
  saveDraft: (
    state: WorkbenchState,
    expectedRevision: number
  ) => Promise<RuntimeDraft>;
}

export interface RuntimeDraftInitialization {
  state: WorkbenchState;
  revision: number | null;
  source: 'remote' | 'migrated-local' | 'local-recovery';
  error?: string;
}

export interface RuntimeDraftReconnectResult {
  status: 'reconnected' | 'conflict' | 'offline';
  remote?: RuntimeDraft;
  error?: string;
}

export const defaultRuntimeDraftClient: RuntimeDraftClient = {
  getDraft: getRuntimeDraft,
  saveDraft: saveRuntimeDraft
};

function comparableDraftContent(state: WorkbenchState) {
  const { migrationNotes: _migrationNotes, ...content } = upgradeRuleModel(state);
  return content;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableStringify(entryValue)}`
      );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export class RuntimeDraftSaveQueue {
  private revision: number;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly client: RuntimeDraftClient,
    initialRevision: number
  ) {
    this.revision = initialRevision;
  }

  get currentRevision() {
    return this.revision;
  }

  save(state: WorkbenchState): Promise<RuntimeDraft> {
    const task = this.tail.then(async () => {
      const saved = await this.client.saveDraft(state, this.revision);
      this.revision = saved.revision;
      return saved;
    });
    this.tail = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }
}

export async function initializeRuntimeDraft(
  localRecoveryState: WorkbenchState,
  client: RuntimeDraftClient = defaultRuntimeDraftClient
): Promise<RuntimeDraftInitialization> {
  try {
    const remote = await client.getDraft(
      localRecoveryState.context.workspaceId,
      localRecoveryState.context.projectId
    );
    return {
      state: upgradeRuleModel(remote.content),
      revision: remote.revision,
      source: 'remote'
    };
  } catch (error) {
    if (error instanceof XiaoiRuntimeApiError && error.status === 404) {
      try {
        const created = await client.saveDraft(localRecoveryState, 0);
        return {
          state: upgradeRuleModel(created.content),
          revision: created.revision,
          source: 'migrated-local'
        };
      } catch (migrationError) {
        return {
          state: localRecoveryState,
          revision: null,
          source: 'local-recovery',
          error:
            migrationError instanceof Error
              ? migrationError.message
              : '首次迁移服务端草稿失败'
        };
      }
    }

    return {
      state: localRecoveryState,
      revision: null,
      source: 'local-recovery',
      error:
        error instanceof Error
          ? error.message
          : '小 i 运行时不可用'
    };
  }
}

export async function reconnectRuntimeDraft(
  localState: WorkbenchState,
  client: RuntimeDraftClient = defaultRuntimeDraftClient
): Promise<RuntimeDraftReconnectResult> {
  try {
    const remote = await client.getDraft(
      localState.context.workspaceId,
      localState.context.projectId
    );
    const localContent = stableStringify(comparableDraftContent(localState));
    const remoteContent = stableStringify(comparableDraftContent(remote.content));

    return {
      status: localContent === remoteContent ? 'reconnected' : 'conflict',
      remote
    };
  } catch (error) {
    return {
      status: 'offline',
      error:
        error instanceof Error
          ? error.message
          : '重新连接服务端草稿失败'
    };
  }
}
