var util = {
  'parseRequest':function(req){
    var _req = {};
    _req['params'] = req.body;
    var path = req.path.split('/');
    _req['action'] = path[1];
    _req['endpt'] = path[2];
    _req['path'] = path.slice(3,path.length)
  }
}

module.exports.parseRequest = util.parseRequest;
