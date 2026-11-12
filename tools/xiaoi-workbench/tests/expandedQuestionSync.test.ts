import { seedState } from '../src/data/seed';
import {
  getOrdinaryExpandedQuestions,
  syncOrdinaryExpandedQuestionDefinitions,
  syncOrdinaryExpandedQuestions
} from '../src/domain/expandedQuestions';
import { upgradeRuleModel } from '../src/services/workbenchRepository';
import { recognize } from '../src/engine/ruleEngine';

describe('知识点普通问题同步', () => {
  it('编辑后的普通问题替换旧定义并立即参与统一内核识别', () => {
    const state = upgradeRuleModel(structuredClone(seedState));
    const item = state.knowledgeItems.find(
      (knowledge) => knowledge.id === 'ki-credit-repayment-date'
    );
    if (!item) throw new Error('测试数据缺少信用卡还款日知识点');
    const synchronized = syncOrdinaryExpandedQuestions(item, [
      '塑料卡最后缴款是哪天'
    ]);
    const nextState = {
      ...state,
      knowledgeItems: state.knowledgeItems.map((knowledge) =>
        knowledge.id === item.id
          ? { ...knowledge, ...synchronized }
          : knowledge
      )
    };

    expect(synchronized.expandedQuestions).toEqual(['塑料卡最后缴款是哪天']);
    expect(
      synchronized.expandedQuestionDefinitions
        .filter((question) => question.kind === 'ordinary')
        .map((question) => question.content)
    ).toEqual(['塑料卡最后缴款是哪天']);
    expect(
      recognize('塑料卡最后缴款是哪天', nextState).target?.id
    ).toBe(item.id);
  });

  it('保留知识点内模板定义，不因编辑普通问题被删除', () => {
    const state = upgradeRuleModel(structuredClone(seedState));
    const item = state.knowledgeItems[0];
    item.expandedQuestionDefinitions = [
      ...(item.expandedQuestionDefinitions ?? []),
      {
        id: 'template-local',
        knowledgePointId: item.id,
        kind: 'template',
        content: '[信用卡]',
        enabled: true,
        priority: 100,
        weight: 1,
        status: 'draft',
        templateConfig: {
          polarity: 'positive',
          mode: 'base',
          lexiconRefs: ['lex-credit-card']
        }
      }
    ];

    const synchronized = syncOrdinaryExpandedQuestions(item, ['新的普通问题']);

    expect(
      synchronized.expandedQuestionDefinitions.some(
        (question) => question.id === 'template-local'
      )
    ).toBe(true);
  });

  it('逐条维护普通问题时保留权重、状态、优先级和测试样例', () => {
    const state = upgradeRuleModel(structuredClone(seedState));
    const item = state.knowledgeItems[0];
    const ordinary = getOrdinaryExpandedQuestions(item);
    const edited = [
      {
        ...ordinary[0],
        content: '帮我查一下最后还款日',
        enabled: false,
        priority: 80,
        weight: 1.4,
        status: 'in_review' as const,
        source: 'manual' as const,
        revision: 3,
        testExamples: ['帮我查一下最后还款日']
      }
    ];

    const synchronized = syncOrdinaryExpandedQuestionDefinitions(item, edited);
    const saved = synchronized.expandedQuestionDefinitions.find(
      (question) => question.id === edited[0].id
    );

    expect(synchronized.expandedQuestions).toEqual(['帮我查一下最后还款日']);
    expect(saved).toEqual(expect.objectContaining({
      enabled: false,
      priority: 80,
      weight: 1.4,
      status: 'in_review',
      source: 'manual',
      revision: 3,
      testExamples: ['帮我查一下最后还款日']
    }));
  });
});
