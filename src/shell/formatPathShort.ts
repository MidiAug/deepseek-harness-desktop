/** UI 展示用路径缩写（真路径不变；仅缩短 Roaming / 用户目录等前缀）。 */

export type PathConflictDisplay = {
  /** 被占用的目录名或短路径 */
  from: string;
  /** 建议改用目录名或短路径 */
  to: string;
  /** 共同父级缩写，如 %APPDATA% */
  context?: string;
};

export type PathDisplayParts = {
  /** 环境变量式前缀，如 %APPDATA% */
  prefix?: string;
  /** 前缀后的路径段 */
  segments: string[];
};

function normalizeSeparators(path: string): string {
  return path.trim().replace(/\//g, "\\");
}

/** 将绝对路径缩写为 %APPDATA%、~ 等（Windows 优先）。 */
export function shortenPathForDisplay(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return path;

  const macHome = trimmed.match(/^\/Users\/[^/]+\/(.*)$/);
  if (macHome) {
    const tail = macHome[1];
    return tail ? `~/${tail}` : "~";
  }

  const linuxHome = trimmed.match(/^\/home\/[^/]+\/(.*)$/);
  if (linuxHome) {
    const tail = linuxHome[1];
    return tail ? `~/${tail}` : "~";
  }

  const normalized = trimmed.replace(/\//g, "\\");

  if (/^[A-Za-z]:\\Users\\[^\\]+\\AppData\\Roaming$/i.test(normalized)) {
    return "%APPDATA%";
  }
  if (/^[A-Za-z]:\\Users\\[^\\]+\\AppData\\Local$/i.test(normalized)) {
    return "%LOCALAPPDATA%";
  }

  const roaming = normalized.match(
    /^[A-Za-z]:\\Users\\[^\\]+\\AppData\\Roaming\\(.*)$/i,
  );
  if (roaming) {
    const tail = roaming[1];
    return tail ? `%APPDATA%\\${tail}` : "%APPDATA%";
  }

  const local = normalized.match(
    /^[A-Za-z]:\\Users\\[^\\]+\\AppData\\Local\\(.*)$/i,
  );
  if (local) {
    const tail = local[1];
    return tail ? `%LOCALAPPDATA%\\${tail}` : "%LOCALAPPDATA%";
  }

  const winHome = normalized.match(/^[A-Za-z]:\\Users\\[^\\]+\\(.*)$/i);
  if (winHome) {
    const tail = winHome[1];
    return tail ? `~\\${tail}` : "~";
  }

  return normalized;
}

/** 路径冲突提示：同父目录时只展示文件夹名 + 父级缩写。 */
export function formatPathConflictPair(
  conflict: string,
  resolved: string,
): PathConflictDisplay {
  const conflictNorm = normalizeSeparators(conflict);
  const resolvedNorm = normalizeSeparators(resolved);

  const conflictParts = conflictNorm.split("\\").filter(Boolean);
  const resolvedParts = resolvedNorm.split("\\").filter(Boolean);

  if (conflictParts.length > 1 && resolvedParts.length > 1) {
    const conflictParent = conflictParts.slice(0, -1).join("\\");
    const resolvedParent = resolvedParts.slice(0, -1).join("\\");
    if (conflictParent.toLowerCase() === resolvedParent.toLowerCase()) {
      const fromName = conflictParts[conflictParts.length - 1];
      const toName = resolvedParts[resolvedParts.length - 1];
      return {
        from: fromName,
        to: toName,
        context: shortenPathForDisplay(conflictParent),
      };
    }
  }

  return {
    from: shortenPathForDisplay(conflict),
    to: shortenPathForDisplay(resolved),
  };
}

/** 拆成「前缀标签 + 路径段」，供首跑路径可视化。 */
export function splitPathForDisplay(path: string): PathDisplayParts {
  const short = shortenPathForDisplay(path);

  const envTail = short.match(/^(%[A-Z_]+%|~)(\\|\/)(.+)$/);
  if (envTail) {
    return {
      prefix: envTail[1],
      segments: envTail[3].split(/\\|\//).filter(Boolean),
    };
  }

  if (/^%[A-Z_]+%$/.test(short) || short === "~") {
    return { prefix: short, segments: [] };
  }

  return { segments: short.split(/\\|\//).filter(Boolean) };
}

/** 前缀标签后的相对路径（用反斜杠连接，供 UI 普通文本展示）。 */
export function pathTailForDisplay(path: string): string {
  const parts = splitPathForDisplay(path);
  if (parts.segments.length === 0) return "";
  return parts.segments.join("\\");
}

export function normalizePathForCompare(path: string): string {
  return path
    .trim()
    .replace(/\//g, "\\")
    .replace(/[\\]+$/, "")
    .toLowerCase();
}

export function pathsEqual(a: string, b: string): boolean {
  return normalizePathForCompare(a) === normalizePathForCompare(b);
}
