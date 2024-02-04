#!/usr/bin/env node
import { program } from '@commander-js/extra-typings';
import { configureAction } from './configure';
import { webhookAction } from './webhook';

program
    .name("anidb-watched-sync")
    .version("1.0.0")
    .description("Webhook for syncronizing plex and jellyfin watch status for anidb tagged episodes.");

program
    .command('configure')
    .description('update configuration file')
    .option('--webhook-bind <ip>', 'optional IP where webhook binds on (default to localhost)')
    .option('--webhook-port <port>', 'optional port where webhook binds on (default to 4091)')
    .option('--anilist-token <token>', 'your anilist http client token use for scrobbling')
    .option('--jellyfin-url <url>', 'jellyfin server URL')
    .option('--jellyfin-api-key <api_key>', 'jellyfin API key')
    .option('--jellyfin-ca-file <ca_file>', 'optional CA file for jellyfin')
    .option('--jellyfin-library <library>', 'jellyfin anime library name')
    .option('--jellyfin-user <username>', 'jellyfin username')
    .option('--plex-url <url>', 'plex server URL')
    .option('--plex-token <token>', 'plex token')
    .option('--plex-library <library>', 'plex anime library name')
    .option('--plex-user <username>', 'plex username')
    .action(configureAction);

program
    .command('webhook')
    .description('Start the webhook server')
    .action(webhookAction);

program.parse(process.argv);

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
