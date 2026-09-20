#!/usr/bin/env python3

import errno
import json
import os
import pty
import select
import sys
import time


def main() -> int:
    steps = json.load(sys.stdin)
    if len(sys.argv) < 2:
        raise SystemExit("usage: pty-run.py command [argument ...]")

    child, descriptor = pty.fork()
    if child == 0:
        os.execvpe(sys.argv[1], sys.argv[1:], os.environ)

    output = bytearray()
    step = 0
    deadline = time.monotonic() + 30

    def completed(status: int) -> int:
        if step != len(steps):
            print(f"PTY exited after {step} of {len(steps)} prompts", file=sys.stderr)
            return 2
        return os.waitstatus_to_exitcode(status)

    while time.monotonic() < deadline:
        readable, _, _ = select.select([descriptor], [], [], 0.1)
        if descriptor in readable:
            try:
                chunk = os.read(descriptor, 4096)
            except OSError as error:
                if error.errno == errno.EIO:
                    _, status = os.waitpid(child, 0)
                    return completed(status)
                raise
            if not chunk:
                _, status = os.waitpid(child, 0)
                return completed(status)
            output.extend(chunk)
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()

        text = output.decode("utf-8", errors="replace")
        if step < len(steps) and steps[step]["expect"] in text:
            os.write(descriptor, f'{steps[step]["send"]}\n'.encode())
            step += 1

        finished, status = os.waitpid(child, os.WNOHANG)
        if finished:
            return completed(status)

    try:
        os.kill(child, 9)
    except ProcessLookupError:
        pass
    os.waitpid(child, 0)
    print(f"PTY timed out after {step} of {len(steps)} prompts", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
