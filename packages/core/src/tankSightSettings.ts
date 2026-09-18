const SETTINGS_HEADER = /\btankSightSettings\s*\{/;
const CROSSHAIR_LINE = /^crosshair:t\s*=\s*"([^"]*)"/;

type NamedBlkBlock = {
  name: string;
  nameStart: number;
  open: number;
  close: number;
};

function newlineOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function indentBefore(text: string, index: number): string {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  const prefix = text.slice(lineStart, index);
  return /^\s*/.exec(prefix)?.[0] ?? "";
}

function skipLineComment(text: string, index: number, end: number): number | null {
  if (text.startsWith("//", index) || text[index] === "#") {
    const nl = text.indexOf("\n", index);
    return nl === -1 || nl >= end ? end : nl + 1;
  }
  return null;
}

function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  for (let i = openIndex; i < text.length; i++) {
    if (!inString) {
      const skipped = skipLineComment(text, i, text.length);
      if (skipped !== null) {
        i = skipped - 1;
        continue;
      }
    }
    const char = text[i];
    if (inString) {
      if (char === "\\" && i + 1 < text.length) {
        i += 1;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function readIdent(text: string, index: number, end: number): string | null {
  if (index >= end) {
    return null;
  }
  const first = text[index];
  if (!first || !/[A-Za-z_]/.test(first)) {
    return null;
  }
  let i = index + 1;
  while (i < end && /[A-Za-z0-9_]/.test(text[i] ?? "")) {
    i += 1;
  }
  return text.slice(index, i);
}

function findBlkBlock(text: string, header: RegExp): NamedBlkBlock | null {
  const match = header.exec(text);
  if (!match) {
    return null;
  }
  const open = match.index + match[0].length - 1;
  const close = findMatchingBrace(text, open);
  if (close < 0) {
    return null;
  }
  return {
    name: "tankSightSettings",
    nameStart: match.index,
    open,
    close,
  };
}

function parseNamedBlocks(text: string, bodyStart: number, bodyEnd: number): NamedBlkBlock[] {
  const blocks: NamedBlkBlock[] = [];
  let i = bodyStart;
  while (i < bodyEnd) {
    const skipped = skipLineComment(text, i, bodyEnd);
    if (skipped !== null) {
      i = skipped;
      continue;
    }
    const char = text[i];
    if (!char || /\s/.test(char)) {
      i += 1;
      continue;
    }
    const name = readIdent(text, i, bodyEnd);
    if (!name) {
      i += 1;
      continue;
    }
    const nameStart = i;
    let j = i + name.length;
    while (j < bodyEnd && /\s/.test(text[j] ?? "")) {
      j += 1;
    }
    if (text[j] !== "{") {
      i = j;
      continue;
    }
    const close = findMatchingBrace(text, j);
    if (close < 0 || close >= bodyEnd) {
      break;
    }
    blocks.push({ name, nameStart, open: j, close });
    i = close + 1;
  }
  return blocks;
}

function findTopLevelCrosshair(
  text: string,
  open: number,
  close: number,
): { start: number; end: number; value: string } | null {
  let depth = 0;
  let inString = false;
  for (let i = open + 1; i < close; i++) {
    if (!inString) {
      const skipped = skipLineComment(text, i, close);
      if (skipped !== null) {
        i = skipped - 1;
        continue;
      }
    }
    const char = text[i];
    if (inString) {
      if (char === "\\" && i + 1 < close) {
        i += 1;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && text.startsWith("crosshair:t", i)) {
      const match = CROSSHAIR_LINE.exec(text.slice(i, close));
      if (match) {
        return { start: i, end: i + match[0].length, value: match[1] ?? "" };
      }
    }
  }
  return null;
}

export function parseTankCrosshairs(text: string): Map<string, string> {
  const settings = findBlkBlock(text, SETTINGS_HEADER);
  const result = new Map<string, string>();
  if (!settings) {
    return result;
  }
  for (const block of parseNamedBlocks(text, settings.open + 1, settings.close)) {
    const crosshair = findTopLevelCrosshair(text, block.open, block.close);
    if (crosshair) {
      result.set(block.name, crosshair.value);
    }
  }
  return result;
}

function childIndentFor(text: string, settings: NamedBlkBlock, tanks: NamedBlkBlock[]): string {
  if (tanks[0]) {
    return indentBefore(text, tanks[0].nameStart);
  }
  return `${indentBefore(text, settings.nameStart)}  `;
}

function fieldIndentFor(text: string, tanks: NamedBlkBlock[], childIndent: string): string {
  const first = tanks[0];
  if (first) {
    const crosshair = findTopLevelCrosshair(text, first.open, first.close);
    if (crosshair) {
      return indentBefore(text, crosshair.start);
    }
  }
  return `${childIndent}  `;
}

function insertCrosshairLine(
  text: string,
  tank: NamedBlkBlock,
  sightName: string,
  fieldIndent: string,
  nl: string,
): string {
  const line = `${nl}${fieldIndent}crosshair:t="${sightName}"`;
  if (text[tank.open + 1] === "}") {
    const tankIndent = indentBefore(text, tank.nameStart);
    return `${text.slice(0, tank.open + 1)}${line}${nl}${tankIndent}${text.slice(tank.open + 1)}`;
  }
  return `${text.slice(0, tank.open + 1)}${line}${text.slice(tank.open + 1)}`;
}

function insertTankBlock(
  text: string,
  settings: NamedBlkBlock,
  unitId: string,
  sightName: string,
  childIndent: string,
  fieldIndent: string,
  nl: string,
): string {
  const block = `${childIndent}${unitId}{${nl}${fieldIndent}crosshair:t="${sightName}"${nl}${childIndent}}`;
  let lineStart = settings.close;
  while (lineStart > 0 && text[lineStart - 1] !== "\n") {
    lineStart -= 1;
  }
  const prefix = text.slice(0, lineStart);
  const gap = prefix.endsWith(nl) || prefix.endsWith("\n") ? "" : nl;
  return `${prefix}${gap}${block}${nl}${text.slice(lineStart)}`;
}

export function setTankCrosshair(text: string, unitId: string, sightName: string): string {
  const settings = findBlkBlock(text, SETTINGS_HEADER);
  if (!settings) {
    throw new Error("tankSightSettings block not found in global.blk");
  }
  const tanks = parseNamedBlocks(text, settings.open + 1, settings.close);
  const existing = tanks.find((block) => block.name === unitId);
  const nl = newlineOf(text);
  const childIndent = childIndentFor(text, settings, tanks);
  const fieldIndent = fieldIndentFor(text, tanks, childIndent);
  if (!existing) {
    return insertTankBlock(text, settings, unitId, sightName, childIndent, fieldIndent, nl);
  }
  const crosshair = findTopLevelCrosshair(text, existing.open, existing.close);
  if (crosshair) {
    return `${text.slice(0, crosshair.start)}crosshair:t="${sightName}"${text.slice(crosshair.end)}`;
  }
  return insertCrosshairLine(text, existing, sightName, fieldIndent, nl);
}
