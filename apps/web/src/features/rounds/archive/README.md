# Historical Lil Nouns rounds

Captured November 23, 2026 from the [Lil Nouns funding API](https://db.lilnouns.wtf/api/funding/rounds?state=ended&limit=100). Its [upstream importer](https://github.com/lilnounsDAO/lils-monorepo/blob/05dd89765c565b4da567eb16a6e575040c3c1fac/services/rounds-api/src/import.mjs) reads the [nouns.gg public archive](https://github.com/nouns-esports/nouns-gg/tree/main/data/public/v1) and surviving Prop House snapshots.

The index contains 8 nouns.gg and 10 Prop House rounds. Each handle file contains the proposals from GET /rounds/:handle and individual ballot records from GET /proposals/:id/votes?limit=500 grouped by proposal ID. The snapshot contains 192 proposals, 106 award slots and 1,691 ballot records. Vote weights can differ from ballot counts. Eight Prop House rounds retain metadata only.

Screens load the records from the frontend bundle. Historical images and linked content retain their original external URLs and may become unavailable.
