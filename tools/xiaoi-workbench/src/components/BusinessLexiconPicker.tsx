import { PlusOutlined } from '@ant-design/icons';
import { Button, Select, Space, Tag } from 'antd';
import { useState } from 'react';
import type { LexiconClass } from '../domain/types';
import { QuickLexiconModal } from './QuickLexiconModal';

interface BusinessLexiconPickerProps {
  ariaLabel: string;
  value: string[];
  lexicons: LexiconClass[];
  placeholder: string;
  onChange: (value: string[]) => void;
  onCreateLexicon?: (lexicon: LexiconClass) => void;
}

export function BusinessLexiconPicker({
  ariaLabel,
  value,
  lexicons,
  placeholder,
  onChange,
  onCreateLexicon
}: BusinessLexiconPickerProps) {
  const [creating, setCreating] = useState(false);
  const options = lexicons
    .filter(
      (lexicon) => lexicon.status !== 'disabled' && lexicon.status !== 'archived'
    )
    .map((lexicon) => ({
      value: lexicon.id,
      label: lexicon.name,
      searchText: [
        lexicon.name,
        lexicon.standardTerm,
        ...lexicon.aliases
      ].join(' '),
      title: `${lexicon.standardTerm}；常见说法：${lexicon.aliases.join('、') || '无'}`
    }));

  return (
    <>
      <Space.Compact block>
        <Select
          aria-label={ariaLabel}
          mode="multiple"
          showSearch
          value={value}
          placeholder={placeholder}
          optionFilterProp="searchText"
          options={options}
          tagRender={({ label, closable, onClose }) => (
            <Tag closable={closable} onClose={onClose} className="business-word-tag">
              {label}
            </Tag>
          )}
          onChange={onChange}
        />
        {onCreateLexicon ? (
          <Button
            aria-label="新建业务词"
            icon={<PlusOutlined />}
            onClick={() => setCreating(true)}
          />
        ) : null}
      </Space.Compact>
      {onCreateLexicon ? (
        <QuickLexiconModal
          open={creating}
          lexicons={lexicons}
          onCancel={() => setCreating(false)}
          onCreate={(lexicon) => {
            onCreateLexicon(lexicon);
            onChange([...new Set([...value, lexicon.id])]);
            setCreating(false);
          }}
        />
      ) : null}
    </>
  );
}
