var express      = require('express');
var dotenv       = require('dotenv');
var SpotifyApp   = require('./lib/spotify-app.js');
var app          = express();
var cookieParser = require('cookie-parser');

dotenv.load();
app.use(cookieParser('test'));

var port = process.env.PORT || '8081';
var clientId = process.env.CLIENT_ID;
var clientSecret = process.env.CLIENT_SECRET;

var router = express.Router();
var spotifyApp = new SpotifyApp(clientId, clientSecret);

router.get('/auth', spotifyApp.authenticate.bind(spotifyApp));
router.get('/scrape', spotifyApp.scrape.bind(spotifyApp));
router.get('/coverify', spotifyApp.coverify.bind(spotifyApp));
router.get('/supafy', spotifyApp.supafy.bind(spotifyApp));
router.get('/playlists', spotifyApp.playlists.bind(spotifyApp));


app.use('/', router);

app.listen(port);
console.log('Magic happens on port ' + port);
exports = module.exports = app;
