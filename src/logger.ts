export function log(msg: string, type: "error" | "warn" | "step" | "done" | "info" = "info"): void {
    const blank: number = process.stdout.columns ? (process.stdout.columns) : 0;
    switch(type) {
        case "error":
            process.stderr.write(`\r${" ".repeat(blank)}\r[\x1b[31m!!\x1b[0m] ${msg}\n`);
            break;
        case "warn":
            process.stdout.write(`\r${" ".repeat(blank)}\r[\x1b[33mWW\x1b[0m] ${msg}\n`);
            break;
        case "info":
            process.stdout.write(`\r${" ".repeat(blank)}\r[\x1b[34mII\x1b[0m] ${msg}\n`);
            break;
        case "done":
            process.stdout.write(`\r${" ".repeat(blank)}\r[\x1b[32mOK\x1b[0m] ${msg}\n`);
            break;
        case "step":
            process.stdout.write(`\r${" ".repeat(blank)}\r[\x1b[33m>>\x1b[0m] ${msg}`);
            break;
    }
}
