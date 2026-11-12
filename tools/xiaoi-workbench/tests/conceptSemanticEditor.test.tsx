import { fireEvent, render, screen } from '@testing-library/react';
import { ConceptSemanticEditor } from '../src/components/ConceptSemanticEditor';
import { seedState } from '../src/data/seed';

describe('业务概念语义块编辑', () => {
  it('保存真实语义块字段，不展示固定生成统计', () => {
    const onSave = vi.fn();
    render(
      <ConceptSemanticEditor
        concept={seedState.concepts[0]}
        referencedKnowledgeCount={2}
        referencedExpressionCount={1}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText('主语义块'), {
      target: { value: '[信用卡]' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存语义配置' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ semanticBlock: '[信用卡]' }));
    expect(screen.queryByText('新增 3')).not.toBeInTheDocument();
  });
});
