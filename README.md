## Anilist Plex Scrobbler
### What is it?
A simple nodejs app that listens for for webhook calls from Plex Media Server, more specifically the `media.scrobble` event.

Once it receives such event:
1. discard if not in wanted library (e.g. only grab the Anime library)
1. discard if not of media type episode
1. discard if not for the configure Plex Account
1. lookup the metadata agent to check if it's [com.plexapp.agents.hama](https://github.com/ZeroQI/Hama.bundle)
1. extract the anidb id from the show
1. cross reference the id using this [mapping file](https://github.com/meisnate12/Plex-Meta-Manager-Anime-IDs) to get an anilist id
1. if the show matching the anilist id is is in the **Watching** state, it will increase the progress.

### Installation
```bash
git clone https://github.com/sjorge/anilist-plex-scrobbler.git /opt/anilist-plex-scrobbler
cd /opt/anilist-plex-scrobbler
npm install
npm start -- --port 9001 --plex_account <account> --anilist_token <token>
```

### TODO
- [ ] cleanup Anilist API calls
- [ ] re-introduce mattermost notification on failures
- [ ] re-introduce mattermost notification on complete so you can rate the show 
- [ ] add a systemd unit
