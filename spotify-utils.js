export default class SpotifyUtils{
  constructor(spotifyApi){
    this.spotifyApi = spotifyApi;
  }

  async fetchPlaylistSongs(userId, playlistId){
    var playlistSongs = [];
    var offset = 0;
    var limit = 100;
    var tracksFetched = 0;
    do{
      var playlistTrackData = await this.spotifyApi.getPlaylistTracks(userId, playlistId, 
        { 'offset' : offset, 'limit' : limit, 'fields' : 'items(track(id,name))' });

      tracksFetched = playlistTrackData.body.items.length;
      console.log(`fetched ${tracksFetched} playlist tracks `);
      offset += tracksFetched;
      playlistSongs = playlistSongs.concat(playlistTrackData.body.items);

    }while(tracksFetched === limit);

    return playlistSongs;
  }
}
