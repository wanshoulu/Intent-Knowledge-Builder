export type ParsedCompatibilityInstruction = {
  type: 'related_question' | 'recommended_question' | 'menu' | 'command' | 'unparsed';
  targets: string[];
  rawText: string;
};

const TYPES = { rq: 'related_question', ro: 'recommended_question', nenu: 'menu', menu: 'menu' } as const;

export function parseCompatibilityInstruction(rawText: string): ParsedCompatibilityInstruction {
  const match = rawText.trim().match(/^([a-zA-Z]+)[（(]([^）)]+)[）)]\s*[；;]?$/);
  if (!match) return { type: 'unparsed', targets: [], rawText };
  const type = TYPES[match[1].toLowerCase() as keyof typeof TYPES];
  if (!type) return { type: 'unparsed', targets: [], rawText };
  return {
    type,
    targets: match[2].split(/[,，、]/).map((value) => value.trim()).filter(Boolean),
    rawText
  };
}
