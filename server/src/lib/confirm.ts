export function requireUserConfirm(confirm: unknown, error: string): void {
  if (confirm !== true) {
    throw Object.assign(new Error(error), { code: "CONFIRM_REQUIRED", error });
  }
}

export function requireCommitConfirm(confirm: unknown): void {
  requireUserConfirm(confirm, "提交必须用户确认");
}

export function requireRunConfirm(confirm: unknown): void {
  requireUserConfirm(confirm, "运行命令必须用户确认");
}
