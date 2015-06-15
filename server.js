var express = require('express');
var request = require('request');
var cheerio = require('cheerio');
var app     = express();
var SpotifyWebApi = require('spotify-web-api-node');

app.get('/scrape', function(req, res){
	// Let's scrape Anchorman 2
	var url = 'http://www.quuit.com/quu/playlist/177';

	request(url, function(error, response, html){
		if(!error){
			var $ = cheerio.load(html);
			var songs = [];

			$('ul#ulPlaylist>li').each(function(){
		        var data = $(this);
		        songs.push({
			        title: data.find('a.playlist-music').first().text(),
			        artist: data.find('.music-desc label').first().text()
		        });
	        });
		}

		var spotifyApi = new SpotifyWebApi({
		  clientId : '37dac1af51a649edb145a563eaa4d02a',
		  clientSecret : '0ca26311c6334afb90f854833a79c754',
		  redirectUri : 'http://www.example.com/callback'
		});

		// The code that's returned as a query parameter to the redirect URI 
		var code = 'MQCbtKe23z7YzzS44KzZzZgjQa621hgSzHN';
		 
		// Retrieve an access token and a refresh token 
		spotifyApi.authorizationCodeGrant(code)
		  .then(function(data) {
		    console.log('The token expires in ' + data.body.expires_in);
		    console.log('The access token is ' + data.body.access_token);
		    console.log('The refresh token is ' + data.body.refresh_token);
		 
		    // Set the access token on the API object to use it in later calls 
		    spotifyApi.setAccessToken(data.body.access_token);
		    spotifyApi.setRefreshToken(data.body.refresh_token);
		  }, function(err) {
		    console.log('Something went wrong!', err);
		  });

    res.json(songs);
	});
});

app.listen('8081');
console.log('Magic happens on port 8081');
exports = module.exports = app;
