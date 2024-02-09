import tty from 'node:tty';
import process from 'node:process';

export function log(msg: string, type: "error" | "warn" | "step" | "done" | "info" = "info"): void {
    const useColor: boolean = tty.isatty(process.stdout.fd);
    const blank: number = process.stdout.columns ? (process.stdout.columns) : 0;
    switch(type) {
        case "error":
            if (useColor) {
                process.stderr.write(`\r${" ".repeat(blank)}\r[\x1b[31m!!\x1b[0m] ${msg}\n`);
            } else {
                process.stdout.write(`[EE] ${msg}\n`);
            }
            break;
        case "warn":
            if (useColor) {
                process.stdout.write(`\r${" ".repeat(blank)}\r[\x1b[33mWW\x1b[0m] ${msg}\n`);
            } else {
                process.stdout.write(`[WW] ${msg}\n`);
            }
            break;
        case "info":
            if (useColor) {
                process.stdout.write(`\r${" ".repeat(blank)}\r[\x1b[34mII\x1b[0m] ${msg}\n`);
            } else {
                process.stdout.write(`[II] ${msg}\n`);
            }
            break;
        case "done":
            if (useColor) {
                process.stdout.write(`\r${" ".repeat(blank)}\r[\x1b[32mOK\x1b[0m] ${msg}\n`);
            } else {
                process.stdout.write(`[OK] ${msg}\n`);
            }
            break;
        case "step":
            if (useColor) {
                process.stdout.write(`\r${" ".repeat(blank)}\r[\x1b[33m>>\x1b[0m] ${msg}`);
            } else {
                process.stdout.write(`[>>] ${msg}\n`);
            }
            break;
    }
}
