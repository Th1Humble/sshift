export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[], options?: { timeoutMs?: number }) => Promise<CommandResult>;

export const runCommand: CommandRunner = async (command, args, options) => {
  const proc = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = options?.timeoutMs ? setTimeout(() => { timedOut = true; proc.kill(); }, options.timeoutMs) : undefined;
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
    ]);
    return { exitCode, stdout, stderr: timedOut ? `${stderr}\nCommand timed out.` : stderr };
  } finally {
    if (timer) clearTimeout(timer);
  }
};
