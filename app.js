var express = require('express');
var app = express();
var path = require('path');
//var routes = require('./api/routes');
var bodyParser = require('body-parser');

//App config
app.set('port', 3000);

app.use(function(req, res, next){
    console.log(req.method, req.url);
    next();
});

app.use(bodyParser.urlencoded({ extended : false }));

//Handling urls
//app.use('/projects', express.static(path.join(__dirname, 'projects')));
app.use(express.static(path.join(__dirname, 'public')));
//app.use('/api', routes);

var server = app.listen(app.get('port'), function(){
    var port = server.address().port;
    console.log('Magic happens on port ' + app.get('port'));
});