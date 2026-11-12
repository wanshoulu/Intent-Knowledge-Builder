import { Alert, Form, Input, Modal, Radio } from 'antd';
import { useEffect, useState } from 'react';
import type { LexiconClass } from '../domain/types';
import { validateNewLexicon } from '../domain/lexiconValidation';

interface QuickLexiconModalProps {
  open: boolean;
  lexicons: LexiconClass[];
  onCancel: () => void;
  onCreate: (lexicon: LexiconClass) => void;
}

export function QuickLexiconModal({
  open,
  lexicons,
  onCancel,
  onCreate
}: QuickLexiconModalProps) {
  const [name, setName] = useState('');
  const [standardTerm, setStandardTerm] = useState('');
  const [standardTermEdited, setStandardTermEdited] = useState(false);
  const [aliasesText, setAliasesText] = useState('');
  const [lexiconType, setLexiconType] =
    useState<NonNullable<LexiconClass['lexiconType']>>('general');
  const [confirmedWarning, setConfirmedWarning] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setStandardTerm('');
      setStandardTermEdited(false);
      setAliasesText('');
      setLexiconType('general');
      setConfirmedWarning(false);
    }
  }, [open]);

  const aliases = [
    ...new Set(
      aliasesText
        .split('\n')
        .map((alias) => alias.trim())
        .filter(Boolean)
    )
  ];
  const validation = validateNewLexicon(
    { name, standardTerm, aliases },
    lexicons
  );
  const create = () => {
    if (validation.blocking.length) return;
    if (validation.warnings.length && !confirmedWarning) {
      setConfirmedWarning(true);
      return;
    }
    onCreate({
      id: `lex-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      name: name.trim(),
      description: '从表达式编辑器快捷创建',
      standardTerm: standardTerm.trim(),
      aliases,
      dynamic: false,
      posType: 'other',
      weight: 1,
      status: 'draft',
      lexiconType
    });
  };

  return (
    <Modal
      title="新建业务词"
      open={open}
      okText={
        validation.warnings.length && !confirmedWarning
          ? '确认冲突并继续'
          : '创建并使用'
      }
      okButtonProps={{ disabled: validation.blocking.length > 0 }}
      onOk={create}
      onCancel={onCancel}
    >
      <Form layout="vertical">
        <Form.Item label="业务词名称" required>
          <Input
            aria-label="业务词名称"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!standardTermEdited) setStandardTerm(event.target.value);
              setConfirmedWarning(false);
            }}
          />
        </Form.Item>
        <Form.Item label="标准词" required>
          <Input
            aria-label="标准词"
            value={standardTerm}
            onChange={(event) => {
              setStandardTerm(event.target.value);
              setStandardTermEdited(true);
              setConfirmedWarning(false);
            }}
          />
        </Form.Item>
        <Form.Item label="常见说法" help="每行一个，可不填">
          <Input.TextArea
            aria-label="常见说法"
            rows={5}
            value={aliasesText}
            onChange={(event) => {
              setAliasesText(event.target.value);
              setConfirmedWarning(false);
            }}
          />
        </Form.Item>
        <Form.Item label="业务词类型">
          <Radio.Group
            value={lexiconType}
            onChange={(event) => setLexiconType(event.target.value)}
          >
            <Radio value="general">普通词</Radio>
            <Radio value="collection">集合词</Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
      {validation.blocking.length ? (
        <Alert type="error" showIcon message={validation.blocking.join('；')} />
      ) : null}
      {validation.warnings.length ? (
        <Alert
          type="warning"
          showIcon
          message={validation.warnings.join('；')}
          description={
            confirmedWarning
              ? '已确认冲突，再次点击“创建并使用”即可创建。'
              : '请先确认该重叠不会导致误识别。'
          }
        />
      ) : null}
    </Modal>
  );
}
