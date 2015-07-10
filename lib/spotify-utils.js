var _             = require('lodash');

export default class SpotifyUtils{
  constructor(spotifyApi){
    this.spotifyApi = spotifyApi;
  }

  //grab a playlist if it exists, create if not
  async fetchOrCreatePlaylist(userId, playlistName, playlistOptions){
      var playlistData = await this.spotifyApi.getUserPlaylists(userId);
      var playlist = null;
      playlistOptions = playlistOptions || {public: false};

      if(playlistData.body.items.length > 0){
        for (var i = playlistData.body.items.length - 1; i >= 0; i--) {
          var p = playlistData.body.items[i];
          if(p.name === playlistName){
            playlist = p;
            break;
          }
        }
      }
      if(playlist){
        return playlist;
      }

      //create playlist if we couldn't find it
      var playlistResult = await this.spotifyApi.createPlaylist(userId, playlistName, playlistOptions);
      playlist = playlistResult.body;

      return playlist;
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

  async searchTracks(term){
    var playlistSongs = [];
    var offset = 0;
    var limit = 50;
    var tracksFetched = 0;
    do{
      var searchResults = await this.spotifyApi.searchTracks(term, 
        { 
          'offset' : offset,
          'limit' : limit,
          'fields' : 'items(track(id,name,album(name,href),artists(name,href)))' 
        });

      tracksFetched = searchResults.body.tracks.items.length;
      console.log(`Found ${tracksFetched} playlist tracks `);
      offset += tracksFetched;
      playlistSongs = playlistSongs.concat(searchResults.body.tracks.items);

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
      throw e;
    }

    return songsToAdd.length;
  }

  //Adds new songs to a playlist without duplicating them
  //pass existingSongIds in if you have already fetched the playlist songs,
  //otherwise they will be fetched for you
  async addUniquePlaylistSongs(userId, playlistId, newSongIds, existingSongs){
    if(!existingSongs){
      existingSongs = await this.fetchPlaylistSongs(userId, playlistId);
    }

    var actualNewSongs = [];
    //find new tracks
    for(let potentialNewSong of newSongIds){
      if(!_.any(existingSongs, s => s.track.id === potentialNewSong.id) ){
        actualNewSongs.push(potentialNewSong);
      }
    }

    var trackIds = actualNewSongs
      .filter(function(m){ return m && m.id; })
      .map(function(m){
        return m.id;
      });

    var playlistAdd = await this.addPlaylistSongs(userId, playlistId, trackIds);
    return actualNewSongs;
  }
}
