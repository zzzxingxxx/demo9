import path from "node:path";

export type PathError = Error & { code: string; error: string };

export function pathError(code: string, message: string): PathError {
  const err = new Error(message) as PathError;
  err.code = code;
  err.error = message;
  return err;
}

export function resolveInside(root: string, rel = "."): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, rel);
  const relative = path.relative(resolvedRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw pathError("PATH_ESCAPE", "路径超出项目目录");
  }
  return target;
}

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
