import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Input, Space, Tag } from 'antd';
import { useState } from 'react';

type ConditionValue = string | string[];
type ConditionRecord = Record<string, ConditionValue>;

interface ConditionRow {
  id: string;
  key: string;
  value: string;
}

interface ConditionRecordEditorProps {
  value?: ConditionRecord;
  onChange: (value: ConditionRecord) => void;
  addButtonLabel: string;
  nameLabel: string;
  valueLabel: string;
  commonKeys?: Array<{ key: string; label: string }>;
  multipleValues?: boolean;
  initialEmptyRows?: number;
}

let rowSequence = 0;

function createRow(key = '', value: ConditionValue = ''): ConditionRow {
  rowSequence += 1;
  return {
    id: `condition-row-${rowSequence}`,
    key,
    value: Array.isArray(value) ? value.join(',') : value
  };
}

function rowsFromValue(
  value: ConditionRecord | undefined,
  initialEmptyRows: number
) {
  const rows = Object.entries(value ?? {}).map(([key, item]) =>
    createRow(key, item)
  );
  while (rows.length < initialEmptyRows) rows.push(createRow());
  return rows;
}

function compileRows(rows: ConditionRow[], multipleValues: boolean) {
  return Object.fromEntries(
    rows.flatMap((row) => {
      const key = row.key.trim();
      const values = row.value
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (!key || !values.length) return [];
      return [[
        key,
        multipleValues && values.length > 1 ? values : values[0]
      ]];
    })
  );
}

export function ConditionRecordEditor({
  value,
  onChange,
  addButtonLabel,
  nameLabel,
  valueLabel,
  commonKeys = [],
  multipleValues = true,
  initialEmptyRows = 0
}: ConditionRecordEditorProps) {
  const [rows, setRows] = useState(() =>
    rowsFromValue(value, initialEmptyRows)
  );

  const updateRows = (nextRows: ConditionRow[]) => {
    setRows(nextRows);
    onChange(compileRows(nextRows, multipleValues));
  };

  return (
    <div className="condition-record-editor">
      {rows.map((row, index) => (
        <div className="condition-record-row" key={row.id}>
          <div>
            <Input
              aria-label={`${nameLabel} ${index + 1}`}
              value={row.key}
              placeholder="选择下方常用项，或填写自定义条件名"
              onChange={(event) =>
                updateRows(
                  rows.map((item) =>
                    item.id === row.id
                      ? { ...item, key: event.target.value }
                      : item
                  )
                )
              }
            />
            {commonKeys.length ? (
              <Space size={[4, 4]} wrap className="condition-key-suggestions">
                {commonKeys.map((item) => (
                  <Tag
                    key={item.key}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      updateRows(
                        rows.map((candidate) =>
                          candidate.id === row.id
                            ? { ...candidate, key: item.key }
                            : candidate
                        )
                      )
                    }
                  >
                    {item.label}
                  </Tag>
                ))}
              </Space>
            ) : null}
          </div>
          <Input
            aria-label={`${valueLabel} ${index + 1}`}
            value={row.value}
            placeholder={
              multipleValues
                ? '填写允许值，多个值用逗号分隔'
                : '填写本次调试值'
            }
            onChange={(event) =>
              updateRows(
                rows.map((item) =>
                  item.id === row.id
                    ? { ...item, value: event.target.value }
                    : item
                )
              )
            }
          />
          <Button
            type="text"
            danger
            aria-label={`删除${nameLabel} ${index + 1}`}
            icon={<DeleteOutlined />}
            onClick={() =>
              updateRows(rows.filter((item) => item.id !== row.id))
            }
          />
        </div>
      ))}
      <Button
        size="small"
        aria-label={addButtonLabel}
        icon={<PlusOutlined />}
        onClick={() => updateRows([...rows, createRow()])}
      >
        {addButtonLabel}
      </Button>
    </div>
  );
}
