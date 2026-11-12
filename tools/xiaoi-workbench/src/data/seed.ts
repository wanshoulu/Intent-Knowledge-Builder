import type { WorkbenchState } from '../domain/types';

export const seedState: WorkbenchState = {
  evaluationPolicy: {
    requireServerRun: false,
    requireFullRun: true,
    forceRegression: true
  },
  context: {
    workspaceId: 'workspace-retail',
    workspaceName: '零售金融知识空间',
    projectId: 'bot-mobile-bank',
    projectName: '手机银行助手',
    channel: '手机银行',
    environment: 'production',
    releaseVersion: 'v2.1-p1'
  },
  knowledgeItems: [
    {
      id: 'ki-credit-repayment-date',
      name: '查询信用卡还款日',
      category: '还款服务',
      domain: '信用卡',
      scene: '账单查询',
      owner: '王敏',
      status: 'draft',
      draftVersion: 7,
      publishedVersion: 6,
      standardQuestion: '怎么查询我的信用卡还款日？',
      standardAnswer: '您可以登录手机银行，在“信用卡 > 账单”中查看账单日和到期还款日。',
      expandedQuestions: ['信用卡几号还款', '查一下信用卡还款日期', '我的还款日是哪天'],
      channels: ['手机银行', 'Web'],
      lexiconIds: ['lex-credit-card', 'lex-repayment-date'],
      expressionIds: ['exp-credit-repayment-date'],
      conceptTemplateIds: ['tpl-query-time'],
      actionIds: ['action-open-bill'],
      qualityScore: 86,
      issues: [
        { id: 'issue-channel', level: 'warning', message: '缺少微信渠道答案' },
        { id: 'issue-similar', level: 'warning', message: '2 条相似问法相似度较高' },
        { id: 'issue-regression', level: 'info', message: '最近回归 18/20 通过' }
      ],
      updatedAt: '2026-07-25 10:28',
      targetType: 'faq',
      intentCode: 'faq_credit_repayment_date',
      answerVariants: [
        {
          id: 'answer-credit-mobile',
          channel: '手机银行',
          content: '您可以登录手机银行，在“信用卡 > 账单”中查看账单日和到期还款日。',
          actionIds: ['action-open-bill']
        },
        {
          id: 'answer-credit-web',
          channel: 'Web',
          content: '请登录个人网银，在信用卡账单页面查看到期还款日。',
          actionIds: []
        }
      ],
      slots: [],
      positiveExpressionIds: ['exp-credit-repayment-date'],
      negativeExpressionIds: ['exp-credit-repayment-negative'],
      matchThreshold: 0.58
    },
    {
      id: 'ki-payroll-detail',
      name: '咨询工资单详情',
      category: '电子工资单',
      domain: '财富管理',
      scene: '工资单详情',
      owner: '李倩',
      status: 'published',
      draftVersion: 4,
      publishedVersion: 4,
      standardQuestion: '如何查看工资单详情？',
      standardAnswer: '进入“首页 > 常用 > 电子工资单 > 工资单详情”即可查看。',
      expandedQuestions: ['工资单详情怎么查', '查看实发金额', '工资条扣款明细'],
      channels: ['手机银行', 'Web', '微信'],
      lexiconIds: ['lex-payroll'],
      expressionIds: [],
      conceptTemplateIds: ['tpl-detail-query'],
      actionIds: ['action-open-payroll'],
      qualityScore: 96,
      issues: [],
      updatedAt: '2026-07-24 18:06',
      targetType: 'faq',
      intentCode: 'faq_payroll_detail',
      answerVariants: [
        {
          id: 'answer-payroll-mobile',
          channel: '手机银行',
          content: '进入“首页 > 常用 > 电子工资单 > 工资单详情”即可查看。',
          actionIds: ['action-open-payroll']
        }
      ],
      slots: [],
      positiveExpressionIds: ['exp-payroll-detail'],
      negativeExpressionIds: [],
      matchThreshold: 0.58
    },
    {
      id: 'ki-branch-appointment',
      name: '查询时间预约',
      category: '时间预约',
      domain: '网点服务',
      scene: '预约查询',
      owner: '赵晨',
      status: 'in_review',
      draftVersion: 2,
      publishedVersion: 1,
      standardQuestion: '怎么查询网点预约时间？',
      standardAnswer: '进入网点服务的预约记录页面，可以查看已预约时间。',
      expandedQuestions: ['查时间预约', '预约时间在哪里看', '看看我的网点预约'],
      channels: ['手机银行'],
      lexiconIds: ['lex-appointment-time'],
      expressionIds: ['exp-appointment-query'],
      conceptTemplateIds: [],
      actionIds: ['action-open-appointment'],
      qualityScore: 90,
      issues: [{ id: 'issue-action', level: 'info', message: '建议绑定预约记录跳转动作' }],
      updatedAt: '2026-07-25 09:42',
      targetType: 'task',
      intentCode: 'query_branch_appointment',
      answerVariants: [
        {
          id: 'answer-appointment-mobile',
          channel: '手机银行',
          content: '正在为您打开网点预约记录。',
          actionIds: ['action-open-appointment']
        }
      ],
      slots: [
        {
          id: 'slot-appointment-time',
          name: 'appointment_time',
          lexiconId: 'lex-datetime',
          required: true,
          clarificationQuestion: '请问您想预约什么时间？'
        }
      ],
      positiveExpressionIds: ['exp-appointment-query'],
      negativeExpressionIds: [],
      matchThreshold: 0.58
    }
  ],
  lexicons: [
    {
      id: 'lex-credit-card',
      name: '信用卡',
      description: '信用卡业务对象词类',
      standardTerm: '信用卡',
      aliases: ['贷记卡', '信用咔', 'credit card'],
      dynamic: false,
      posType: 'noun',
      weight: 1.2,
      status: 'published'
    },
    {
      id: 'lex-repayment-date',
      name: '还款时间',
      description: '还款日及其常见表达',
      standardTerm: '还款日',
      aliases: ['还款日期', '几号还款', '到期还款日'],
      dynamic: false,
      posType: 'noun',
      weight: 1,
      status: 'draft'
    },
    {
      id: 'lex-appointment-time',
      name: '预约时间',
      description: '网点预约时间表达',
      standardTerm: '预约时间',
      aliases: ['时间预约', '预约日期'],
      dynamic: true,
      posType: 'noun',
      weight: 1,
      status: 'published'
    },
    {
      id: 'lex-query-action',
      name: '查询动作',
      description: '查询、查看和了解等动作表达',
      standardTerm: '查询',
      aliases: ['查', '查询', '查看', '看看', '了解'],
      dynamic: false,
      posType: 'verb',
      weight: 0.8,
      status: 'published',
      lexiconType: 'general'
    },
    {
      id: 'lex-negative',
      name: '否定',
      description: '用于排除知识目标的否定表达',
      standardTerm: '不',
      aliases: ['不', '不要', '不想', '别'],
      dynamic: false,
      posType: 'other',
      weight: 1,
      status: 'published',
      lexiconType: 'general'
    },
    {
      id: 'lex-branch',
      name: '网点',
      description: '银行营业网点及常用表达',
      standardTerm: '网点',
      aliases: ['网点', '营业厅', '银行网点'],
      dynamic: false,
      posType: 'noun',
      weight: 1.1,
      status: 'published',
      lexiconType: 'general'
    },
    {
      id: 'lex-appointment',
      name: '预约',
      description: '预约业务动作',
      standardTerm: '预约',
      aliases: ['预约', '预定'],
      dynamic: false,
      posType: 'verb',
      weight: 1,
      status: 'published',
      lexiconType: 'general'
    },
    {
      id: 'lex-datetime',
      name: '时间',
      description: '日期与相对时间动态词',
      standardTerm: '时间',
      aliases: [],
      dynamic: true,
      posType: 'noun',
      weight: 1,
      status: 'published',
      lexiconType: 'dynamic',
      pattern: '(今天|明天|后天|本周[一二三四五六日天]?|下周[一二三四五六日天]?|\\d{1,2}月\\d{1,2}日)(上午|下午|晚上|早上)?',
      examples: ['明天下午', '7月28日上午']
    },
    {
      id: 'lex-payroll',
      name: '工资单',
      description: '工资单、工资条等表达',
      standardTerm: '工资单',
      aliases: ['工资单', '工资条', '薪资单'],
      dynamic: false,
      posType: 'noun',
      weight: 1.2,
      status: 'published',
      lexiconType: 'general'
    },
    {
      id: 'lex-deduction',
      name: '扣款',
      description: '工资扣款及扣除表达',
      standardTerm: '扣款',
      aliases: ['扣款', '扣了', '扣除'],
      dynamic: false,
      posType: 'noun',
      weight: 1,
      status: 'published',
      lexiconType: 'general'
    }
  ],
  expressions: [
    {
      id: 'exp-credit-repayment-date',
      name: '信用卡还款日查询',
      dsl: '&[信用卡][还款时间][查询动作?]',
      visualSummary: '信用卡 + 还款时间 + 可选查询动作',
      lexiconIds: ['lex-credit-card', 'lex-repayment-date'],
      knowledgeItemIds: ['ki-credit-repayment-date'],
      priority: 100,
      status: 'draft',
      polarity: 'positive',
      testExamples: ['查一下信用卡还款日期', '我的信用卡几号还款']
    },
    {
      id: 'exp-credit-repayment-negative',
      name: '排除信用卡还款日查询',
      dsl: '[否定][查询动作?][信用卡][还款时间]',
      visualSummary: '否定 + 信用卡 + 还款时间',
      lexiconIds: ['lex-negative', 'lex-query-action', 'lex-credit-card', 'lex-repayment-date'],
      knowledgeItemIds: ['ki-credit-repayment-date'],
      priority: 120,
      status: 'published',
      polarity: 'negative',
      testExamples: ['我不想查询信用卡还款日期']
    },
    {
      id: 'exp-appointment-query',
      name: '预约时间查询',
      dsl: '&[网点][预约][时间?]',
      visualSummary: '网点 + 预约 + 可选时间',
      lexiconIds: ['lex-branch', 'lex-appointment', 'lex-datetime'],
      knowledgeItemIds: ['ki-branch-appointment'],
      priority: 90,
      status: 'published',
      polarity: 'positive',
      testExamples: ['查询明天下午的网点预约', '我要预约网点']
    },
    {
      id: 'exp-payroll-detail',
      name: '工资单详情查询',
      dsl: '&[工资单][扣款?]',
      visualSummary: '工资单 + 可选扣款',
      lexiconIds: ['lex-payroll', 'lex-deduction'],
      knowledgeItemIds: ['ki-payroll-detail'],
      priority: 90,
      status: 'published',
      polarity: 'positive',
      testExamples: ['工资条里面为什么扣了这笔钱']
    }
  ],
  concepts: [
    {
      id: 'concept-time-query',
      name: '时间查询类',
      description: '面向账单日、还款日、预约时间等业务时间的查询模型',
      attributes: [
        { id: 'attr-object', name: '业务对象', dataType: 'text', required: true },
        { id: 'attr-time-type', name: '时间类型', dataType: 'text', required: true }
      ],
      instanceCount: 8,
      status: 'published'
    },
    {
      id: 'concept-detail-query',
      name: '详情查询类',
      description: '面向账单、工资单和交易详情的查询模型',
      attributes: [
        { id: 'attr-detail-object', name: '详情对象', dataType: 'text', required: true }
      ],
      instanceCount: 12,
      status: 'draft'
    }
  ],
  templates: [
    {
      id: 'tpl-query-time',
      conceptId: 'concept-time-query',
      name: '查询业务时间',
      questionTemplate: '怎么查询{业务对象}的{时间类型}？',
      answerTemplate: '您可以进入{业务对象}页面查看{时间类型}。',
      status: 'published'
    },
    {
      id: 'tpl-detail-query',
      conceptId: 'concept-detail-query',
      name: '查询业务详情',
      questionTemplate: '如何查看{详情对象}详情？',
      answerTemplate: '进入{详情对象}页面即可查看详情。',
      status: 'draft'
    }
  ],
  actions: [
    {
      id: 'action-open-bill',
      name: '打开信用卡账单',
      type: 'navigation',
      actionCode: 'open_credit_card_bill',
      payload: { path: '/credit-card/bill' },
      channels: ['手机银行'],
      status: 'published'
    },
    {
      id: 'action-open-payroll',
      name: '打开工资单详情',
      type: 'navigation',
      actionCode: 'open_payroll_detail',
      payload: { path: '/wealth/payroll/detail' },
      channels: ['手机银行', 'Web'],
      status: 'published'
    },
    {
      id: 'action-open-appointment',
      name: '打开网点预约',
      type: 'navigation',
      actionCode: 'open_branch_appointment',
      payload: {
        path: '/branch/appointment?appointment_time={appointment_time}'
      },
      inputMappings: [
        {
          parameter: 'appointment_time',
          source: 'slot',
          sourceKey: 'appointment_time',
          required: true
        }
      ],
      channels: ['手机银行'],
      status: 'published'
    }
  ],
  changeSets: [
    {
      id: 'cs-credit-repayment',
      title: '优化信用卡还款日问法覆盖',
      businessReason: '未命中样本集中出现“几号还款”表达',
      objectRefs: ['ki-credit-repayment-date', 'lex-repayment-date', 'exp-credit-repayment-date'],
      riskLevel: 'medium',
      status: 'draft',
      owner: '王敏',
      gates: {
        requiredFieldsComplete: true,
        referencesValid: true,
        blockingConflicts: 0,
        regressionPassed: false,
        reviewApproved: false
      },
      updatedAt: '2026-07-25 10:32'
    }
  ],
  evaluationRuns: [
    {
      id: 'run-regression-0725',
      name: '手机银行核心问答回归',
      targetVersion: 'v2.1-p1',
      passed: 184,
      failed: 11,
      status: 'failed',
      completedAt: '2026-07-25 09:18'
    }
  ],
  tickets: [
    {
      id: 'ticket-credit-date',
      query: '我的信用卡到底几号要还钱',
      findingType: 'miss',
      relatedObjectIds: ['ki-credit-repayment-date', 'exp-credit-repayment-date'],
      assignee: '王敏',
      status: 'fixing',
      source: '线上未命中',
      createdAt: '2026-07-25 08:54',
      resolutionChangeSetId: 'cs-credit-repayment'
    },
    {
      id: 'ticket-payroll-deduction',
      query: '工资条里面为什么扣了这笔钱',
      findingType: 'answer_error',
      relatedObjectIds: ['ki-payroll-detail'],
      assignee: '李倩',
      status: 'assigned',
      source: '业务反馈',
      createdAt: '2026-07-24 16:20'
    }
  ],
  migrationNotes: [],
  categories: [
    { id: 'cat-root', name: '全部知识', sortOrder: 0 },
    { id: 'cat-credit', name: '信用卡', parentId: 'cat-root', targetType: 'faq', sortOrder: 10 },
    { id: 'cat-wealth', name: '财富管理', parentId: 'cat-root', targetType: 'faq', sortOrder: 20 },
    { id: 'cat-branch', name: '网点服务', parentId: 'cat-root', targetType: 'task', sortOrder: 30 }
  ],
  preprocessRules: [
    { id: 'pre-prefix', type: 'prefix', pattern: '^(请问|麻烦问一下|我想了解一下)', enabled: true },
    { id: 'pre-stopword', type: 'stopword', pattern: '的', enabled: true }
  ],
  engineProfile: {
    answerThreshold: 0.58,
    suggestionThreshold: 0.35,
    ambiguityDelta: 0.08,
    defaultReply: '抱歉，当前知识库中没有找到可以确定回答的内容。'
  }
};
