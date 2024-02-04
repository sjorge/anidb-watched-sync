import { OptionValues } from '@commander-js/extra-typings';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import toml from '@iarna/toml';
import { deepmerge } from 'deepmerge-ts';


export type Config = {
    webhook: {
        bind: string;
        port: number;
    },
    anilist: {
        token?: string;
    };
    jellyfin: {
        url?: string;
        apiKey?: string;
        caFile?: string;
        library?: string;
        user?: string;
    };
    plex: {
        url?: string;
        token?: string;
        library?: string;
        user?: string;
    };
};

const configFile: string = path.join(os.homedir(), '.config', 'pjaws', 'config.toml');

export function readConfig(): Config {
    let config: Config = {
        webhook: {
            bind: 'localhost',
            port: 4091,
        },
        anilist: {},
        jellyfin: {},
        plex: {},
    };

    if(fs.existsSync(configFile) && fs.statSync(configFile).isFile()) {
        const configToml = toml.parse(fs.readFileSync(configFile, 'utf8')) as Config;
        config = deepmerge(config, configToml);
    }

    return config;
}

function writeConfig(config: Config): boolean {
    try {
        const configFilePath: string = path.dirname(configFile);
        if(!fs.existsSync(configFilePath)) {
            fs.mkdirSync(configFilePath, { recursive: true, mode: 0o750 });
        }
        fs.writeFileSync(configFile, toml.stringify(config), { encoding: 'utf8' });
        fs.chmodSync(configFile, 0o600);
    } catch (error) {
        return false;
    }

    return true;
}

export async function configureAction(opts: OptionValues): Promise<void> {
    const config: Config = readConfig();
    if (opts.webhookBind) config.webhook.bind = `${opts.webhookBind}`;
    if (opts.webhookPort) config.webhook.port = parseInt(`${opts.webhookPort}`);
    if (opts.anilistToken) config.anilist.token = `${opts.anilistToken}`;
    if (opts.jellyfinUrl) config.jellyfin.url = `${opts.jellyfinUrl}`;
    if (opts.jellyfinApiKey) config.jellyfin.apiKey = `${opts.jellyfinApiKey}`;
    if (opts.jellyfinCaFile) config.jellyfin.caFile = `${opts.jellyfinCaFile}`;
    if (opts.jellyfinLibrary) config.jellyfin.library = `${opts.jellyfinLibrary}`;
    if (opts.jellyfinUser) config.jellyfin.user = `${opts.jellyfinUser}`;
    if (opts.plexUrl) config.plex.url = `${opts.plexUrl}`;
    if (opts.plexToken) config.plex.token = `${opts.plexToken}`;
    if (opts.plexLibrary) config.plex.library = `${opts.plexLibrary}`;
    if (opts.plexUser) config.plex.user = `${opts.plexUser}`;
    if(!writeConfig(config)) {
        console.error(`Failed to update ${configFile}!`);
        process.exitCode = 1;
    }
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
