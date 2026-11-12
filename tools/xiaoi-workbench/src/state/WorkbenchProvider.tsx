import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type {
  BusinessConcept,
  ChangeSet,
  EvaluationRun,
  FeedbackTicket,
  InteractionAction,
  KnowledgeItem,
  KnowledgeTemplate,
  LexiconClass,
  RecognitionModule,
  SemanticExpression,
  TicketStatus,
  WorkbenchState
} from '../domain/types';
import {
  loadState,
  resetState as resetRepositoryState,
  saveState,
  upgradeRuleModel
} from '../services/workbenchRepository';
import { applyExpressionUpdate } from '../domain/expressionBindings';
import { evaluateKnowledgeQuality } from '../domain/knowledgeQuality';
import {
  defaultRuntimeDraftClient,
  initializeRuntimeDraft,
  reconnectRuntimeDraft,
  RuntimeDraftSaveQueue
} from '../services/runtimeDraftSync';
import { XiaoiRuntimeApiError } from '../services/xiaoiRuntimeApi';
import {
  getRuntimeApplicationStatus,
  type RuntimeApplicationReleaseStatus
} from '../services/xiaoiRuntimeApi';

export interface DraftSyncState {
  status: 'loading' | 'synced' | 'saving' | 'offline' | 'conflict';
  revision: number | null;
  message?: string;
}

export interface RuntimeStatusState {
  status: 'loading' | 'active' | 'unpublished' | 'error';
  release?: RuntimeApplicationReleaseStatus;
  message?: string;
}

interface WorkbenchContextValue {
  state: WorkbenchState;
  draftSync: DraftSyncState;
  runtimeStatus: RuntimeStatusState;
  refreshRuntimeStatus: () => Promise<void>;
  retryDraftSync: () => Promise<void>;
  resolveDraftConflict: (
    strategy: 'use-remote' | 'keep-local'
  ) => Promise<void>;
  addKnowledgeItem: (item: KnowledgeItem) => void;
  updateKnowledgeItem: (id: string, patch: Partial<KnowledgeItem>) => void;
  addLexicon: (lexicon: LexiconClass) => void;
  updateLexicon: (id: string, patch: Partial<LexiconClass>) => void;
  addExpression: (expression: SemanticExpression) => void;
  updateExpression: (id: string, patch: Partial<SemanticExpression>) => void;
  addToChangeSet: (knowledgeItemId: string) => string;
  updateChangeSet: (id: string, patch: Partial<ChangeSet>) => void;
  updateTicketStatus: (id: string, status: TicketStatus) => void;
  addConcept: (concept: BusinessConcept) => void;
  updateConcept: (id: string, patch: Partial<BusinessConcept>) => void;
  addAction: (action: InteractionAction) => void;
  updateAction: (id: string, patch: Partial<InteractionAction>) => void;
  addTemplate: (template: KnowledgeTemplate) => void;
  addEvaluationRun: (run: EvaluationRun) => void;
  updateRecognitionModule: (
    id: string,
    patch: Partial<RecognitionModule>
  ) => void;
  updateEvaluationPolicy: (
    patch: Partial<NonNullable<WorkbenchState['evaluationPolicy']>>
  ) => void;
  updateContext: (patch: Partial<WorkbenchState['context']>) => void;
  resetDemo: () => void;
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkbenchState>(() => loadState());
  const [draftSync, setDraftSync] = useState<DraftSyncState>({
    status: 'loading',
    revision: null
  });
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusState>({
    status: 'loading'
  });
  const stateRef = useRef(state);
  const revisionRef = useRef<number | null>(null);
  const runtimeReadyRef = useRef(false);
  const lastSyncedStateRef = useRef<string>();
  const saveQueueRef = useRef<RuntimeDraftSaveQueue | null>(null);
  const saveGenerationRef = useRef(0);
  const pendingRemoteDraftRef = useRef<Awaited<
    ReturnType<typeof defaultRuntimeDraftClient.getDraft>
  > | null>(null);

  useEffect(() => {
    stateRef.current = state;
    saveState(state);
  }, [state]);

  const activateRuntimeDraft = useCallback(
    (
      remote: Awaited<ReturnType<typeof defaultRuntimeDraftClient.getDraft>>,
      nextState?: WorkbenchState
    ) => {
      revisionRef.current = remote.revision;
      runtimeReadyRef.current = true;
      saveQueueRef.current = new RuntimeDraftSaveQueue(
        defaultRuntimeDraftClient,
        remote.revision
      );
      const activeState = nextState ?? stateRef.current;
      lastSyncedStateRef.current = JSON.stringify(activeState);
      pendingRemoteDraftRef.current = null;
      if (nextState) setState(nextState);
      setDraftSync({
        status: 'synced',
        revision: remote.revision
      });
    },
    []
  );

  const retryDraftSync = useCallback(async () => {
    setDraftSync((current) => ({
      ...current,
      status: 'loading',
      message: undefined
    }));
    const result = await reconnectRuntimeDraft(stateRef.current);
    if (result.status === 'offline' || !result.remote) {
      setDraftSync({
        status: 'offline',
        revision: revisionRef.current,
        message: result.error
      });
      return;
    }
    if (result.status === 'conflict') {
      pendingRemoteDraftRef.current = result.remote;
      runtimeReadyRef.current = false;
      setDraftSync({
        status: 'conflict',
        revision: result.remote.revision,
        message: '本地内容与服务端草稿不同，请选择保留版本'
      });
      return;
    }
    activateRuntimeDraft(result.remote);
  }, [activateRuntimeDraft]);

  const resolveDraftConflict = useCallback(
    async (strategy: 'use-remote' | 'keep-local') => {
      const remote = pendingRemoteDraftRef.current;
      if (!remote) return;
      setDraftSync({
        status: 'saving',
        revision: remote.revision
      });
      try {
        if (strategy === 'use-remote') {
          const remoteState = upgradeRuleModel(remote.content);
          activateRuntimeDraft(remote, remoteState);
          return;
        }
        const saved = await defaultRuntimeDraftClient.saveDraft(
          stateRef.current,
          remote.revision
        );
        activateRuntimeDraft(saved);
      } catch (error) {
        setDraftSync({
          status:
            error instanceof XiaoiRuntimeApiError &&
            error.code === 'VERSION_CONFLICT'
              ? 'conflict'
              : 'offline',
          revision: remote.revision,
          message:
            error instanceof Error ? error.message : '解决草稿冲突失败'
        });
      }
    },
    [activateRuntimeDraft]
  );

  const refreshRuntimeStatus = useCallback(async () => {
    const applicationId = `${state.context.projectId}-assistant`;
    setRuntimeStatus({ status: 'loading' });
    try {
      const release = await getRuntimeApplicationStatus(
        applicationId,
        state.context.environment
      );
      if (release.status === 'unpublished') {
        setRuntimeStatus({ status: 'unpublished' });
        return;
      }
      setRuntimeStatus({ status: 'active', release });
    } catch (error) {
      if (
        error instanceof XiaoiRuntimeApiError &&
        error.code === 'APPLICATION_BINDING_NOT_FOUND'
      ) {
        setRuntimeStatus({ status: 'unpublished' });
        return;
      }
      setRuntimeStatus({
        status: 'error',
        message:
          error instanceof Error ? error.message : '读取线上版本状态失败'
      });
    }
  }, [state.context.environment, state.context.projectId]);

  useEffect(() => {
    void refreshRuntimeStatus();
  }, [refreshRuntimeStatus]);

  useEffect(() => {
    let cancelled = false;
    void initializeRuntimeDraft(stateRef.current).then((initialization) => {
      if (cancelled) return;
      revisionRef.current = initialization.revision;
      runtimeReadyRef.current = initialization.revision !== null;
      saveQueueRef.current = initialization.revision === null
        ? null
        : new RuntimeDraftSaveQueue(
            defaultRuntimeDraftClient,
            initialization.revision
          );
      lastSyncedStateRef.current = runtimeReadyRef.current
        ? JSON.stringify(initialization.state)
        : undefined;
      setState(initialization.state);
      setDraftSync({
        status: runtimeReadyRef.current ? 'synced' : 'offline',
        revision: initialization.revision,
        message: initialization.error
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!runtimeReadyRef.current || !saveQueueRef.current) return;
    const serializedState = JSON.stringify(state);
    if (serializedState === lastSyncedStateRef.current) return;
    const generation = ++saveGenerationRef.current;

    setDraftSync((current) => ({
      ...current,
      status: 'saving',
      message: undefined
    }));
    const timer = window.setTimeout(() => {
      const queue = saveQueueRef.current;
      if (!queue) return;
      void queue
        .save(state)
        .then((saved) => {
          revisionRef.current = saved.revision;
          lastSyncedStateRef.current = serializedState;
          if (generation === saveGenerationRef.current) {
            setDraftSync({
              status: 'synced',
              revision: saved.revision
            });
          }
        })
        .catch((error) => {
          const conflict =
            error instanceof XiaoiRuntimeApiError &&
            error.code === 'VERSION_CONFLICT';
          runtimeReadyRef.current = false;
          if (generation === saveGenerationRef.current) {
            setDraftSync({
              status: conflict ? 'conflict' : 'offline',
              revision: revisionRef.current,
              message: error instanceof Error ? error.message : '服务端草稿保存失败'
            });
          }
        });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [state]);

  const addKnowledgeItem = (item: KnowledgeItem) => {
    setState((current) => ({
      ...current,
      knowledgeItems: [item, ...current.knowledgeItems]
    }));
  };

  const updateKnowledgeItem = (id: string, patch: Partial<KnowledgeItem>) => {
    setState((current) => {
      const knowledgeItems = current.knowledgeItems.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch, updatedAt: new Date().toLocaleString('zh-CN') };
        const quality = evaluateKnowledgeQuality(next, current);
        return { ...next, qualityScore: quality.score, issues: quality.issues };
      });
      return { ...current, knowledgeItems };
    });
  };

  const addLexicon = (lexicon: LexiconClass) => {
    setState((current) => ({
      ...current,
      lexicons: [lexicon, ...current.lexicons]
    }));
  };

  const updateLexicon = (id: string, patch: Partial<LexiconClass>) => {
    setState((current) => ({
      ...current,
      lexicons: current.lexicons.map((lexicon) =>
        lexicon.id === id ? { ...lexicon, ...patch } : lexicon
      )
    }));
  };

  const addExpression = (expression: SemanticExpression) => {
    setState((current) =>
      applyExpressionUpdate(
        {
          ...current,
          expressions: [expression, ...current.expressions]
        },
        expression.id,
        expression
      )
    );
  };

  const updateExpression = (id: string, patch: Partial<SemanticExpression>) => {
    setState((current) => applyExpressionUpdate(current, id, patch));
  };

  const addToChangeSet = (knowledgeItemId: string) => {
    const existing = state.changeSets.find((changeSet) => changeSet.status === 'draft');
    if (existing) {
      if (!existing.objectRefs.includes(knowledgeItemId)) {
        setState((current) => ({
          ...current,
          changeSets: current.changeSets.map((changeSet) =>
            changeSet.id === existing.id
              ? {
                  ...changeSet,
                  objectRefs: [...changeSet.objectRefs, knowledgeItemId],
                  updatedAt: new Date().toLocaleString('zh-CN')
                }
              : changeSet
          )
        }));
      }
      return existing.id;
    }

    const id = `cs-${Date.now()}`;
    const changeSet: ChangeSet = {
      id,
      title: '知识点修订',
      businessReason: '从知识点编辑器创建',
      objectRefs: [knowledgeItemId],
      riskLevel: 'low',
      status: 'draft',
      owner: '当前用户',
      gates: {
        requiredFieldsComplete: true,
        referencesValid: true,
        blockingConflicts: 0,
        regressionPassed: false,
        reviewApproved: false
      },
      updatedAt: new Date().toLocaleString('zh-CN')
    };
    setState((current) => ({
      ...current,
      changeSets: [changeSet, ...current.changeSets]
    }));
    return id;
  };

  const updateChangeSet = (id: string, patch: Partial<ChangeSet>) => {
    setState((current) => ({
      ...current,
      changeSets: current.changeSets.map((changeSet) =>
        changeSet.id === id ? { ...changeSet, ...patch } : changeSet
      )
    }));
  };

  const updateTicketStatus = (id: string, status: TicketStatus) => {
    setState((current) => ({
      ...current,
      tickets: current.tickets.map((ticket): FeedbackTicket =>
        ticket.id === id ? { ...ticket, status } : ticket
      )
    }));
  };

  const addConcept = (concept: BusinessConcept) => {
    setState((current) => ({
      ...current,
      concepts: [...current.concepts, concept]
    }));
  };

  const updateConcept = (id: string, patch: Partial<BusinessConcept>) => {
    setState((current) => ({
      ...current,
      concepts: current.concepts.map((concept) =>
        concept.id === id ? { ...concept, ...patch } : concept
      )
    }));
  };

  const addAction = (action: InteractionAction) => {
    setState((current) => ({
      ...current,
      actions: [...current.actions, action]
    }));
  };

  const updateAction = (id: string, patch: Partial<InteractionAction>) => {
    setState((current) => ({
      ...current,
      actions: current.actions.map((action) =>
        action.id === id ? { ...action, ...patch } : action
      )
    }));
  };

  const addTemplate = (template: KnowledgeTemplate) => {
    setState((current) => ({
      ...current,
      templates: [...current.templates, template]
    }));
  };

  const addEvaluationRun = (run: EvaluationRun) => {
    setState((current) => ({
      ...current,
      evaluationRuns: [run, ...current.evaluationRuns]
    }));
  };

  const updateRecognitionModule = (
    id: string,
    patch: Partial<RecognitionModule>
  ) => {
    setState((current) => {
      const modules = (current.modules ?? []).map((module) =>
        module.id === id ? { ...module, ...patch } : module
      );
      const updated = modules.find((module) => module.id === id);
      return {
        ...current,
        modules,
        engineProfile: updated
          ? {
              ...current.engineProfile!,
              ...updated.thresholds
            }
          : current.engineProfile
      };
    });
  };

  const updateContext = (patch: Partial<WorkbenchState['context']>) => {
    setState((current) => ({
      ...current,
      context: { ...current.context, ...patch }
    }));
  };

  const updateEvaluationPolicy = (
    patch: Partial<NonNullable<WorkbenchState['evaluationPolicy']>>
  ) => {
    setState((current) => ({
      ...current,
      evaluationPolicy: {
        requireServerRun: false,
        requireFullRun: true,
        forceRegression: true,
        ...current.evaluationPolicy,
        ...patch
      }
    }));
  };

  const resetDemo = () => {
    setState(resetRepositoryState());
  };

  return (
    <WorkbenchContext.Provider
      value={{
        state,
        draftSync,
        runtimeStatus,
        refreshRuntimeStatus,
        retryDraftSync,
        resolveDraftConflict,
        addKnowledgeItem,
        updateKnowledgeItem,
        addLexicon,
        updateLexicon,
        addExpression,
        updateExpression,
        addToChangeSet,
        updateChangeSet,
        updateTicketStatus,
        addConcept,
        updateConcept,
        addAction,
        updateAction,
        addTemplate,
        addEvaluationRun,
        updateRecognitionModule,
        updateEvaluationPolicy,
        updateContext,
        resetDemo
      }}
    >
      {children}
    </WorkbenchContext.Provider>
  );
}

export function useWorkbench() {
  const context = useContext(WorkbenchContext);
  if (!context) {
    throw new Error('useWorkbench 必须在 WorkbenchProvider 内使用');
  }
  return context;
}
