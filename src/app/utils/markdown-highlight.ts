const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (ch) => ESCAPES[ch]);
}

function span(className: string, content: string): string {
  return `<span class="syn-${className}">${content}</span>`;
}

const INLINE_PATTERN =
  /(`[^`\n]+`)|(!\[[^\]\n]*]\([^)\n]*\))|(\[[^\]\n]*]\([^)\n]*\))|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(__[^_\n]+__)|(_[^_\n]+_)|(~~[^~\n]+~~)|(\\\\.)/g;

function delimiters(match: string, delimiter: string, className: string): string {
  return span('punct', delimiter) + match + span('punct', delimiter);
}

function highlightInline(text: string): string {
  return escapeHtml(text).replace(
    INLINE_PATTERN,
    (
      raw,
      code?: string,
      image?: string,
      link?: string,
      boldStar?: string,
      emStar?: string,
      boldUnderscore?: string,
      emUnderscore?: string,
      strike?: string,
      escape?: string,
    ) => {
      if (code !== undefined) {
        return span('code', delimiters(code.slice(1, -1), '`', 'punct'));
      }
      if (image !== undefined) {
        const m = /^!\[([^\]\n]*)]\(([^)\n]*)\)$/.exec(image)!;
        return (
          span('punct', '!') +
          span('punct', '[') +
          highlightInline(m[1]) +
          span('punct', '](') +
          span('link', m[2]) +
          span('punct', ')')
        );
      }
      if (link !== undefined) {
        const m = /^\[([^\]\n]*)]\(([^)\n]*)\)$/.exec(link)!;
        return (
          span('punct', '[') +
          highlightInline(m[1]) +
          span('punct', '](') +
          span('link', m[2]) +
          span('punct', ')')
        );
      }
      if (boldStar !== undefined || boldUnderscore !== undefined) {
        const text = (boldStar ?? boldUnderscore)!.slice(2, -2);
        return span('strong', delimiters(text, '**', 'punct'));
      }
      if (emStar !== undefined || emUnderscore !== undefined) {
        const text = (emStar ?? emUnderscore)!.slice(1, -1);
        return span('em', delimiters(text, '*', 'punct'));
      }
      if (strike !== undefined) {
        return span('del', delimiters(strike.slice(2, -2), '~~', 'punct'));
      }
      if (escape !== undefined) {
        return span('escape', raw);
      }
      return raw;
    },
  );
}

const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;
const HR = /^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})\s*$/;
const SETEXT = /^\s*(?:=+|-{3,})\s*$/;
const HEADING = /^\s*(#{1,6})(\s*)(.*)$/;
const TASK = /^\s*([-*+])\s+\[( |x|X)\]\s+(.*)$/;
const LIST = /^\s*([-*+]|\d+\.)\s+(.*)$/;
const QUOTE = /^(\s*>+\s?)(.*)$/;
const FENCE = /^\s*(`{3,}|~{3,})\s*([^\s`]*)?/;
const INDENTED_CODE = /^(?: {4}|\t)/;

function renderTable(rows: string[]): string {
  const renderRow = (row: string, header = false): string => {
    const parts = row.split('|');
    let html = '';
    for (let k = 0; k < parts.length; k++) {
      const cell = escapeHtml(parts[k]);
      const isLast = k === parts.length - 1;
      if (header && cell.trim() !== '') {
        html += span('heading', cell);
      } else if (!header && /^:?-+:?$/.test(parts[k].trim())) {
        html += span('punct', cell);
      } else {
        html += cell;
      }
      if (!isLast) {
        html += span('punct', '|');
      }
    }
    return html;
  };

  const [head, sep, ...body] = rows;
  return [renderRow(head, true), renderRow(sep), ...body.map((row) => renderRow(row))].join('\n');
}

export function highlightMarkdown(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = FENCE.exec(line);
    if (fence && !INDENTED_CODE.test(line)) {
      const marker = fence[1];
      const closeRe = new RegExp(`^\\s*${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`);
      const block: string[] = [line];
      let j = i + 1;
      while (j < lines.length && !closeRe.test(lines[j])) {
        block.push(lines[j]);
        j++;
      }
      if (j < lines.length) {
        block.push(lines[j]);
      }
      const lang = fence[2] ? span('code', escapeHtml(fence[2])) : '';
      const body = block.slice(1).map(escapeHtml).join('\n');
      out.push(span('code-block', span('punct', marker) + lang + '\n' + body));
      i = j + 1;
      continue;
    }

    if (HR.test(line)) {
      out.push(span('hr', escapeHtml(line)));
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      out.push(
        span('heading', span('punct', heading[1]) + heading[2] + highlightInline(heading[3])),
      );
      i++;
      continue;
    }

    const nextLine = lines[i + 1] ?? '';
    if (line.trim() !== '' && SETEXT.test(nextLine) && line !== nextLine) {
      out.push(span('heading', highlightInline(line)));
      i += 2;
      continue;
    }

    if (line.includes('|') && TABLE_SEP.test(nextLine)) {
      const table: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        table.push(lines[i]);
        i++;
      }
      out.push(renderTable(table));
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        const q = QUOTE.exec(lines[i])!;
        quote.push(span('blockquote', escapeHtml(q[1].trim()) + ' ' + highlightInline(q[2])));
        i++;
      }
      out.push(quote.join('\n'));
      continue;
    }

    const task = TASK.exec(line);
    if (task) {
      const cls = task[2] === ' ' ? 'task-pending' : 'task-done';
      out.push(
        span('punct', task[1]) +
          ' ' +
          span(cls, '[' + task[2] + ']') +
          ' ' +
          highlightInline(task[3]),
      );
      i++;
      continue;
    }

    const list = LIST.exec(line);
    if (list) {
      out.push(span('punct', list[1]) + ' ' + highlightInline(list[2]));
      i++;
      continue;
    }

    if (INDENTED_CODE.test(line)) {
      const block: string[] = [];
      while (i < lines.length && (INDENTED_CODE.test(lines[i]) || lines[i].trim() === '')) {
        block.push(lines[i]);
        i++;
      }
      out.push(span('code-block', block.map(escapeHtml).join('\n')));
      continue;
    }

    if (/^\s*$/.test(line)) {
      out.push('');
      i++;
      continue;
    }

    out.push(highlightInline(line));
    i++;
  }

  return out.join('\n');
}
