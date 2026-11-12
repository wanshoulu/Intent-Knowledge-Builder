import {
  exportEvaluationSamples,
  parseEvaluationSamples
} from '../src/domain/evaluationCsv';

describe('evaluation CSV import and export', () => {
  it('parses valid rows and preserves structured conditions', () => {
    const csv = [
      'query,expected_decision,expected_knowledge_point_id,expected_answer_contains,expected_action_ids,channel,category,dimensions_json,context_json,tags',
      '"帮我约一下明天下午的网点",matched,ki-branch-appointment,预约,action-open-appointment,手机银行,网点服务,"{""region"":""上海""}","{""scene"":""appointment""}","核心,网点"'
    ].join('\n');

    const result = parseEvaluationSamples(csv, new Set([
      'ki-branch-appointment'
    ]));

    expect(result.errors).toEqual([]);
    expect(result.samples[0]).toMatchObject({
      query: '帮我约一下明天下午的网点',
      expectedDecision: 'matched',
      expectedKnowledgePointId: 'ki-branch-appointment',
      expectedActionIds: ['action-open-appointment'],
      dimensions: { region: '上海' },
      context: { scene: 'appointment' }
    });
    expect(
      exportEvaluationSamples(result.samples)
    ).toContain('expected_knowledge_point_id');
  });

  it('reports every invalid row without returning partial samples', () => {
    const csv = [
      'query,expected_decision,expected_knowledge_point_id,dimensions_json',
      '问题一,unknown,ki-known,{}',
      '问题二,matched,ki-missing,"{bad}"'
    ].join('\n');

    const result = parseEvaluationSamples(csv, new Set(['ki-known']));

    expect(result.samples).toEqual([]);
    expect(result.errors).toEqual([
      expect.stringContaining('第 2 行'),
      expect.stringContaining('第 3 行')
    ]);
  });
});
