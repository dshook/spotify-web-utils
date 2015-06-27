var _             = require('lodash');

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
        { 
          'offset' : offset,
          'limit' : limit,
          'fields' : 'items(track(id,name,album(name,href),artists(name,href)))' 
        });

      tracksFetched = playlistTrackData.body.items.length;
      console.log(`fetched ${tracksFetched} playlist tracks `);
      offset += tracksFetched;
      playlistSongs = playlistSongs.concat(playlistTrackData.body.items);

    }while(tracksFetched === limit);

    return playlistSongs;
  }

  async addPlaylistSongs(userId, playlistId, songIds){
    var songsToAdd = songIds.map(m => 'spotify:track:' + m);
    var limit = 50;
    var songSlice;

    try{
      for(var offset = 0; offset <= songsToAdd.length; offset += limit ){
        let chunkEnd = Math.min(offset + limit, songsToAdd.length);
        songSlice = _.slice(songsToAdd, offset, chunkEnd);
        console.log('slice length ' + songSlice.length + ' offset ' + offset + ' chunk end ' + chunkEnd);
        await this.spotifyApi.addTracksToPlaylist(userId, playlistId, songSlice);
      }
    }catch(e){
      console.log('Error adding to playlist', e, songSlice); 
      console.log('user ' + userId + ' playlist ' + playlistId);
      throw e;
    }

    return songsToAdd.length;
  }
}
