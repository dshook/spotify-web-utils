var express       = require('express');
var dotenv        = require('dotenv');
var SpotifyApp    = require('./lib/spotify-app.js');
var app           = express();

dotenv.load();

var port = process.env.PORT || '8081';
var clientId = process.env.CLIENT_ID;
var clientSecret = process.env.CLIENT_SECRET;

var router = express.Router();
var spotifyApp = new SpotifyApp(port, clientId, clientSecret);

router.get('/auth', spotifyApp.authenticate.bind(spotifyApp));
router.get('/scrape', spotifyApp.scrape.bind(spotifyApp));
router.get('/coverify', spotifyApp.coverify.bind(spotifyApp));
router.get('/playlists', spotifyApp.playlists.bind(spotifyApp));


app.use('/spotify', router);

app.listen(port);
console.log('Magic happens on port ' + port);
exports = module.exports = app;
